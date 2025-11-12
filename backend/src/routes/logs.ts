import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const Turn = z.object({
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  text: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
});

const LogsRequest = z.object({
  sessionId: z.string(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  turns: z.array(Turn),
  meta: z.record(z.any()).optional(),
});

router.post('/', async (req, res) => {
  const parsed = LogsRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'bad_request' });
  // TODO: persist into DB (Prisma/SQL). For now, return a fake ID.
  res.json({ ok: true, conversationId: 'conv_' + Date.now() });
});

export default router;


