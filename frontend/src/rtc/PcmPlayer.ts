export class Pcm24Player {
  private ctx: AudioContext | null = null;
  private queueTime = 0;
  private sampleRate = 24000; // DashScope output_audio_format pcm24 default 24kHz per doc

  private async ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      await this.ctx.resume();
      this.queueTime = this.ctx.currentTime;
    }
  }

  setSampleRateHz(sr: number) {
    if (sr && sr > 0) this.sampleRate = sr;
  }

  async playBase64Pcm24(b64: string) {
    await this.ensure();
    const bytes = this.base64ToBytes(b64);
    // 24-bit little-endian to float32
    const sampleCount = Math.floor(bytes.length / 3);
    const floatData = new Float32Array(sampleCount);
    for (let i = 0, o = 0; i < sampleCount; i++, o += 3) {
      // compose 24-bit signed int (little endian)
      let v = (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16));
      if (v & 0x800000) v |= ~0xffffff; // sign extend
      floatData[i] = Math.max(-1, Math.min(1, v / 0x7fffff));
    }
    const buffer = this.ctx!.createBuffer(1, floatData.length, this.sampleRate);
    buffer.copyToChannel(floatData, 0);
    const src = this.ctx!.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx!.destination);
    const startAt = Math.max(this.ctx!.currentTime, this.queueTime);
    src.start(startAt);
    this.queueTime = startAt + buffer.duration;
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
}
