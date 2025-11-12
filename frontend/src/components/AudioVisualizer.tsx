import { useEffect, useRef } from 'react';
import { Card } from 'antd';

export default function AudioVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number>();
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;
    dataRef.current = new Uint8Array(analyser.frequencyBinCount);

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


