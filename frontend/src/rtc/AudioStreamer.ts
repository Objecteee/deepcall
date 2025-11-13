export type AudioStreamerOptions = {
  sampleRateOut?: number; // default 16000
  appendMs?: number; // how much audio per append (ms), default 200ms
  onError?: (e: any) => void;
  onStart?: () => void;
  onStop?: () => void;
  sendJson: (payload: unknown) => void; // ws send
};

export class AudioStreamer {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private collecting: boolean = false;
  private pcmQueue: Int16Array[] = [];
  private lastCommitTs = 0;
  private waitingResponse = false;
  private options: Required<AudioStreamerOptions>;

  constructor(options: AudioStreamerOptions) {
    this.options = {
      sampleRateOut: options.sampleRateOut ?? 16000,
      appendMs: options.appendMs ?? 200,
      onError: options.onError ?? (() => {}),
      onStart: options.onStart ?? (() => {}),
      onStop: options.onStop ?? (() => {}),
      sendJson: options.sendJson,
    };
  }

  async start(stream: MediaStream) {
    try {
      this.ctx = new AudioContext({ sampleRate: 48000 });
      await this.ctx.resume();
      this.source = this.ctx.createMediaStreamSource(stream);
      // 4096 frame buffer for ScriptProcessor (deprecated but simplest)
      this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
      this.source.connect(this.processor);
      // Do NOT connect processor to destination to avoid mic echo/noise
      this.processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        const pcm16 = this.downsampleToPCM16(input, this.ctx!.sampleRate, this.options.sampleRateOut);
        if (pcm16.length > 0) {
          this.pcmQueue.push(pcm16);
        }
        this.flushIfNeeded();
      };
      this.collecting = true;
      this.options.onStart();
    } catch (e) {
      this.options.onError(e);
      await this.stop();
      throw e;
    }
  }

  async stop() {
    try {
      this.collecting = false;
      if (this.processor) {
        this.processor.disconnect();
        this.processor.onaudioprocess = null;
      }
      if (this.source) this.source.disconnect();
      if (this.ctx) await this.ctx.close();
    } catch {}
    this.ctx = null;
    this.source = null;
    this.processor = null;
    this.pcmQueue = [];
    this.lastCommitTs = 0;
    this.waitingResponse = false;
    this.options.onStop();
  }

  markResponseCompleted() {
    // call this when a response.completed (or equivalent) is received
    this.waitingResponse = false;
  }

  private flushIfNeeded() {
    if (!this.collecting || this.pcmQueue.length === 0) return;
    const now = Date.now();
    // Build roughly appendMs chunk
    const targetSamples = Math.floor((this.options.sampleRateOut * this.options.appendMs) / 1000);
    let collected = 0;
    const chunks: Int16Array[] = [];
    while (this.pcmQueue.length && collected < targetSamples) {
      const part = this.pcmQueue.shift()!;
      chunks.push(part);
      collected += part.length;
    }
    if (chunks.length === 0) return;
    const merged = this.concatInt16(chunks);
    const b64 = this.base64FromInt16(merged);
    // send append (302/OpenAI realtime expects only base64 audio when session is configured)
    const appendPayload = {
      type: 'input_audio_buffer.append',
      audio: b64,
    } as const;
    // debug
    try { console.debug('append', { samples: merged.length, bytes: merged.length * 2 }); } catch {}
    this.options.sendJson(appendPayload);

    // Commit every ~1s and request response if not already waiting
    if (now - this.lastCommitTs >= 600) {
      this.lastCommitTs = now;
      try { console.debug('commit'); } catch {}
      this.options.sendJson({ type: 'input_audio_buffer.commit' });
      if (!this.waitingResponse) {
        this.waitingResponse = true;
        const createPayload = {
          type: 'response.create',
          response: { modalities: ['audio', 'text'] },
        };
        try { console.debug('response.create'); } catch {}
        this.options.sendJson(createPayload);
      }
    }
  }

  private downsampleToPCM16(input: Float32Array, inRate: number, outRate: number): Int16Array {
    if (inRate === outRate) {
      return this.floatTo16(input);
    }
    const ratio = inRate / outRate;
    const newLen = Math.floor(input.length / ratio);
    const result = new Int16Array(newLen);
    let idx = 0;
    let i = 0;
    while (idx < newLen) {
      const next = Math.floor((idx + 1) * ratio);
      // simple average to reduce aliasing
      let sum = 0;
      let count = 0;
      for (; i < next && i < input.length; i++) {
        sum += input[i];
        count++;
      }
      const sample = count ? sum / count : 0;
      result[idx] = this.toPCM16(sample);
      idx++;
    }
    return result;
  }

  private floatTo16(input: Float32Array): Int16Array {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) out[i] = this.toPCM16(input[i]);
    return out;
  }

  private toPCM16(v: number): number {
    let s = Math.max(-1, Math.min(1, v));
    return s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  private concatInt16(parts: Int16Array[]): Int16Array {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Int16Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.length;
    }
    return out;
  }

  private base64FromInt16(ints: Int16Array): string {
    const bytes = new Uint8Array(ints.buffer, ints.byteOffset, ints.byteLength);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const sub = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode.apply(null, Array.from(sub) as any);
    }
    return btoa(binary);
  }
}


