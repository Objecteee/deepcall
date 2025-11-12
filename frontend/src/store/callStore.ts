import { create } from 'zustand';

export type CallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export type Subtitle = {
  role: 'user' | 'assistant';
  text: string;
  timestamp?: number;
};

type CallState = {
  status: CallStatus;
  subtitles: Subtitle[];
  selectedMicId: string | null;
  setStatus: (s: CallStatus) => void;
  addSubtitle: (s: Subtitle) => void;
  clearSubtitles: () => void;
  setSelectedMicId: (id: string | null) => void;
};

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  subtitles: [],
  selectedMicId: null,
  setStatus: (status) => set({ status }),
  addSubtitle: (s) => set((st) => ({ subtitles: [...st.subtitles, s] })),
  clearSubtitles: () => set({ subtitles: [] }),
  setSelectedMicId: (selectedMicId) => set({ selectedMicId }),
}));


