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

export default function App() {
  const { message } = AntdApp.useApp();
  const { status, setStatus } = useCallStore();
  const [latencyMs] = useState<number | null>(null);
  const wsRef = useRef<RealtimeWsClient | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<Pcm24Player | null>(null);
  const sessionReadyRef = useRef(false);
  const isAiSpeakingRef = useRef(false); // 跟踪AI是否正在说话

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
              console.log('📨 收到消息:', msg.type);
              if (msg.delta) console.log('  delta:', msg.delta);
              if (msg.transcript) console.log('  transcript:', msg.transcript);
              if (msg.text) console.log('  text:', msg.text);
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
                    onUserSpeaking: () => {
                      // 当用户开始说话时，如果AI正在说话，立即打断
                      if (isAiSpeakingRef.current) {
                        console.log('用户打断，停止AI播放');
                        playerRef.current?.stopAll();
                        // 发送取消响应命令给服务器
                        wsRef.current?.sendJson({ 
                          type: 'response.cancel',
                          event_id: eid()
                        });
                        isAiSpeakingRef.current = false;
                        setStatus('listening');
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
              // 用户开始说话
              console.log('用户开始说话');
            } else if (msg?.type === 'input_audio_buffer.speech_stopped') {
              // 用户停止说话，等待转录完成
              console.log('用户停止说话');
            } else if (msg?.type === 'input_audio_buffer.committed') {
              // 音频已提交到服务端
              console.log('音频已提交');
            } else if (msg?.type === 'conversation.item.input_audio_transcription.delta' && msg?.delta) {
              // 用户输入音频转录（流式）- Qwen会通过gummy-realtime-v1模型转录
              console.log('用户输入（delta）:', msg.delta);
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'user');
            } else if (msg?.type === 'conversation.item.input_audio_transcription.completed') {
              // 用户输入音频转录完成 - Qwen返回完整的transcript
              const transcript = msg?.transcript || '';
              console.log('用户转录完成:', transcript);
              if (transcript) {
                // 直接创建完整的用户消息
                useCallStore.getState().addSubtitle({ 
                  role: 'user', 
                  text: transcript,
                  isComplete: true 
                });
              }
            } else if (msg?.type === 'response.output_item.added') {
              // 响应输出项添加
              console.log('响应输出项添加');
            } else if (msg?.type === 'response.content_part.added') {
              // 新的输出内容添加
              console.log('新的输出内容添加');
            } else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
              // ⚠️ Qwen实际情况：audio_transcript 就是对话内容！
              // 虽然文档说这是TTS转录，但实际返回的是对话文本
              console.log('AI回复（audio_transcript）:', msg.delta);
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
              setStatus('speaking');
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.audio_transcript.done') {
              // AI语音转录完成
              console.log('AI语音转录完成');
            } else if (msg?.type === 'response.text.delta' && msg?.delta) {
              // AI文本回复（流式）- 备用
              console.log('AI回复（text.delta）:', msg.delta);
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
              setStatus('speaking');
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.text.done') {
              // AI文本回复完成
              console.log('AI文本回复完成');
            } else if (msg?.type === 'response.content_part.done') {
              // 内容部分完成
              console.log('内容部分完成');
            } else if (msg?.type === 'response.output_item.done') {
              // 输出项完成
              console.log('输出项完成');
            } else if (msg?.type === 'response.audio.delta' && msg?.delta) {
              const p = (playerRef.current ??= new Pcm24Player());
              if (msg?.sample_rate_hz) p.setSampleRateHz(msg.sample_rate_hz);
              p.playBase64Pcm24(msg.delta);
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.done' || msg?.type === 'response.cancelled') {
              // AI完成响应或被取消
              useCallStore.getState().markLastSubtitleComplete();
              isAiSpeakingRef.current = false;
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
      sessionReadyRef.current = false;
      isAiSpeakingRef.current = false;
    } finally {
      setStatus('ended');
    }
  }

  // 临时测试函数 - 手动添加消息测试UI
  function testAddMessage() {
    useCallStore.getState().appendToLastSubtitle('测试用户消息', 'user');
    useCallStore.getState().markLastSubtitleComplete();
    setTimeout(() => {
      useCallStore.getState().appendToLastSubtitle('测试AI回复', 'assistant');
      useCallStore.getState().markLastSubtitleComplete();
    }, 500);
  }

  return (
    <Flex vertical align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      <Space direction="vertical" align="center" size={16} style={{ width: '100%', maxWidth: 960 }}>
        {/* Top Bar */}
        <Flex align="center" justify="space-between" style={{ width: '100%' }}>
          <Title level={4} style={{ margin: 0 }}>DeepCall</Title>
          <Space>
            <Badge status={statusInfo.color} text={statusInfo.text} />
            <Text type="secondary">{latencyMs ? `${latencyMs} ms` : ''}</Text>
            <DeviceSelector />
          </Space>
        </Flex>

        {/* Main Panel */}
        <Card className="glass-card" style={{ width: '100%' }} styles={{ body: { padding: 24 } }}>
          <Flex align="center" justify="center" vertical gap={16}>
            {status === 'idle' || status === 'ended' ? (
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                <CallButton onStart={startCall} />
              </motion.div>
            ) : (
              <>
                <SpeakingAvatar status={status} />
                <SubtitlePanel />
              </>
            )}
          </Flex>
        </Card>

        <Space>
          <Button type="link">历史记录</Button>
          <Button type="link">设置</Button>
          {/* 临时测试按钮 */}
          <Button type="link" onClick={testAddMessage} style={{ color: '#ff4d4f' }}>
            测试添加消息
          </Button>
        </Space>
      </Space>
      {/* Floating bottom controls (during call) */}
      {status !== 'idle' && status !== 'ended' ? <ControlBar onHangup={hangup} /> : null}
    </Flex>
  );
}


