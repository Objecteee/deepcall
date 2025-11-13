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
// import { RealtimeClient } from '@rtc/RealtimeClient';
import { RealtimeWsClient } from '@rtc/RealtimeWsClient';
import { AudioStreamer } from '@rtc/AudioStreamer';
import { PcmPlayer } from '@rtc/PcmPlayer';

const { Title, Text } = Typography;

export default function App() {
  const { message } = AntdApp.useApp();
  const { status, setStatus } = useCallStore();
  const [latencyMs] = useState<number | null>(null);
  // const clientRef = useRef<RealtimeClient | null>(null);
  const wsRef = useRef<RealtimeWsClient | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);

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
      // Switch to WS proxy path for 302.ai
      const ws = new RealtimeWsClient({
        onOpen: () => {
          // Configure Realtime session (modalities, formats, voice)
          wsRef.current?.sendJson({
            type: 'session.update',
            session: {
              model: 'gpt-4o-realtime-preview-2024-12-17',
              voice: 'alloy',
              modalities: ['audio', 'text'],
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16',
            },
          });
          setStatus('listening');
          message.success('已连接实时服务');
        },
        onClose: (code) => {
          const current = useCallStore.getState().status;
          if (current === 'connecting') {
            // handshake failed → 回退到空闲并提示
            message.error('实时服务连接失败');
            setStatus('idle');
          } else if (current === 'listening' || current === 'thinking' || current === 'speaking') {
            message.warning('实时服务已断开');
            setStatus('idle');
          } else {
            setStatus('ended');
          }
        },
        onError: () => {
          message.error('实时服务连接出错');
          setStatus('idle');
        },
        onMessage: (msg) => {
          try {
            // Debug log to help integration
            // eslint-disable-next-line no-console
            console.debug('realtime message', msg);
            if (msg?.type === 'response.delta' && msg?.delta?.text) {
              useCallStore.getState().addSubtitle({ role: 'assistant', text: msg.delta.text });
            } else if (msg?.type === 'response.audio.delta' && msg?.delta) {
              // base64 pcm16 chunk
              const player = (playerRef.current ??= new PcmPlayer());
              if (msg?.sample_rate_hz) {
                player.setSampleRateHz(msg.sample_rate_hz);
              }
              player.playBase64Pcm16(msg.delta);
            } else if ((msg?.type?.includes?.('transcript') || msg?.type === 'input_audio_buffer.transcript.delta') && msg?.delta?.text) {
              useCallStore.getState().addSubtitle({ role: 'user', text: msg.delta.text });
            } else if (msg?.type === 'response.completed') {
              streamerRef.current?.markResponseCompleted();
            }
          } catch {}
        },
      });
      wsRef.current = ws;
      ws.connect('gpt-4o-realtime-preview-2024-12-17', 'alloy');

      // Start mic streaming (PCM16 → ws)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const streamer = new AudioStreamer({
        sendJson: (payload) => wsRef.current?.sendJson(payload),
        onError: (e) => console.error('audio streamer error', e),
      });
      streamerRef.current = streamer;
      await streamer.start(stream);
    } catch (e: any) {
      console.error(e);
      const detail = e?.message ? `：${e.message}` : '';
      message.error(`建立语音连接失败，请检查后端与网络设置${detail}`);
      setStatus('idle');
    }
  }

  async function hangup() {
    try {
      // await clientRef.current?.disconnect();
      wsRef.current?.close();
      await streamerRef.current?.stop();
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
                {/* Keep waveform optional; can be enabled later */}
                {/* <AudioVisualizer /> */}
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
      {/* Hook hangup: intercept button from ControlBar via global status change */}
      {status === 'ended' ? null : null}
    </Flex>
  );
}


