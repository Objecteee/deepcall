import { useState, useCallback, useEffect } from 'react';
import { App as AntdApp } from 'antd';
import { useCallStore } from '@store/callStore';
import { HistoryItem } from '@types/history';

const MEMORY_KEY = 'deepcall_user_summary';
const HISTORY_KEY = 'deepcall_history';

export function useHistoryAndMemory() {
  const { message } = AntdApp.useApp();
  const { subtitles } = useCallStore();

  const [isHistoryDrawerOpen, setIsHistoryDrawerOpen] = useState(false);
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);
  
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [memoryContent, setMemoryContent] = useState('');

  const loadHistory = useCallback(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setHistoryList(Array.isArray(parsed) ? parsed : []);
      } else {
        setHistoryList([]);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistoryList([]);
    }
  }, []);

  // 当抽屉打开时，自动重新加载历史记录
  useEffect(() => {
    if (isHistoryDrawerOpen) {
      loadHistory();
    }
  }, [isHistoryDrawerOpen, loadHistory]);

  const saveCurrentSession = useCallback(() => {
    try {
      if (subtitles.length === 0) return;

      const session: HistoryItem = {
        id: `session_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        date: Date.now(),
        subtitles: subtitles.filter(s => s.text && s.text.trim().length > 0)
      };

      const existing = localStorage.getItem(HISTORY_KEY);
      const history = existing ? JSON.parse(existing) : [];
      history.unshift(session);
      
      const limited = history.slice(0, 50);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(limited));
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }, [subtitles]);

  const deleteHistory = useCallback((id: string) => {
    try {
      const existing = localStorage.getItem(HISTORY_KEY);
      if (!existing) return;
      const history = JSON.parse(existing) as HistoryItem[];
      const filtered = history.filter(h => h.id !== id);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
      loadHistory();
      message.success('已删除');
    } catch (err) {
      console.error('Failed to delete history:', err);
      message.error('删除失败');
    }
  }, [loadHistory, message]);

  // Memory related
  const openMemoryModal = useCallback(() => {
    const current = localStorage.getItem(MEMORY_KEY) || '';
    setMemoryContent(current);
    setIsMemoryModalOpen(true);
  }, []);

  const saveMemory = useCallback(() => {
    localStorage.setItem(MEMORY_KEY, memoryContent);
    message.success('记忆已更新');
    setIsMemoryModalOpen(false);
  }, [memoryContent, message]);

  const clearMemory = useCallback(() => {
    localStorage.removeItem(MEMORY_KEY);
    setMemoryContent('');
    message.success('记忆已清除');
  }, [message]);

  const updateMemorySummary = useCallback(async () => {
    try {
      const history = subtitles
        .filter(s => s.text && s.text.trim().length > 0)
        .map(s => ({ role: s.role, text: s.text }));

      if (history.length === 0) return;

      const previousSummary = localStorage.getItem(MEMORY_KEY) || '';
      
      const res = await fetch('/chat/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history, previousSummary })
      });

      if (!res.ok) throw new Error('Summary API failed');
      
      const data = await res.json();
      if (data.summary) {
        localStorage.setItem(MEMORY_KEY, data.summary);
        console.log('记忆摘要已更新:', data.summary);
      }
    } catch (err) {
      console.error('Failed to update memory summary:', err);
    }
  }, [subtitles]);

  const getInstructionsWithMemory = useCallback(() => {
    const savedSummary = localStorage.getItem(MEMORY_KEY);
    let instructions = '你是一个情感丰富、逻辑清晰的AI助手。请以自然、亲切的口吻与用户对话，像老朋友一样交流。在回答复杂问题时，请保持思维缜密，分点表述，确保逻辑通顺。请始终使用中文回答。';
    
    if (savedSummary) {
      instructions += `\n\n【长期记忆】\n这是你与该用户过往的对话记忆摘要，请在对话中自然地利用这些信息（如用户姓名、职业、偏好等），保持跨会话的连贯感：\n${savedSummary}`;
    }
    return instructions;
  }, []);

  return {
    isHistoryDrawerOpen,
    setIsHistoryDrawerOpen,
    historyList,
    loadHistory,
    saveCurrentSession,
    deleteHistory,
    isMemoryModalOpen,
    setIsMemoryModalOpen,
    memoryContent,
    setMemoryContent,
    openMemoryModal,
    saveMemory,
    clearMemory,
    updateMemorySummary,
    getInstructionsWithMemory
  };
}

