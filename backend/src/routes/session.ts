import { Router } from 'express';
import { z } from 'zod';
import { createEphemeralToken } from '../services/openai';

const router = Router();

const SessionRequest = z.object({
  clientId: z.string().optional(),
});

router.post('/', async (req, res) => {
  const parsed = SessionRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'bad_request' });

  // In production, call OpenAI Realtime to create an ephemeral session token.
  const token = await createEphemeralToken();
  const payload = {
    ephemeralToken: token,
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    realtime: {
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      modalities: ['audio', 'text'],
    },
    rtc: {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }],
    },
    sessionId: 'sess_' + Math.random().toString(36).slice(2),
  };

  res.json(payload);
});

export default router;


