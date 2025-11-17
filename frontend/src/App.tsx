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
            if (msg?.type === 'session.created') {
              // switch to server-side VAD to avoid continuous replies
              wsRef.current?.sendJson({
                type: 'session.update',
                event_id: eid(),
                session: {
                  output_modalities: ['TEXT', 'AUDIO'],
                  voice: sess.realtime?.voice || 'Cherry',
                  input_audio_format: 'PCM_16000HZ_MONO_16BIT',
                  output_audio_format: 'PCM_24000HZ_MONO_16BIT',
                  instructions: '请始终用中文回答。',
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
                  const streamer = new AudioStreamer({ sendJson: (payload) => wsRef.current?.sendJson(payload), mode: 'vad', appendMs: 100 });
                  streamerRef.current = streamer;
                  await streamer.start(mic);
                } catch (err: any) {
                  message.error(`麦克风不可用：${err?.message || '权限被拒绝'}`);
                  setStatus('idle');
                }
              }
            } else if (msg?.type === 'response.audio_transcript.delta' && msg?.delta) {
              useCallStore.getState().addSubtitle({ role: 'assistant', text: msg.delta });
              setStatus('speaking');
            } else if (msg?.type === 'response.audio.delta' && msg?.delta) {
              const p = (playerRef.current ??= new Pcm24Player());
              if (msg?.sample_rate_hz) p.setSampleRateHz(msg.sample_rate_hz);
              p.playBase64Pcm24(msg.delta);
            } else if (msg?.type === 'upstream.close') {
              message.warning(`上游关闭: code=${msg.code} reason=${msg.reason || ''}`);
              setStatus('idle');
            } else if (msg?.type === 'error') {
              message.error(msg?.error?.message || '模型错误');
              setStatus('idle');
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
      sessionReadyRef.current = false;
    } finally {
      setStatus('ended');
    }
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
        </Space>
      </Space>
      {/* Floating bottom controls (during call) */}
      {status !== 'idle' && status !== 'ended' ? <ControlBar onHangup={hangup} /> : null}
    </Flex>
  );
}


