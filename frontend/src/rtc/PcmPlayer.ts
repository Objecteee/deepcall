export class Pcm24Player {
  private ctx: AudioContext | null = null;
  private queueTime = 0;
  private sampleRate = 24000; // default to 24 kHz per Qwen Omni docs
  private activeSources: AudioBufferSourceNode[] = []; // Track all playing sources
  // 对外暴露的 Analyser，用于可视化
  public analyser: AnalyserNode | null = null;

  private async ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      await this.ctx.resume();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256; // 可视化所需的采样窗口大小
      // 将 Analyser 连接到 Destination，这样后续 Source -> Analyser -> Destination
      this.analyser.connect(this.ctx.destination);
      this.queueTime = this.ctx.currentTime;
    }
  }

  setSampleRateHz(sr: number) {
    if (sr && sr > 0) this.sampleRate = sr;
  }

  /**
   * 立即停止所有正在播放的音频，清空队列
   */
  stopAll() {
    // Stop all active sources
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeSources = [];
    // Reset queue time to current time
    if (this.ctx) {
      this.queueTime = this.ctx.currentTime;
    }
  }

  async playBase64Pcm24(b64: string) {
    await this.ensure();
    const bytes = this.base64ToBytes(b64);

    // Qwen-Omni 实时音频下行：PCM_24000HZ_MONO_16BIT
    // 若误收到容器格式（Opus Ogg/WAV RIFF），直接跳过，避免噪声
    if (bytes.length >= 4) {
      const h0 = bytes[0], h1 = bytes[1], h2 = bytes[2], h3 = bytes[3];
      const isOgg = h0 === 0x4f && h1 === 0x67 && h2 === 0x67 && h3 === 0x53; // "OggS"
      const isRiff = h0 === 0x52 && h1 === 0x49 && h2 === 0x46 && h3 === 0x46; // "RIFF"
      if (isOgg || isRiff) {
        console.warn('收到容器音频（Opus/WAV），已忽略该分片。请改用 WebRTC 远端音轨或接入对应解码器。');
        return;
      }
    }

    // 强制按 PCM16LE 解码（必要时丢弃尾部奇数字节）
    const evenBytes = (bytes.length & 1) ? bytes.slice(0, bytes.length - 1) : bytes;
    const floats = this.decodePcm16LE(evenBytes);

    const buffer = this.ctx!.createBuffer(1, floats.length, this.sampleRate);
    const ch0 = buffer.getChannelData(0);
    ch0.set(floats);
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    // 连接链路：Source -> Analyser -> Destination
    if (this.analyser) {
      src.connect(this.analyser);
    } else {
      src.connect(this.ctx!.destination);
    }
    const startAt = Math.max(this.ctx!.currentTime, this.queueTime);
    src.start(startAt);
    this.queueTime = startAt + buffer.duration;
    
    // Track this source and remove it when it ends
    this.activeSources.push(src);
    src.onended = () => {
      const idx = this.activeSources.indexOf(src);
      if (idx !== -1) this.activeSources.splice(idx, 1);
    };
  }

  private pickBest(candidates: Float32Array[]): Float32Array {
    if (candidates.length === 1) return candidates[0];

    let best = candidates[0];
    let bestScore = -Infinity;
    for (const data of candidates) {
      const score = this.scoreSignal(data);
      if (score > bestScore) {
        bestScore = score;
        best = data;
      }
    }
    return best;
  }

  private scoreSignal(data: Float32Array): number {
    const n = data.length;
    if (n === 0) return -Infinity;
    let sumSq = 0;
    let zc = 0;
    let prev = data[0];
    let clipped = 0;
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const v = data[i];
      sumSq += v * v;
      mean += v;
      if ((v >= 0 && prev < 0) || (v < 0 && prev >= 0)) zc++;
      if (Math.abs(v) > 0.98) clipped++;
      prev = v;
    }
    mean /= n;
    const rms = Math.sqrt(sumSq / n);
    const zcRate = zc / n; // 0..1
    // Penalize DC offset heavily
    const dcPenalty = -Math.min(1, Math.abs(mean) * 5);
    // Score favors mid RMS, reasonable zero-crossings, low clipping, low DC
    const rmsScore = -Math.abs(rms - 0.2);
    const zcScore = -Math.abs(zcRate - 0.05);
    const clipPenalty = -(clipped / n) * 3;
    return rmsScore + zcScore + clipPenalty + dcPenalty;
  }

  private decodePcm24LE(bytes: Uint8Array): Float32Array {
    const sampleCount = Math.floor(bytes.length / 3);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 3) {
      let v = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16));
      if (v & 0x800000) v |= ~0xffffff;
      floatData[i] = Math.max(-1, Math.min(1, v / 8388608));
    }
    return floatData;
  }

  private decodePcm24BE(bytes: Uint8Array): Float32Array {
    const sampleCount = Math.floor(bytes.length / 3);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 3) {
      let v = (bytes[o + 2] | (bytes[o + 1] << 8) | (bytes[o] << 16));
      if (v & 0x800000) v |= ~0xffffff;
      floatData[i] = Math.max(-1, Math.min(1, v / 8388608));
    }
    return floatData;
  }

  private decodeHi16From24LE(bytes: Uint8Array): Float32Array {
    const sampleCount = Math.floor(bytes.length / 3);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 3) {
      const lo = bytes[o + 1] | (bytes[o + 2] << 8); // mid, MSB
      const sv = (lo & 0x8000) ? lo - 0x10000 : lo;
      floatData[i] = Math.max(-1, Math.min(1, sv / 32768));
    }
    return floatData;
  }

  private decodeLo16From24LE(bytes: Uint8Array): Float32Array {
    const sampleCount = Math.floor(bytes.length / 3);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 3) {
      const lo = bytes[o] | (bytes[o + 1] << 8); // LSB, Mid
      const sv = (lo & 0x8000) ? lo - 0x10000 : lo;
      floatData[i] = Math.max(-1, Math.min(1, sv / 32768));
    }
    return floatData;
  }

  private decodeMid16From24LE(bytes: Uint8Array): Float32Array {
    // Interpret the middle+zero-extended as 16-bit (some encoders do this)
    const sampleCount = Math.floor(bytes.length / 3);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 3) {
      const midOnly = bytes[o + 1] | (0 << 8);
      const sv = (midOnly & 0x8000) ? midOnly - 0x10000 : midOnly;
      floatData[i] = Math.max(-1, Math.min(1, sv / 32768));
    }
    return floatData;
  }

  private decodePcm16LE(bytes: Uint8Array): Float32Array {
    const sampleCount = Math.floor(bytes.length / 2);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 2) {
      const v = (bytes[o] | (bytes[o + 1] << 8));
      const sv = (v & 0x8000) ? v - 0x10000 : v;
      floatData[i] = Math.max(-1, Math.min(1, sv / 32768));
    }
    return floatData;
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}
