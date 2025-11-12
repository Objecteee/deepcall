export type RealtimeClientEvents = {
  onRemoteTrack?: (stream: MediaStream) => void;
  onTextDelta?: (payload: { role: 'user' | 'assistant'; text: string }) => void;
  onStateChange?: (state: 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended') => void;
};

export class RealtimeClient {
  private pc: RTCPeerConnection | null = null;
  private events: RealtimeClientEvents;
  private remoteStream: MediaStream | null = null;

  constructor(events: RealtimeClientEvents = {}) {
    this.events = events;
  }

  async init(iceServers: RTCIceServer[]) {
    this.pc = new RTCPeerConnection({ iceServers });
    this.remoteStream = new MediaStream();
    this.pc.ontrack = (ev) => {
      ev.streams[0]?.getTracks().forEach((t) => this.remoteStream?.addTrack(t));
      this.events.onRemoteTrack?.(ev.streams[0] || this.remoteStream!);
    };
  }

  async addLocalStream(stream: MediaStream) {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  async connect(ephemeralToken: string, model: string, voice: string) {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    this.events.onStateChange?.('connecting');
    const offer = await this.pc.createOffer({ offerToReceiveAudio: true });
    await this.pc.setLocalDescription(offer);

    const sdpAnswer = await fetch(
      `https://api.openai.com/v1/realtime?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ephemeralToken}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp ?? '',
      }
    ).then((r) => r.text());

    await this.pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer });
    this.events.onStateChange?.('listening');
  }

  async interrupt() {
    // TODO: Use DataChannel to send cancel command when available in API.
    // Placeholder only.
  }

  async disconnect() {
    this.pc?.getSenders().forEach((s) => s.track?.stop());
    this.pc?.close();
    this.pc = null;
    this.events.onStateChange?.('ended');
  }
}


