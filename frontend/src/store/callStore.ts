import { create } from 'zustand';

export type CallStatus = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'ended';

export type Subtitle = {
  role: 'user' | 'assistant';
  text: string;
  timestamp?: number;
  isComplete?: boolean; // 标记消息是否完整
};

type CallState = {
  status: CallStatus;
  subtitles: Subtitle[];
  selectedMicId: string | null;
  setStatus: (s: CallStatus) => void;
  addSubtitle: (s: Subtitle) => void;
  appendToLastSubtitle: (text: string, role: 'user' | 'assistant') => void;
  markLastSubtitleComplete: () => void;
  clearSubtitles: () => void;
  setSelectedMicId: (id: string | null) => void;
};

export const useCallStore = create<CallState>((set) => ({
  status: 'idle',
  subtitles: [],
  selectedMicId: null,
  setStatus: (status) => set({ status }),
  addSubtitle: (s) => set((st) => ({ 
    subtitles: [...st.subtitles, { ...s, timestamp: Date.now(), isComplete: false }] 
  })),
  // 追加文本到最后一条字幕（流式更新）
  appendToLastSubtitle: (text, role) => {
    console.log(`💬 appendToLastSubtitle: role=${role}, text="${text}"`);
    set((st) => {
      console.log(`  当前subtitles数量: ${st.subtitles.length}`);
      const lastIdx = st.subtitles.length - 1;
      if (lastIdx >= 0 && st.subtitles[lastIdx].role === role && !st.subtitles[lastIdx].isComplete) {
        // 更新最后一条消息
        console.log('  → 追加到最后一条消息');
        const updated = [...st.subtitles];
        updated[lastIdx] = { ...updated[lastIdx], text: updated[lastIdx].text + text };
        console.log('  新的subtitles数量:', updated.length);
        return { subtitles: updated };
      } else {
        // 创建新消息
        console.log('  → 创建新消息');
        const newSubtitles = [...st.subtitles, { role, text, timestamp: Date.now(), isComplete: false }];
        console.log('  新的subtitles数量:', newSubtitles.length);
        return { subtitles: newSubtitles };
      }
    });
  },
  // 标记最后一条字幕为完整
  markLastSubtitleComplete: () => set((st) => {
    const lastIdx = st.subtitles.length - 1;
    if (lastIdx >= 0) {
      const updated = [...st.subtitles];
      updated[lastIdx] = { ...updated[lastIdx], isComplete: true };
      return { subtitles: updated };
    }
    return st;
  }),
  clearSubtitles: () => set({ subtitles: [] }),
  setSelectedMicId: (selectedMicId) => set({ selectedMicId }),
}));


