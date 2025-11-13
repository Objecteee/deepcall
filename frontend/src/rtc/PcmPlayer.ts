export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private defaultSampleRate = 24000;
  private queueTime = 0; // seconds, scheduled playback cursor
  private currentSampleRate = this.defaultSampleRate;

  async ensureContext() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      await this.ctx.resume();
      this.queueTime = this.ctx.currentTime;
    }
  }

  setSampleRateHz(sr: number) {
    if (sr && sr > 0) this.currentSampleRate = sr;
  }

  async playBase64Pcm16(b64: string, sampleRate = this.currentSampleRate) {
    await this.ensureContext();
    const bytes = this.base64ToBytes(b64);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const samples = view.byteLength / 2;
    const floatData = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const s = view.getInt16(i * 2, true);
      floatData[i] = s / 0x8000;
    }
    const buffer = this.ctx!.createBuffer(1, floatData.length, sampleRate);
    buffer.copyToChannel(floatData, 0);
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx!.destination);
    const now = this.ctx!.currentTime;
    // schedule sequential playback to avoid gaps/overlap
    const startAt = Math.max(now, this.queueTime);
    src.start(startAt);
    this.queueTime = startAt + buffer.duration;
  }

  private base64ToBytes(b64: string): Uint8Array {
    const binaryString = atob(b64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
}


