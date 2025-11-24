import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;

if (!DASHSCOPE_API_KEY) {
  console.warn('Warning: DASHSCOPE_API_KEY is not set. Summarization will fail.');
}

interface HistoryItem {
  role: 'user' | 'assistant';
  text: string;
}

interface SummarizeRequestBody {
  history: HistoryItem[];
  previousSummary?: string;
}

router.post('/summarize', async (req, res) => {
  try {
    const { history, previousSummary } = req.body as SummarizeRequestBody;

    if (!history || !Array.isArray(history) || history.length === 0) {
      // 如果没有新对话，直接返回旧摘要（如果有）
      return res.json({ summary: previousSummary || '' });
    }

    // 构造 Prompt
    const systemPrompt = `你是一个专业的对话记忆助手。你的任务是根据【已有记忆】和【新增对话】，生成一份更新后的、简练的【用户画像摘要】。
    
要求：
1. 重点关注用户的：姓名、职业、性格偏好、生活习惯、提到的关键事件。
2. 忽略客套话（如“你好”、“再见”）。
3. 保持摘要在 200 字以内，使用第三人称（如“用户叫...”）。
4. 直接输出摘要内容，不要任何解释或前缀。
5. 要注意内容的覆盖和更新，不要重复之前的记忆。`;

    const userContent = `
【已有记忆】：
${previousSummary || '无'}

【新增对话】：
${history.map((h: HistoryItem) => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n')}
    `;

    // 调用 qwen-turbo (Qwen-Plus 也可以，视预算而定，turbo最便宜)
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen-turbo',
        input: {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ]
        },
        parameters: {
          result_format: 'text'
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('DashScope API Error:', errText);
      throw new Error(`API responded with ${response.status}`);
    }

    const data = await response.json() as { output?: { text?: string } };
    const summary = data?.output?.text || previousSummary || '';

    res.json({ summary });

  } catch (error: any) {
    console.error('Summarize error:', error);
    res.status(500).json({ error: 'Failed to generate summary', details: error.message });
  }
});

export default router;

