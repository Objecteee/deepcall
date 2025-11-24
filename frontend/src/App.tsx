import { useRef, useState, useMemo } from 'react';
import { App as AntdApp, Flex, Typography, Space, Badge, Button } from 'antd';
import { useCallStore } from '@store/callStore';
import { RealtimeWsClient } from '@rtc/RealtimeWsClient';
import { AudioStreamer } from '@rtc/AudioStreamer';
import { Pcm24Player } from '@rtc/PcmPlayer';
import { eid } from '@utils/eid';
import { log } from '@utils/logger';

// Components
import WelcomeScreen from '@components/WelcomeScreen';
import HistoryDrawer from '@components/HistoryDrawer';
import MemoryModal from '@components/MemoryModal';
import ControlBar from '@components/ControlBar';
import SubtitlePanel from '@components/SubtitlePanel';
import SpeakingAvatar from '@components/SpeakingAvatar';
import AudioVisualizer from '@components/AudioVisualizer';
import DeviceSelector from '@components/DeviceSelector';

// Hooks
import { useMediaCapture } from '@hooks/useMediaCapture';
import { useHistoryAndMemory } from '@hooks/useHistoryAndMemory';

const { Title, Text } = Typography;

export default function App() {
  const { message } = AntdApp.useApp();
  const { status, setStatus } = useCallStore();
  const [latencyMs] = useState<number | null>(null);

  // Refs for core logic
  const wsRef = useRef<RealtimeWsClient | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<Pcm24Player | null>(null);
  
  const sessionReadyRef = useRef(false);
  const isAiSpeakingRef = useRef(false);
  const shouldIgnoreAudioRef = useRef(false);
  const isUserHangupRef = useRef(false);
  
  // Microphone stream ref (kept here as it's used by AudioStreamer directly)
  const micStreamRef = useRef<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);

  // Custom Hooks
  const {
    isScreenSharing,
    isCameraOn,
    toggleScreenShare,
    toggleCamera,
    stopScreenShare,
    stopCamera,
    localVideoRef
  } = useMediaCapture(wsRef);

  const {
    isHistoryDrawerOpen,
    setIsHistoryDrawerOpen,
    historyList,
    deleteHistory,
    isMemoryModalOpen,
    setIsMemoryModalOpen,
    memoryContent,
    setMemoryContent,
    openMemoryModal,
    saveMemory,
    clearMemory,
    saveCurrentSession,
    updateMemorySummary,
    getInstructionsWithMemory
  } = useHistoryAndMemory();

  // Status Info
  const statusInfo = useMemo(() => {
    switch (status) {
      case 'idle': return { text: '就绪', color: 'default' as const };
      case 'connecting': return { text: '连接中', color: 'processing' as const };
      case 'listening': return { text: 'Listening', color: 'success' as const };
      case 'thinking': return { text: 'Thinking', color: 'warning' as const };
      case 'speaking': return { text: 'Speaking', color: 'error' as const };
      case 'ended': return { text: '已结束', color: 'default' as const };
    }
  }, [status]);

  // Core Functions
  async function startCall() {
    try {
      isUserHangupRef.current = false;
      setStatus('connecting');
      useCallStore.getState().clearSubtitles();

      const instructions = getInstructionsWithMemory();
      log('Instructions with memory:', instructions);

      const sess = await fetch('/session', { 
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ model: 'qwen3-omni-flash-realtime', voice: 'Cherry' }) 
      }).then(r => r.json());

      const ws = new RealtimeWsClient({
        onOpen: () => {
          setStatus('listening');
          message.success('已连接实时服务');
        },
        onClose: (code) => {
          if (isUserHangupRef.current) {
            message.success('通话已结束');
          } else {
            message.warning(`实时服务断开${code ? ` (code ${code})` : ''}`);
          }
          setStatus('idle');
        },
        onError: () => {
          message.error('实时服务连接出错');
          setStatus('idle');
        },
        onMessage: async (msg) => {
          try {
            if (msg?.type) {
              log('📨 收到消息:', msg.type);
              if (msg.delta) log('  delta:', msg.delta);
              if (msg.transcript) log('  transcript:', msg.transcript);
              if (msg.text) log('  text:', msg.text);
            }
            
            if (msg?.type === 'session.created') {
              wsRef.current?.sendJson({
                type: 'session.update',
                event_id: eid(),
                session: {
                  output_modalities: ['TEXT', 'AUDIO'],
                  voice: sess.realtime?.voice || 'Cherry',
                  input_audio_format: 'PCM_16000HZ_MONO_16BIT',
                  output_audio_format: 'PCM_24000HZ_MONO_16BIT',
                  instructions: instructions,
                  enable_input_audio_transcription: true,
                  input_audio_transcription_model: 'gummy-realtime-v1',
                  enable_turn_detection: true,
                  turn_detection_type: 'server_vad',
                  turn_detection_threshold: 0.2,
                  turn_detection_silence_duration_ms: 800,
                  smooth_output: true,
                },
              });
            } else if (msg?.type === 'session.updated') {
              if (!sessionReadyRef.current) {
                sessionReadyRef.current = true;
                try {
                  const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
                  micStreamRef.current = mic;
                  const streamer = new AudioStreamer({ 
                    sendJson: (payload) => wsRef.current?.sendJson(payload), 
                    mode: 'vad', 
                    appendMs: 100,
                    enableClientVAD: false,
                    onUserSpeaking: () => {
                      if (isAiSpeakingRef.current) {
                        log('⚠️ 用户打断AI，停止播放');
                        playerRef.current?.stopAll();
                        wsRef.current?.sendJson({ type: 'response.cancel', event_id: eid() });
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
              log('🎤 用户开始说话，停止AI音频播放');
              playerRef.current?.stopAll();
              shouldIgnoreAudioRef.current = true;
              isAiSpeakingRef.current = false;
              setStatus('listening');
            } else if (msg?.type === 'conversation.item.input_audio_transcription.delta' && msg?.delta) {
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'user');
            } else if (msg?.type === 'conversation.item.input_audio_transcription.completed') {
              const transcript = msg?.transcript || '';
              if (transcript) {
                useCallStore.getState().addSubtitle({ role: 'user', text: transcript, isComplete: true });
              }
            } else if (msg?.type === 'response.created') {
              shouldIgnoreAudioRef.current = false;
            } else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
              useCallStore.getState().appendToLastSubtitle(msg.delta, 'assistant');
              setStatus('speaking');
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.audio.delta' && msg?.delta) {
              if (shouldIgnoreAudioRef.current) return;
              const p = (playerRef.current ??= new Pcm24Player());
              if (msg?.sample_rate_hz) p.setSampleRateHz(msg.sample_rate_hz);
              p.playBase64Pcm24(msg.delta);
              isAiSpeakingRef.current = true;
            } else if (msg?.type === 'response.done') {
              useCallStore.getState().markLastSubtitleComplete();
              isAiSpeakingRef.current = false;
              shouldIgnoreAudioRef.current = false;
              setStatus('listening');
            } else if (msg?.type === 'response.cancelled') {
              playerRef.current?.stopAll();
              useCallStore.getState().markLastSubtitleComplete();
              isAiSpeakingRef.current = false;
              shouldIgnoreAudioRef.current = true;
              setStatus('listening');
            } else if (msg?.type === 'upstream.close') {
              message.warning(`上游关闭: code=${msg.code} reason=${msg.reason || ''}`);
              setStatus('idle');
              isAiSpeakingRef.current = false;
            } else if (msg?.type === 'error') {
              log('❌ 模型返回错误:', JSON.stringify(msg, null, 2));
              message.error(msg?.error?.message || '模型错误');
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
      isUserHangupRef.current = true;
      wsRef.current?.close();
      await streamerRef.current?.stop();
      playerRef.current?.stopAll();
      
      stopScreenShare();
      stopCamera();
      
      const mic = micStreamRef.current;
      if (mic) {
        mic.getTracks().forEach((t) => {
          try { t.stop(); } catch {}
        });
      }
      micStreamRef.current = null;
      setIsMuted(false);
      
      sessionReadyRef.current = false;
      isAiSpeakingRef.current = false;
      shouldIgnoreAudioRef.current = false;
      
      saveCurrentSession();
      void updateMemorySummary();
    } finally {
      setStatus('ended');
    }
  }

  function toggleMute() {
    if (!micStreamRef.current) {
      message.warning('当前没有可静音的麦克风流');
      return;
    }
    const nextMuted = !isMuted;
    micStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
    message.success(nextMuted ? '已静音麦克风' : '已取消静音');
  }

  const isCallActive = status !== 'idle' && status !== 'ended';

  return (
    <div style={{ 
      height: isCallActive ? '100vh' : undefined,
      minHeight: '100vh',
      overflow: isCallActive ? 'hidden' : undefined,
      display: 'flex',
      flexDirection: 'column',
      background: '#fafbfc',
      position: 'relative'
    }}>
      {/* Background Decoration */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', top: -200, left: -200, width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(102, 126, 234, 0.08) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: -200, right: -200, width: 600, height: 600,
          background: 'radial-gradient(circle, rgba(118, 75, 162, 0.08) 0%, transparent 70%)',
        }} />
      </div>

      {/* Header */}
      <header style={{ 
        borderBottom: '1px solid rgba(0, 0, 0, 0.06)', padding: '16px 32px',
        background: 'rgba(255, 255, 255, 0.95)', backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 20
      }}>
        <Flex align="center" justify="space-between" style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Flex align="center" gap={10}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 16,
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)'
            }}>D</div>
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
        flex: 1, display: 'flex', flexDirection: 'column', padding: '0 24px',
        position: 'relative', zIndex: 2, minHeight: 0
      }}>
        <div style={{
          maxWidth: 900, width: '100%', margin: '0 auto',
          display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
        }}>
          {!isCallActive ? (
            <WelcomeScreen onStartCall={startCall} />
          ) : (
            // Call Screen
            <div style={{ 
              width: '100%', flex: 1, minHeight: 0, paddingTop: 32, paddingBottom: 140,
              display: 'flex', flexDirection: 'column', gap: 20
            }}>
              <div style={{ flexShrink: 0, flexGrow: 0 }}>
                <Flex justify="center" vertical align="center" gap={16}>
                  <SpeakingAvatar status={status} />
                  <div style={{ width: 200, height: 40 }}>
                    <AudioVisualizer 
                      playerRef={playerRef} 
                      micStream={micStreamRef.current} 
                      isAiSpeaking={isAiSpeakingRef.current} 
                    />
                  </div>
                </Flex>
              </div>
              
              <div style={{ 
                width: '100%', maxWidth: 800, height: 450,
                margin: '0 auto', flexShrink: 0
              }}>
                <SubtitlePanel />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Local Video Preview */}
      {isCallActive && isCameraOn && (
        <video
          ref={localVideoRef}
          style={{
            position: 'absolute', bottom: 150, right: 40, width: 200, height: 120,
            borderRadius: 12, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.45)',
            backgroundColor: '#000', objectFit: 'cover', zIndex: 5,
          }}
          autoPlay muted
        />
      )}

      {/* Footer Links (Idle only) */}
      {!isCallActive && (
        <footer style={{ 
          padding: '24px 32px', borderTop: '1px solid rgba(0, 0, 0, 0.06)',
          background: 'rgba(255, 255, 255, 0.95)', position: 'relative', zIndex: 2
        }}>
          <Flex justify="center" gap={24}>
            <Button type="link" onClick={() => setIsHistoryDrawerOpen(true)} style={{ color: '#64748b' }}>历史记录</Button>
            <Button type="link" onClick={openMemoryModal} style={{ color: '#64748b' }}>编辑记忆</Button>
            <Button type="link" style={{ color: '#64748b' }}>设置</Button>
          </Flex>
        </footer>
      )}

      {/* Drawers & Modals */}
      <HistoryDrawer
        open={isHistoryDrawerOpen}
        onClose={() => setIsHistoryDrawerOpen(false)}
        historyList={historyList}
        onDelete={deleteHistory}
      />

      <MemoryModal
        open={isMemoryModalOpen}
        content={memoryContent}
        onChange={setMemoryContent}
        onSave={saveMemory}
        onCancel={() => setIsMemoryModalOpen(false)}
        onClear={clearMemory}
      />

      {/* Control Bar (Call only) */}
      {isCallActive && (
        <ControlBar
          onHangup={hangup}
          onToggleScreenShare={toggleScreenShare}
          isScreenSharing={isScreenSharing}
          onToggleCamera={toggleCamera}
          isCameraOn={isCameraOn}
          onToggleMute={toggleMute}
          isMuted={isMuted}
        />
      )}
    </div>
  );
}
