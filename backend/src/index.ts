import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import sessionRouter from './routes/session.js';
import logsRouter from './routes/logs.js';
import http from 'http';
import { setupWsProxy } from './ws/proxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 80;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.use('/session', sessionRouter);
app.use('/logs', logsRouter);

// 静态文件服务（前端构建产物）
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// SPA 路由支持：所有非 API 路由都返回 index.html
app.get('*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
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


