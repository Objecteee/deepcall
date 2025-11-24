import { useEffect, useRef } from 'react';
import { Pcm24Player } from '@rtc/PcmPlayer';

interface AudioVisualizerProps {
  playerRef: React.MutableRefObject<Pcm24Player | null>;
  micStream: MediaStream | null;
  isAiSpeaking: boolean;
}

export default function AudioVisualizer({ playerRef, micStream, isAiSpeaking }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number>();

  // 初始化麦克风 Analyser
  useEffect(() => {
    if (micStream) {
      if (!micContextRef.current) {
        micContextRef.current = new AudioContext();
        micAnalyserRef.current = micContextRef.current.createAnalyser();
        micAnalyserRef.current.fftSize = 256;
      }
      const ctx = micContextRef.current;
      // 避免重复连接
      if (micSourceRef.current) {
        micSourceRef.current.disconnect();
      }
      const source = ctx.createMediaStreamSource(micStream);
      source.connect(micAnalyserRef.current!);
      micSourceRef.current = source;
    }

    return () => {
      // 组件卸载时不关闭 Context，以免影响其他组件，但断开连接
      micSourceRef.current?.disconnect();
    };
  }, [micStream]);

  // 绘制循环
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;
      
      // 选择当前的 Analyser 源
      let analyser: AnalyserNode | null = null;
      if (isAiSpeaking && playerRef.current?.analyser) {
        analyser = playerRef.current.analyser;
      } else if (micAnalyserRef.current) {
        analyser = micAnalyserRef.current;
      }

      if (!analyser) {
        // 如果没有音频源，绘制静默直线
        ctx.clearRect(0, 0, width, height);
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        animationFrameRef.current = requestAnimationFrame(draw);
        return;
      }

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 2;
      // 根据谁在说话改变颜色
      ctx.strokeStyle = isAiSpeaking ? '#667eea' : '#34d399'; 
      ctx.beginPath();

      const sliceWidth = width * 1.0 / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * height / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isAiSpeaking, micStream]); // 依赖项：状态改变时可能会切换颜色

  return (
    <canvas 
      ref={canvasRef} 
      width={300} 
      height={60}
      style={{
        width: '100%',
        height: 60,
        borderRadius: 12,
        // background: 'rgba(0,0,0,0.02)'
      }}
    />
  );
}
