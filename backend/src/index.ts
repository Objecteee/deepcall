import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sessionRouter from './routes/session';
import logsRouter from './routes/logs';
import chatRouter from './routes/chat';
import http from 'http';
import { setupWsProxy } from './ws/proxy';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/session', sessionRouter);
app.use('/logs', logsRouter);
app.use('/chat', chatRouter);

// 接收前端发送的屏幕共享帧（base64 JPEG）
// 后续可以在这里衔接 Qwen-Omni 的 append_video 能力
app.post('/screen-frame', (req, res) => {
  try {
    const { image_b64, width, height } = req.body || {};
    if (!image_b64 || typeof image_b64 !== 'string') {
      return res.status(400).json({ ok: false, error: 'invalid_image' });
    }

    // 当前版本仅做占位：不做持久化，也不转发，后续可接入实时多模态推理
    // console.log('收到屏幕帧', { width, height, size: image_b64.length });

    return res.json({ ok: true });
  } catch (err) {
    console.error('screen-frame error', err);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

const server = http.createServer(app);
setupWsProxy(server);
server.listen(PORT, () => {
  console.log(`DeepCall backend listening on http://localhost:${PORT}`);
});


