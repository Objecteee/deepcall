export type AudioStreamerOptions = {
  sampleRateOut?: number; // default 16000
  appendMs?: number; // default 200ms
  sendJson: (payload: unknown) => void;
  mode?: 'vad' | 'manual';
  onError?: (e: any) => void;
  onStart?: () => void;
  onStop?: () => void;
  onUserSpeaking?: () => void; // 当检测到用户开始说话时触发
  enableClientVAD?: boolean; // 是否启用客户端VAD检测（用于打断），默认false
};

export class AudioStreamer {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private collecting = false;
  private queue: Int16Array[] = [];
  private lastCommit = 0;
  private options: Required<AudioStreamerOptions>;
  private isSpeaking = false; // 是否正在说话
  private silenceFrames = 0; // 连续静音帧数
  private speechFrames = 0; // 连续有声音的帧数
  private readonly SILENCE_THRESHOLD = 0.02; // 静音阈值（RMS）- 提高以避免误触发
  private readonly SPEECH_FRAMES_THRESHOLD = 5; // 需要连续5帧有声音才算开始说话 - 增加以避免误判

  constructor(options: AudioStreamerOptions) {
    this.options = {
      sampleRateOut: options.sampleRateOut ?? 16000,
      appendMs: options.appendMs ?? 200,
      sendJson: options.sendJson,
      mode: options.mode ?? 'vad',
      onError: options.onError ?? (() => {}),
      onStart: options.onStart ?? (() => {}),
      onStop: options.onStop ?? (() => {}),
      onUserSpeaking: options.onUserSpeaking ?? (() => {}),
      enableClientVAD: options.enableClientVAD ?? false, // 默认禁用客户端VAD
    } as Required<AudioStreamerOptions>;
  }

  async start(stream: MediaStream) {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this.ctx.resume();
    this.source = this.ctx.createMediaStreamSource(stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.source.connect(this.processor);
    // connect to a muted sink to ensure processor is pulled without echo
    const sink = this.ctx.createGain();
    sink.gain.value = 0;
    this.processor.connect(sink);
    sink.connect(this.ctx.destination);
    this.processor.onaudioprocess = (ev) => {
      const input = ev.inputBuffer.getChannelData(0);
      
      // 只有在启用客户端VAD时才检测用户说话（用于打断）
      if (this.options.enableClientVAD) {
        this.detectSpeech(input);
      }
      
      const pcm16 = this.downsampleToPCM16(input, this.ctx!.sampleRate, this.options.sampleRateOut);
      if (pcm16.length) this.queue.push(pcm16);
      this.flushIfNeeded();
    };
    this.collecting = true;
    this.options.onStart();
  }

  async stop() {
    this.collecting = false;
    try { if (this.processor) this.processor.disconnect(); } catch {}
    try { if (this.source) this.source.disconnect(); } catch {}
    try { if (this.ctx) await this.ctx.close(); } catch {}
    this.ctx = null; this.source = null; this.processor = null; this.queue = []; this.lastCommit = 0;
    this.isSpeaking = false;
    this.silenceFrames = 0;
    this.speechFrames = 0;
    this.options.onStop();
  }

  /**
   * 检测用户是否开始说话（改进的VAD，避免误触发）
   */
  private detectSpeech(audioData: Float32Array) {
    // 计算RMS（均方根）
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    
    // 如果音量超过阈值，说明有声音
    if (rms > this.SILENCE_THRESHOLD) {
      this.silenceFrames = 0;
      this.speechFrames++;
      
      // 需要连续多帧超过阈值才触发（避免误判）
      if (this.speechFrames >= this.SPEECH_FRAMES_THRESHOLD && !this.isSpeaking) {
        // 从静音状态转为说话状态，触发打断回调
        this.isSpeaking = true;
        console.log('🎤 检测到用户说话（连续', this.speechFrames, '帧超过阈值）');
        this.options.onUserSpeaking();
      }
    } else {
      // 静音帧
      this.speechFrames = 0; // 重置语音帧计数
      this.silenceFrames++;
      // 如果连续静音超过一定帧数（约0.5秒），认为停止说话
      if (this.silenceFrames > 10 && this.isSpeaking) {
        this.isSpeaking = false;
        console.log('🔇 用户停止说话');
      }
    }
  }

  private flushIfNeeded() {
    if (!this.collecting || this.queue.length === 0) return;
    const targetSamples = Math.floor((this.options.sampleRateOut * this.options.appendMs) / 1000);
    let collected = 0;
    const parts: Int16Array[] = [];
    while (this.queue.length && collected < targetSamples) {
      const part = this.queue.shift()!;
      parts.push(part);
      collected += part.length;
    }
    if (!parts.length) return;
    const merged = this.concat(parts);
    const b64 = this.toBase64(merged);
    this.options.sendJson({ type: 'input_audio_buffer.append', event_id: this.id(), audio: b64 });

    if (this.options.mode === 'manual') {
      const now = Date.now();
      if (now - this.lastCommit >= 800) {
        this.lastCommit = now;
        this.options.sendJson({ type: 'input_audio_buffer.commit', event_id: this.id() });
        this.options.sendJson({ type: 'response.create', event_id: this.id() });
      }
    }
  }

  private id(): string {
    return 'event_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  private downsampleToPCM16(input: Float32Array, inRate: number, outRate: number): Int16Array {
    if (inRate === outRate) return this.floatTo16(input);
    const ratio = inRate / outRate;
    const newLen = Math.floor(input.length / ratio);
    const result = new Int16Array(newLen);
    let i = 0;
    for (let idx = 0; idx < newLen; idx++) {
      const next = Math.floor((idx + 1) * ratio);
      let sum = 0; let count = 0;
      for (; i < next && i < input.length; i++) { sum += input[i]; count++; }
      const sample = count ? sum / count : 0;
      result[idx] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return result;
  }

  private floatTo16(input: Float32Array): Int16Array {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const v = Math.max(-1, Math.min(1, input[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  }

  private concat(parts: Int16Array[]): Int16Array {
    let len = 0; for (const p of parts) len += p.length;
    const out = new Int16Array(len);
    let off = 0; for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
  }

  private toBase64(ints: Int16Array): string {
    const bytes = new Uint8Array(ints.buffer, ints.byteOffset, ints.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      const chunk = bytes.subarray(i, i + 0x8000);
      binary += String.fromCharCode.apply(null, Array.from(chunk) as any);
    }
    return btoa(binary);
  }
}
