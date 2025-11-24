import { useRef, useState, useMemo, useEffect } from 'react';
import { App as AntdApp, Button, Card, Flex, Typography, Space, Badge, Modal, Input, Popconfirm, Drawer, List, Empty } from 'antd';
import { motion } from 'framer-motion';
import CallButton from '@components/CallButton';
import SubtitlePanel from '@components/SubtitlePanel';
import ControlBar from '@components/ControlBar';
import DeviceSelector from '@components/DeviceSelector';
// import AudioVisualizer from '@components/AudioVisualizer';
import { useCallStore } from '@store/callStore';
import SpeakingAvatar from '@components/SpeakingAvatar';
import AudioVisualizer from '@components/AudioVisualizer';
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
  const isUserHangupRef = useRef(false); // 标记是否为用户主动挂断
  // 屏幕共享相关状态
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenCaptureTimerRef = useRef<number | null>(null);
  // 麦克风流与静音状态
  const micStreamRef = useRef<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  // 记忆编辑器状态
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [memoryContent, setMemoryContent] = useState('');
  // 历史记录状态
  type HistoryItem = { id: string; date: number; subtitles: Array<{ role: 'user' | 'assistant'; text: string; timestamp?: number }> };
  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);
  // 摄像头相关状态（用于“与 AI 视频通话”）
  const [isCameraOn, setIsCameraOn] = useState(false);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraCaptureTimerRef = useRef<number | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

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

  // 本地预览：当摄像头状态或流变化时，同步到本地预览 <video>
  useEffect(() => {
    const videoEl = localVideoRef.current;
    if (!videoEl) return;

    if (isCameraOn && cameraStreamRef.current) {
      // 为避免类型冲突，这里使用类型断言
      (videoEl as HTMLVideoElement & { playsInline?: boolean }).srcObject = cameraStreamRef.current;
      videoEl.muted = true;
      (videoEl as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      void videoEl.play().catch(() => {});
    } else {
      // 关闭摄像头或通话结束时，清理预览
      (videoEl as HTMLVideoElement & { playsInline?: boolean }).srcObject = null;
    }
  }, [isCameraOn]);

  // 停止屏幕共享：清理定时器与媒体流
  const stopScreenShare = () => {
    if (screenCaptureTimerRef.current != null) {
      window.clearInterval(screenCaptureTimerRef.current);
      screenCaptureTimerRef.current = null;
    }

    const stream = screenStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }
    screenStreamRef.current = null;
    setIsScreenSharing(false);
  };

  // 停止摄像头：清理定时器与媒体流
  const stopCamera = () => {
    if (cameraCaptureTimerRef.current != null) {
      window.clearInterval(cameraCaptureTimerRef.current);
      cameraCaptureTimerRef.current = null;
    }

    const stream = cameraStreamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
    }
    cameraStreamRef.current = null;
    setIsCameraOn(false);
  };

  // 开关屏幕共享
  async function toggleScreenShare() {
    if (isScreenSharing) {
      // 已在共享，点击则停止
      stopScreenShare();
      message.success('已停止屏幕共享');
      return;
    }

    try {
      // 与麦克风一样，屏幕共享也需要安全上下文（HTTPS / localhost）
      const isSecureContext =
        window.isSecureContext ||
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';

      if (!isSecureContext) {
        message.error({
          content: '屏幕共享需要在 HTTPS 或 localhost 环境下使用，请通过 HTTPS 访问应用。',
          duration: 6,
        });
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        message.error('当前浏览器不支持屏幕共享（getDisplayMedia 不可用）');
        return;
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 2, max: 5 },
        },
        audio: false,
      } as MediaStreamConstraints);

      if (!stream) {
        message.error('未获取到屏幕共享流');
        return;
      }

      screenStreamRef.current = stream;
      setIsScreenSharing(true);

      // 创建离屏 video/canvas 用于抽帧
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      // 部分浏览器需要 playsInline 才能在非全屏环境正常播放
      (video as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;

      // 尝试开始播放，但不阻塞后续逻辑
      void video.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings ? track.getSettings() : {};
      const targetWidth = Math.min((settings.width as number | undefined) || 1280, 1280);
      const targetHeight =
        (settings.height && settings.width
          ? Math.round(((settings.height as number) / (settings.width as number)) * targetWidth)
          : 720);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        message.error('浏览器不支持 Canvas，无法进行屏幕共享编码');
        stopScreenShare();
        return;
      }

      const captureAndSendFrame = () => {
        if (!screenStreamRef.current || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return;
        }
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return;
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result;
                if (typeof result !== 'string') return;
                const base64 = result.split(',')[1] || '';
                if (!base64) return;

                // 根据官方文档：图片/视频帧需通过 input_image_buffer.append 事件发送到缓冲区
                // 事件在 VAD 模式下会与 input_audio_buffer.append 一起用于多模态推理
                wsRef.current?.sendJson({
                  type: 'input_image_buffer.append',
                  event_id: eid(),
                  image: base64,
                });
              };
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            0.7,
          );
        } catch (err) {
          log('捕获屏幕帧失败', err);
        }
      };

      // 控制帧率：默认 1 fps，既满足模型推荐又减轻带宽压力
      const timerId = window.setInterval(captureAndSendFrame, 1000);
      screenCaptureTimerRef.current = timerId;

      // 当用户在浏览器 UI 中主动停止共享时，自动同步状态
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          stopScreenShare();
          message.info('屏幕共享已结束');
        });
      });

      message.success('已开始屏幕共享');
    } catch (err: any) {
      log('启动屏幕共享失败', err);
      message.error(err?.message ? `屏幕共享失败：${err.message}` : '屏幕共享失败');
    }
  }

  // 开关摄像头，与 AI 进行“视频通话”（AI 看到你的画面）
  async function toggleCamera() {
    if (isCameraOn) {
      // 已打开摄像头，点击则关闭
      stopCamera();
      message.success('已关闭摄像头');
      return;
    }

    try {
      const isSecureContext =
        window.isSecureContext ||
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';

      if (!isSecureContext) {
        message.error({
          content: '摄像头访问需要在 HTTPS 或 localhost 环境下使用，请通过 HTTPS 访问应用。',
          duration: 6,
        });
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        message.error('当前浏览器不支持摄像头（getUserMedia 不可用）');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15, max: 24 },
        },
        audio: false,
      } as MediaStreamConstraints);

      if (!stream) {
        message.error('未获取到摄像头视频流');
        return;
      }

      cameraStreamRef.current = stream;
      setIsCameraOn(true);

      // 使用离屏 video + canvas 进行抽帧发送给模型，预览由 useEffect 管理
      const captureVideo = document.createElement('video');
      captureVideo.srcObject = stream;
      captureVideo.muted = true;
      (captureVideo as HTMLVideoElement & { playsInline?: boolean }).playsInline = true;
      void captureVideo.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings ? track.getSettings() : {};
      const targetWidth = Math.min((settings.width as number | undefined) || 640, 640);
      const targetHeight =
        (settings.height && settings.width
          ? Math.round(((settings.height as number) / (settings.width as number)) * targetWidth)
          : 360);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        message.error('浏览器不支持 Canvas，无法进行摄像头画面编码');
        stopCamera();
        return;
      }

      const captureAndSendFrame = () => {
        if (!cameraStreamRef.current || captureVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return;
        }
        try {
          ctx.drawImage(captureVideo, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(
            (blob) => {
              if (!blob) return;
              const reader = new FileReader();
              reader.onloadend = () => {
                const result = reader.result;
                if (typeof result !== 'string') return;
                const base64 = result.split(',')[1] || '';
                if (!base64) return;

                // 通过 input_image_buffer.append 向 Qwen-Omni 发送摄像头帧
                wsRef.current?.sendJson({
                  type: 'input_image_buffer.append',
                  event_id: eid(),
                  image: base64,
                });
              };
              reader.readAsDataURL(blob);
            },
            'image/jpeg',
            0.7,
          );
        } catch (err) {
          log('捕获摄像头帧失败', err);
        }
      };

      // 同样控制为 1 fps，满足官方建议帧率
      const timerId = window.setInterval(captureAndSendFrame, 1000);
      cameraCaptureTimerRef.current = timerId;

      // 当用户在浏览器 UI 中主动关闭摄像头时，自动同步状态
      stream.getVideoTracks().forEach((t) => {
        t.addEventListener('ended', () => {
          stopCamera();
          message.info('摄像头已关闭');
        });
      });

      message.success('已打开摄像头');
    } catch (err: any) {
      log('启动摄像头失败', err);
      message.error(err?.message ? `摄像头打开失败：${err.message}` : '摄像头打开失败');
    }
  }

  // ---------------------- 长期记忆 / 摘要逻辑 ----------------------
  const MEMORY_KEY = 'deepcall_user_summary';
  const HISTORY_KEY = 'deepcall_history';

  // 加载历史记录列表
  const loadHistory = () => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setHistoryList(Array.isArray(parsed) ? parsed : []);
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistoryList([]);
    }
  };

  // 保存当前会话到历史记录
  const saveCurrentSession = () => {
    try {
      const subtitles = useCallStore.getState().subtitles;
      if (subtitles.length === 0) return; // 没有对话内容，不保存

      const session = {
        id: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        date: Date.now(),
        subtitles: subtitles.filter(s => s.text && s.text.trim().length > 0)
      };

      const existing = localStorage.getItem(HISTORY_KEY);
      const history = existing ? JSON.parse(existing) : [];
      history.unshift(session); // 最新的放在最前面
      
      // 限制最多保存 50 条历史记录
      const limited = history.slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  };

  // 删除单条历史记录
  const deleteHistory = (id: string) => {
    try {
      const existing = localStorage.getItem(HISTORY_KEY);
      if (!existing) return;
      const history = JSON.parse(existing);
      const filtered = history.filter((h: any) => h.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
      loadHistory(); // 重新加载列表
      if (selectedHistory?.id === id) {
        setSelectedHistory(null); // 如果删除的是当前查看的，清空详情
      }
      message.success('已删除');
    } catch (err) {
      console.error('Failed to delete history:', err);
      message.error('删除失败');
    }
  };

  const openMemoryModal = () => {
    const current = localStorage.getItem(MEMORY_KEY) || '';
    setMemoryContent(current);
    setIsMemoryModalOpen(true);
  };

  const saveMemory = () => {
    localStorage.setItem(MEMORY_KEY, memoryContent);
    message.success('记忆已更新');
    setIsMemoryModalOpen(false);
  };

  const clearMemory = () => {
    localStorage.removeItem(MEMORY_KEY);
    setMemoryContent('');
    message.success('记忆已清除');
    // 不关闭弹窗，让用户看到清空结果，或者可以选择关闭
    // setIsMemoryModalOpen(false); 
  };

  const openHistoryDrawer = () => {
    loadHistory();
    setIsHistoryDrawerOpen(true);
  };

  async function updateMemorySummary() {
    try {
      const subtitles = useCallStore.getState().subtitles;
      // 过滤出有效的对话内容（只要有文本即可，不必强制 isComplete，防止漏掉最后一句）
      const history = subtitles
        .filter(s => s.text && s.text.trim().length > 0)
        .map(s => ({ role: s.role, text: s.text }));

      if (history.length === 0) {
        log('没有新的有效对话，跳过摘要生成');
        return;
      }

      const previousSummary = localStorage.getItem(MEMORY_KEY) || '';
      
      log('开始生成记忆摘要...', { historyLength: history.length, hasPrevSummary: !!previousSummary });

      const res = await fetch('/chat/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, previousSummary })
      });

      if (!res.ok) throw new Error('Summary API failed');
      
      const data = await res.json();
      if (data.summary) {
        localStorage.setItem(MEMORY_KEY, data.summary);
        log('记忆摘要已更新:', data.summary);
      }
    } catch (err) {
      console.error('Failed to update memory summary:', err);
    }
  }

  async function startCall() {
    try {
      isUserHangupRef.current = false;
      setStatus('connecting');
      useCallStore.getState().clearSubtitles();

      // 1. 读取本地存储的“长期记忆摘要”
      const savedSummary = localStorage.getItem(MEMORY_KEY);
      let instructions = '你是一个情感丰富、逻辑清晰的AI助手。请以自然、亲切的口吻与用户对话，像老朋友一样交流。在回答复杂问题时，请保持思维缜密，分点表述，确保逻辑通顺。请始终使用中文回答。';
      
      if (savedSummary) {
        instructions += `\n\n【长期记忆】\n这是你与该用户过往的对话记忆摘要，请在对话中自然地利用这些信息（如用户姓名、职业、偏好等），保持跨会话的连贯感：\n${savedSummary}`;
        log('注入长期记忆:', savedSummary);
      }

      const sess = await fetch('/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'qwen3-omni-flash-realtime', voice: 'Cherry' }) }).then(r => r.json());

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
                  // 系统指令 (已注入记忆)
                  instructions: instructions,
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
                  micStreamRef.current = mic;
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
              // 打印完整错误对象以便排查
              log('❌ 模型返回错误:', JSON.stringify(msg, null, 2));
              message.error(msg?.error?.message || '模型错误');
              // setStatus('idle'); // 暂时注释掉，避免因为视频帧错误导致通话直接挂断
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
      // 挂断时确保关闭屏幕共享
      stopScreenShare();
      // 挂断时关闭麦克风流
      const mic = micStreamRef.current;
      if (mic) {
        mic.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore
          }
        });
      }
      micStreamRef.current = null;
      setIsMuted(false);
      // 挂断时关闭摄像头
      stopCamera();
      // 清理所有refs状态
      sessionReadyRef.current = false;
      isAiSpeakingRef.current = false;
      shouldIgnoreAudioRef.current = false;
      currentResponseIdRef.current = null;
      
      // 挂断时，保存当前会话到历史记录
      saveCurrentSession();
      // 挂断时，触发后台记忆摘要更新
      // 不使用 await，避免阻塞 UI 响应
      void updateMemorySummary();
    } finally {
      setStatus('ended');
    }
  }

  // 开关麦克风静音
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

  // 辅助变量：是否处于通话界面
  const isCallActive = status !== 'idle' && status !== 'ended';

  return (
    <div style={{ 
      // 根容器布局策略：
      // 通话中：固定 100vh 高度，禁止页面级滚动（防止轻微抖动），只允许对话框内部滚动
      // 闲置时：最小 100vh 高度，允许页面自然滚动（适应不同屏幕尺寸）
      height: isCallActive ? '100vh' : undefined,
      minHeight: '100vh',
      overflow: isCallActive ? 'hidden' : undefined,
      display: 'flex',
      flexDirection: 'column',
      background: '#fafbfc',
      position: 'relative'
    }}>
      {/* 背景装饰容器 - 防止装饰溢出导致滚动条 */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute',
          top: -200,
          left: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(102, 126, 234, 0.08) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute',
          bottom: -200,
          right: -200,
          width: 600,
          height: 600,
          background: 'radial-gradient(circle, rgba(118, 75, 162, 0.08) 0%, transparent 70%)',
        }} />
      </div>
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

      {/* Main Content - 使用 flex:1 占据除 header/footer 外的空间 */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '0 24px',
        position: 'relative',
        zIndex: 2,
        minHeight: 0
      }}>
        <div
          style={{
            maxWidth: 900,
            width: '100%',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
          }}
        >
          {status === 'idle' || status === 'ended' ? (
            // Welcome Screen
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '80px 24px',
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
                    实时语音聊天 · 屏幕讲解 · 摄像头视频助理
                  </Text>
                  <Text style={{ 
                    fontSize: 15, 
                    color: '#94a3b8',
                    textAlign: 'center',
                    maxWidth: 520
                  }}>
                    支持智能打断 · 流式字幕 · 屏幕共享 · 让 AI 看见你的屏幕和摄像头画面
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
                          <Text strong style={{ fontSize: 16, display: 'block' }}>实时语音对话</Text>
                          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                            自然流畅的语音交互体验，支持多轮追问与上下文记忆
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
                            说“打住”等口令或直接开口，即可实时打断 AI 的语音输出
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
                          <Text strong style={{ fontSize: 16, display: 'block' }}>实时字幕 & 聊天记录</Text>
                          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                            对话内容同步滚动显示，类微信气泡样式，方便回看与复制
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
                            📺
                          </div>
                          <Text strong style={{ fontSize: 16, display: 'block' }}>屏幕共享与摄像头</Text>
                          <Text type="secondary" style={{ fontSize: 14, lineHeight: 1.6 }}>
                            一键共享屏幕或打开摄像头，让 AI 看见你正在做什么并进行讲解
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
              
              {/* Chat Panel - 固定高度和宽度，内部自己滚动 */}
              <div style={{ 
                width: '100%',
                maxWidth: 800,
                height: 450,
                margin: '0 auto',
                flexShrink: 0
              }}>
                <SubtitlePanel />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 本地摄像头预览：通话中且摄像头打开时显示一个小画面 */}
      {status !== 'idle' && status !== 'ended' && isCameraOn && (
        <video
          ref={localVideoRef}
          style={{
            position: 'absolute',
            bottom: 150,
            right: 40,
            width: 200,
            height: 120,
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.45)',
            backgroundColor: '#000',
            objectFit: 'cover',
            zIndex: 5,
          }}
          autoPlay
          muted
        />
      )}

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
            <Button type="link" style={{ color: '#64748b' }} onClick={openHistoryDrawer}>历史记录</Button>
            <Button type="link" style={{ color: '#64748b' }} onClick={openMemoryModal}>编辑记忆</Button>
            <Button type="link" style={{ color: '#64748b' }}>设置</Button>
          </Flex>
        </footer>
      )}

      {/* 历史记录抽屉 */}
      <Drawer
        title="对话历史"
        placement="right"
        width={600}
        open={isHistoryDrawerOpen}
        onClose={() => {
          setIsHistoryDrawerOpen(false);
          setSelectedHistory(null);
        }}
      >
        {historyList.length === 0 ? (
          <Empty description="暂无历史记录" />
        ) : (
          <List
            dataSource={historyList}
            renderItem={(item: HistoryItem) => (
              <List.Item
                actions={[
                  <Button
                    type="link"
                    size="small"
                    onClick={() => setSelectedHistory(item)}
                  >
                    查看详情
                  </Button>,
                  <Popconfirm
                    title="删除记录"
                    description="确定要删除这条历史记录吗？"
                    onConfirm={() => deleteHistory(item.id)}
                    okText="确定"
                    cancelText="取消"
                  >
                    <Button type="link" danger size="small">
                      删除
                    </Button>
                  </Popconfirm>
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      <Text strong>
                        {new Date(item.date).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </Text>
                      <Badge count={item.subtitles.length} showZero />
                    </Space>
                  }
                  description={
                    <Text type="secondary" ellipsis>
                      {item.subtitles.slice(0, 2).map((s, i) => (
                        <span key={i}>
                          {s.role === 'user' ? '我' : 'AI'}: {s.text}
                          {i < 1 && ' | '}
                        </span>
                      ))}
                      {item.subtitles.length > 2 && '...'}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>

      {/* 历史记录详情弹窗 */}
      <Modal
        title={`对话详情 - ${selectedHistory ? new Date(selectedHistory.date).toLocaleString('zh-CN') : ''}`}
        open={!!selectedHistory}
        onCancel={() => setSelectedHistory(null)}
        footer={[
          <Button key="close" onClick={() => setSelectedHistory(null)}>
            关闭
          </Button>
        ]}
        width={700}
      >
        {selectedHistory && (
          <div style={{ maxHeight: '60vh', overflowY: 'auto', padding: '16px 0' }}>
            <Space direction="vertical" size={16} style={{ width: '100%' }}>
              {selectedHistory.subtitles.map((s: { role: 'user' | 'assistant'; text: string }, i: number) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: s.role === 'user' ? 'flex-end' : 'flex-start',
                    gap: 6
                  }}
                >
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.role === 'user' ? '我' : 'AI助手'}
                  </Text>
                  <div
                    className={`bubble ${s.role === 'user' ? 'bubble-user' : 'bubble-assistant'}`}
                    style={{ maxWidth: '80%' }}
                  >
                    {s.text}
                  </div>
                </div>
              ))}
            </Space>
          </div>
        )}
      </Modal>

      {/* 记忆编辑弹窗 */}
      <Modal
        title="编辑 AI 记忆"
        open={isMemoryModalOpen}
        onOk={saveMemory}
        onCancel={() => setIsMemoryModalOpen(false)}
        okText="保存"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%', paddingTop: 16 }}>
          <Text type="secondary">
            这是 AI 目前记住的关于您的信息摘要。您可以手动修改以纠正错误或补充信息。
          </Text>
          <Input.TextArea
            rows={6}
            value={memoryContent}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMemoryContent(e.target.value)}
            placeholder="暂无记忆..."
          />
          <Flex justify="flex-end">
            <Popconfirm
              title="清除记忆"
              description="确定要彻底清除所有长期记忆吗？此操作不可恢复。"
              onConfirm={clearMemory}
              okText="确定清除"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger type="link">清除所有记忆</Button>
            </Popconfirm>
          </Flex>
        </Space>
      </Modal>

      {/* Floating bottom controls (during call) */}
      {status !== 'idle' && status !== 'ended' && (
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


