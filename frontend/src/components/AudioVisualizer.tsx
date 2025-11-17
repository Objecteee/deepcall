import { useEffect, useRef } from 'react';
import { Card } from 'antd';

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  // 使用类型断言来匹配 Web Audio API 的类型定义
  const dataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    // 显式创建 ArrayBuffer，然后用它创建 Uint8Array，确保类型为 Uint8Array<ArrayBuffer>
    // 这样匹配 Web Audio API 的 getByteFrequencyData 类型定义
    const buffer = new ArrayBuffer(analyser.frequencyBinCount);
    dataRef.current = new Uint8Array(buffer);

    // Placeholder: attach real input node later
    const osc = ctx.createOscillator();
    osc.frequency.value = 0;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(analyser).connect(ctx.destination);
    osc.start();

    const draw = () => {
      const canvas = canvasRef.current;
      const data = dataRef.current;
      if (!canvas || !data) return;
      const c = canvas.getContext('2d');
      if (!c) return;
      // TypeScript 类型定义过于严格（Uint8Array<ArrayBufferLike> vs Uint8Array<ArrayBuffer>）
      // 但运行时完全兼容，使用 @ts-expect-error 绕过类型检查
      // @ts-expect-error - Web Audio API 在运行时接受 Uint8Array，类型定义过于严格
      analyser.getByteFrequencyData(data);
      c.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / data.length) * 1.6;
      for (let i = 0; i < data.length; i++) {
        const val = data[i];
        const h = (val / 255) * canvas.height;
        c.fillStyle = `hsl(${200 + (i / data.length) * 80}, 80%, 60%)`;
        c.fillRect(i * barWidth, canvas.height - h, barWidth * 0.8, h);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      osc.stop();
      ctx.close();
    };
  }, []);

  return (
    <Card size="small">
      <canvas ref={canvasRef} width={800} height={140} style={{ width: '100%', display: 'block' }} />
    </Card>
  );
}


