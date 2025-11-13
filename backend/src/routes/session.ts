import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const SessionRequest = z.object({
  clientId: z.string().optional(),
  model: z.string().optional(),
  voice: z.string().optional(),
});

router.post('/', async (req, res) => {
  const parsed = SessionRequest.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, error: 'bad_request' });

  const model = parsed.data.model || 'qwen3-omni-flash-realtime';
  const voice = parsed.data.voice || 'Cherry';

  // No token issuance needed for DashScope WS; keep a simple session payload
  const payload = {
    ephemeralToken: null, // not used in WS mode
    expiresAt: Math.floor(Date.now() / 1000) + 60,
    realtime: {
      model,
      voice,
      modalities: ['audio', 'text'],
    },
    rtc: {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }], // kept for compatibility
    },
    sessionId: 'sess_' + Math.random().toString(36).slice(2),
  };

  res.json(payload);
});

export default router;