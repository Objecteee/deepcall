import { useRef, useState, useMemo } from 'react';
import { App as AntdApp, Button, Card, Flex, Typography, Space, Badge } from 'antd';
import { motion } from 'framer-motion';
import CallButton from '@components/CallButton';
import SubtitlePanel from '@components/SubtitlePanel';
import ControlBar from '@components/ControlBar';
import DeviceSelector from '@components/DeviceSelector';
// import AudioVisualizer from '@components/AudioVisualizer';
import { useCallStore } from '@store/callStore';
import SpeakingAvatar from '@components/SpeakingAvatar';
import { RealtimeWsClient } from '@rtc/RealtimeWsClient';
import { AudioStreamer } from '@rtc/AudioStreamer';
import { Pcm24Player } from '@rtc/PcmPlayer';

const { Title, Text } = Typography;

function eid() { return 'event_' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

// Debug助手 - 生产环境可通过设置为false来禁用
const DEBUG = true; // 开发时设为true，生产时改为false
const log = (...args: any[]) => DEBUG && console.log(...args);

export default function App() {
  const { message } = AntdApp.useApp();
  const { status, setStatus } = useCallStore();
  const [latencyMs] = useState<number | null>(null);
  const wsRef = useRef<RealtimeWsClient | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<Pcm24Player | null>(null);
  const sessionReadyRef = useRef(false);
  const isAiSpeakingRef = useRef(false); // 跟踪AI是否正在说话
  const currentResponseIdRef = useRef<string | null>(null); // 当前响应ID
  const shouldIgnoreAudioRef = useRef(false); // 是否应该忽略音频（打断后）

  const statusInfo = useMemo(() => {
    switch (status) {
      case 'idle':
        return { text: '就绪', color: 'default' as const };
      case 'connecting':
        return { text: '连接中', color: 'processing' as const };
      case 'listening':
        return { text: 'Listening', color: 'success' as const };
      case 'thinking':
        return { text: 'Thinking', color: 'warning' as const };
      case 'speaking':
        return { text: 'Speaking', color: 'error' as const };
      case 'ended':
        return { text: '已结束', color: 'default' as const };
    }
  }, [status]);

  async function startCall() {
    try {
      setStatus('connecting');
      useCallStore.getState().clearSubtitles();

      const sess = await fetch('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen3-omni-flash-realtime', voice: 'Cherry' }) }).then(r => r.json());

      const ws = new RealtimeWsClient({
        onOpen: () => {
          setStatus('listening');
          message.success('已连接实时服务');
        },
        onClose: (code) => {
          message.warning(`实时服务断开${code ? ` (code ${code})` : ''}`);
          setStatus('idle');
        },
        onError: () => {
          message.error('实时服务连接出错');
          setStatus('idle');
        },
        onMessage: async (msg) => {
          try {
            // Debug: 打印所有接收到的消息类型
            if (msg?.type) {
              log('📨 收到消息:', msg.type);
              if (msg.delta) log('  delta:', msg.delta);
              if (msg.transcript) log('  transcript:', msg.transcript);
              if (msg.text) log('  text:', msg.text);
            }
            
            if (msg?.type === 'session.created') {
              // switch to server-side VAD to avoid continuous replies
              wsRef.current?.sendJson({
                type: 'session.update',
                event_id: eid(),
                session: {
                  // 输出模态：文本和音频
                  output_modalities: ['TEXT', 'AUDIO'],
                  // 音色
                  voice: sess.realtime?.voice || 'Cherry',
                  // 输入音频格式（固定）
                  input_audio_format: 'PCM_16000HZ_MONO_16BIT',
                  // 输出音频格式（固定）
                  output_audio_format: 'PCM_24000HZ_MONO_16BIT',
                  // 系统指令
                  instructions: '请始终用中文回答。',
                  // 启用输入音频转录（使用gummy模型）
                  enable_input_audio_transcription: true,
                  input_audio_transcription_model: 'gummy-realtime-v1',
                  // 启用服务端VAD（自动检测语音起止）
                  enable_turn_detection: true,
                  turn_detection_type: 'server_vad',
                  turn_detection_threshold: 0.2,
                  turn_detection_silence_duration_ms: 800,
                  // 口语化输出（true=口语化，false=书面化，null=自动）
                  smooth_output: true,
                },
              });
            } else if (msg?.type === 'session.updated') {
              if (!sessionReadyRef.current) {
                sessionReadyRef.current = true;
                try {
                  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
                  const streamer = new AudioStreamer({ 
                    sendJson: (payload) => wsRef.current?.sendJson(payload), 
                    mode: 'vad', 
                    appendMs: 100,
                    // ⚠️ 禁用客户端VAD打断功能，避免误触发
                    // 改用服务端VAD（turn_detection），更准确且不会被AI音频干扰
                    enableClientVAD: false,
                    onUserSpeaking: () => {
                      // 当用户开始说话时，如果AI正在说话，立即打断
                      if (isAiSpeakingRef.current) {
                        log('⚠️ 用户打断AI，停止播放');
                        playerRef.current?.stopAll();
                        // 发送取消响应命令给服务器
                        wsRef.current?.sendJson({ 
                          type: 'response.cancel',
                          event_id: eid()
                        });
                        isAiSpeakingRef.current = false;
                        setStatus('listening');
                      } else {
                        log('ℹ️ 检测到用户说话（AI未在说话）');
                      }
                    }
                  });
                  streamerRef.current = streamer;
                  await streamer.start(mic);
                } catch (err: any) {
                  message.error(`麦克风不可用：${err?.message || '权限被拒绝'}`);
                  setStatus('idle');
                }
              }
            } else if (msg?.type === 'input_audio_buffer.speech_started') {
              // 用户开始说话 - 立即停止AI音频播放并忽略后续音频包
              log('🎤 用户开始说话，停止AI音频播放');
              // ⚠️ 无论AI是否在说话，都要停止播放（防止延迟）
              playerRef.current?.stopAll(); // 清空音频播放队列
              shouldIgnoreAudioRef.current = true; // 忽略后续音频包
              isAiSpeakingRef.current = false;
              setStatus('listening');
            } else if (msg?.type === 'input_audio_buffer.speech_stopped') {
              // 用户停止说话，等待转录完成
              log('用户停止说话');
            } else if (msg?.type === 'input_audio_buffer.committed') {
              // 音频已提交到服务端
              log('音频已提交');
            } else if (msg?.type === 'conversation.item.input_audio_transcription.delta' && msg?.delta) {
              // 用户输入音频转录（流式）- Qwen会通过gummy-realtime-v1模型转录
              log('用户输入（delta）:', msg.delta);
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'user');
            } else if (msg?.type === 'conversation.item.input_audio_transcription.completed') {
              // 用户输入音频转录完成 - Qwen返回完整的transcript
              const transcript = msg?.transcript || '';
              log('用户转录完成:', transcript);
              if (transcript) {
                // 直接创建完整的用户消息
                useCallStore.getState().addSubtitle({ 
                  role: 'user', 
                  text: transcript,
                  isComplete: true 
                });
              }
            } else if (msg?.type === 'response.created') {
              // 新的响应创建 - 重置忽略标志，准备接收新音频
              log('🎬 新响应创建');
              shouldIgnoreAudioRef.current = false; // 允许播放新响应的音频
            } else if (msg?.type === 'response.output_item.added') {
              // 新的响应输出项添加
              log('📝 响应输出项添加');
            } else if (msg?.type === 'response.content_part.added') {
              // 新的输出内容添加
              log('新的输出内容添加');
            } else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
              // ⚠️ Qwen实际情况：audio_transcript 就是对话内容！
              // 虽然文档说这是TTS转录，但实际返回的是对话文本
              log('AI回复（audio_transcript）:', msg.delta);
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
              setStatus('speaking');
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.audio_transcript.done') {
              // AI语音转录完成
              log('AI语音转录完成');
            } else if (msg?.type === 'response.text.delta' && msg?.delta) {
              // AI文本回复（流式）- 备用
              log('AI回复（text.delta）:', msg.delta);
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
              setStatus('speaking');
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.text.done') {
              // AI文本回复完成
              log('AI文本回复完成');
            } else if (msg?.type === 'response.content_part.done') {
              // 内容部分完成
              log('内容部分完成');
            } else if (msg?.type === 'response.output_item.done') {
              // 输出项完成
              log('输出项完成');
            } else if (msg?.type === 'response.audio.delta' && msg?.delta) {
              // 如果标记为忽略音频，跳过播放（打断后可能还会收到旧的音频包）
              if (shouldIgnoreAudioRef.current) {
                log('⏭️ 忽略打断后的音频包');
                return;
              }
              const p = (playerRef.current ??= new Pcm24Player());
              if (msg?.sample_rate_hz) p.setSampleRateHz(msg.sample_rate_hz);
              p.playBase64Pcm24(msg.delta);
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.done') {
              // AI完成响应
              log('✅ AI响应完成');
              useCallStore.getState().markLastSubtitleComplete();
              isAiSpeakingRef.current = false;
              shouldIgnoreAudioRef.current = false; // 重置忽略标志
              setStatus('listening');
            } else if (msg?.type === 'response.cancelled') {
              // AI响应被取消（打断）- 立即停止音频播放
              log('❌ AI响应被取消（打断）');
              playerRef.current?.stopAll(); // 立即清空播放队列
              useCallStore.getState().markLastSubtitleComplete();
              isAiSpeakingRef.current = false;
              shouldIgnoreAudioRef.current = true; // 继续忽略后续可能到达的音频包
              setStatus('listening');
            } else if (msg?.type === 'upstream.close') {
              message.warning(`上游关闭: code=${msg.code} reason=${msg.reason || ''}`);
              setStatus('idle');
              isAiSpeakingRef.current = false;
            } else if (msg?.type === 'error') {
              message.error(msg?.error?.message || '模型错误');
              setStatus('idle');
              isAiSpeakingRef.current = false;
            }
          } catch {}
        },
      });
      wsRef.current = ws;
      ws.connect(sess.realtime?.model || 'qwen3-omni-flash-realtime', sess.realtime?.voice || 'Cherry');
    } catch (e: any) {
      console.error(e);
      message.error(`建立连接失败：${e.message || '未知错误'}`);
      setStatus('idle');
    }
  }

  async function hangup() {
    try {
      wsRef.current?.close();
      await streamerRef.current?.stop();
      playerRef.current?.stopAll();
      // 清理所有refs状态
      sessionReadyRef.current = false;
      isAiSpeakingRef.current = false;
      shouldIgnoreAudioRef.current = false;
      currentResponseIdRef.current = null;
    } finally {
      setStatus('ended');
    }
  }

  return (
    <div style={{ 
      // 整个应用是一个标准的全屏单页：高度固定为一屏，由内部 flex 自行分配空间
      minHeight: '100vh',
      height: '100vh',
      display: 'flex', 
      flexDirection: 'column', 
      background: '#fafbfc',
      position: 'relative',
      // 隐藏所有溢出，由 Avatar 区域和聊天区域的 flex + 内部滚动来保证内容不会被裁切
      overflow: 'hidden'
    }}>
      {/* 背景装饰 */}
      <div style={{
        position: 'absolute',
        top: -200,
        left: -200,
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(102, 126, 234, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      <div style={{
        position: 'absolute',
        bottom: -200,
        right: -200,
        width: 600,
        height: 600,
        background: 'radial-gradient(circle, rgba(118, 75, 162, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      {/* Header */}
      <header style={{ 
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '16px 32px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(10px)',
        position: 'sticky',
        top: 0,
        zIndex: 20
      }}>
        <Flex align="center" justify="space-between" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Flex align="center" gap={10}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontWeight: 700,
              fontSize: 16,
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}>
              D
            </div>
            <Title level={4} style={{ margin: 0, fontWeight: 600, fontSize: 18 }}>DeepCall</Title>
          </Flex>
          <Space size={16}>
            <Badge status={statusInfo.color} text={statusInfo.text} />
            {latencyMs && <Text type="secondary" style={{ fontSize: 13 }}>{latencyMs} ms</Text>}
            <DeviceSelector />
          </Space>
        </Flex>
      </header>

      {/* Main Content */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '0 24px', 
        position: 'relative', 
        zIndex: 2,
        // 关键：允许子元素在flex容器中正确计算高度，避免产生额外滚动条
        minHeight: 0
      }}>
        <div style={{ 
          maxWidth: 900, 
          width: '100%', 
          margin: '0 auto', 
          display: 'flex', 
          flexDirection: 'column',
          flex: 1,
          minHeight: 0
        }}>
          {status === 'idle' || status === 'ended' ? (
            // Welcome Screen
            <motion.div 
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{ 
                flex: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                padding: '80px 24px'
              }}
            >
              <Space direction="vertical" align="center" size={32} style={{ width: '100%' }}>
                {/* Hero Section */}
                <Space direction="vertical" align="center" size={20}>
                  <Title level={1} style={{ 
                    margin: 0, 
                    fontSize: 56, 
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    letterSpacing: '-0.02em'
                  }}>
                    DeepCall AI
                  </Title>
                  <Text style={{ 
                    fontSize: 20, 
                    color: '#64748b',
                    textAlign: 'center',
                    maxWidth: 560,
                    lineHeight: 1.6
                  }}>
                    实时语音对话，自然流畅交互
                  </Text>
                  <Text style={{ 
                    fontSize: 15, 
                    color: '#94a3b8',
                    textAlign: 'center',
                    maxWidth: 480
                  }}>
                    支持智能打断 · 多轮对话 · 实时字幕显示
                  </Text>
                </Space>

                {/* Call Button */}
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }} 
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, duration: 0.4 }}
                  style={{ marginTop: 32 }}
                >
                  <CallButton onStart={startCall} label="开始对话" />
                </motion.div>

                {/* Feature Cards */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.5 }}
                  style={{ marginTop: 64, width: '100%', maxWidth: 840 }}
                >
                  <Flex gap={20} wrap="wrap" justify="center">
                    <motion.div whileHover={{ y: -4 }} style={{ flex: '1 1 240px', minWidth: 240 }}>
                      <Card 
                        style={{ 
                          height: '100%',
                          borderRadius: 16,
                          border: '1px solid rgba(0, 0, 0, 0.06)',
                          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                          transition: 'all 0.3s ease',
                          background: '#fff'
                        }}
                        styles={{ body: { padding: 24 } }}
                      >
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <div style={{ 
                            fontSize: 32, 
                            marginBottom: 4,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                          }}>
                            🎙️
                          </div>
                          <Text strong style={{ fontSize: 16, display: 'block' }}>实时对话</Text>
                          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                            自然流畅的语音交互体验
                          </Text>
                        </Space>
                      </Card>
                    </motion.div>
                    <motion.div whileHover={{ y: -4 }} style={{ flex: '1 1 240px', minWidth: 240 }}>
                      <Card 
                        style={{ 
                          height: '100%',
                          borderRadius: 16,
                          border: '1px solid rgba(0, 0, 0, 0.06)',
                          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                          transition: 'all 0.3s ease',
                          background: '#fff'
                        }}
                        styles={{ body: { padding: 24 } }}
                      >
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <div style={{ 
                            fontSize: 32, 
                            marginBottom: 4,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                          }}>
                            ⚡
                          </div>
                          <Text strong style={{ fontSize: 16, display: 'block' }}>智能打断</Text>
                          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                            随时打断AI回应，精准控制
                          </Text>
                        </Space>
                      </Card>
                    </motion.div>
                    <motion.div whileHover={{ y: -4 }} style={{ flex: '1 1 240px', minWidth: 240 }}>
                      <Card 
                        style={{ 
                          height: '100%',
                          borderRadius: 16,
                          border: '1px solid rgba(0, 0, 0, 0.06)',
                          boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                          transition: 'all 0.3s ease',
                          background: '#fff'
                        }}
                        styles={{ body: { padding: 24 } }}
                      >
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                          <div style={{ 
                            fontSize: 32, 
                            marginBottom: 4,
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent'
                          }}>
                            💬
                          </div>
                          <Text strong style={{ fontSize: 16, display: 'block' }}>实时字幕</Text>
                          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                            对话内容同步文字显示
                          </Text>
                        </Space>
                      </Card>
                    </motion.div>
                  </Flex>
                </motion.div>
              </Space>
            </motion.div>
          ) : (
            // Call Screen - 占满剩余空间，由内部flex控制布局
            <div
              style={{ 
                width: '100%',
                flex: 1,
                minHeight: 0,
                paddingTop: 32,
                paddingBottom: 140, // 为底部控制条预留空间
                display: 'flex',
                flexDirection: 'column',
                gap: 20
              }}
            >
              {/* Avatar - 固定尺寸，不会被挤压 */}
              <div style={{ flexShrink: 0, flexGrow: 0 }}>
                <Flex justify="center">
                  <SpeakingAvatar status={status} />
                </Flex>
              </div>
              
              {/* Chat Panel - 占满剩余高度，内部自己滚动 */}
              <div style={{ 
                width: '100%', 
                flex: 1,
                minHeight: 0
              }}>
                <SubtitlePanel />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer Links - Only show when idle */}
      {(status === 'idle' || status === 'ended') && (
        <footer style={{ 
          padding: '24px 32px',
          borderTop: '1px solid rgba(0, 0, 0, 0.06)',
          background: 'rgba(255, 255, 255, 0.95)',
          position: 'relative',
          zIndex: 2
        }}>
          <Flex justify="center" gap={24}>
            <Button type="link" style={{ color: '#64748b' }}>历史记录</Button>
            <Button type="link" style={{ color: '#64748b' }}>设置</Button>
          </Flex>
        </footer>
      )}

      {/* Floating bottom controls (during call) */}
      {status !== 'idle' && status !== 'ended' && <ControlBar onHangup={hangup} />}
    </div>
  );
}


