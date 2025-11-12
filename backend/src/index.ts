import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sessionRouter from './routes/session.js';
import logsRouter from './routes/logs.js';

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/session', sessionRouter);
app.use('/logs', logsRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

app.listen(PORT, () => {
  console.log(`DeepCall backend listening on http://localhost:${PORT}`);
});


