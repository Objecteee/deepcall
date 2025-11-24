export type HistoryItem = {
  id: string;
  date: number;
  subtitles: Array<{
    role: 'user' | 'assistant';
    text: string;
    timestamp?: number;
  }>;
};

