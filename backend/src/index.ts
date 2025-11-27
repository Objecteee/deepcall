import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sessionRouter from './routes/session.js';
import logsRouter from './routes/logs.js';
import chatRouter from './routes/chat.js';
import http from 'http';
import { setupWsProxy } from './ws/proxy.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS 配置：生产环境可以更严格
if (NODE_ENV === 'development') {
  app.use(cors());
} else {
  // 生产环境：只允许同源或特定域名
  app.use(cors({
    origin: process.env.CORS_ORIGIN || false, // false 表示不允许跨域
    credentials: true
  }));
}

app.use(express.json({ limit: '2mb' }));

// API 路由
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

// 生产环境：托管前端静态文件
if (NODE_ENV === 'production') {
  // 前端构建产物路径（相对于编译后的 backend/dist 目录）
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  
  console.log(`[Production] Serving frontend from: ${frontendDistPath}`);
  
  // 托管静态资源（CSS, JS, images 等）
  app.use(express.static(frontendDistPath));
  
  // 所有非 API 路由都返回 index.html（支持前端路由）
  app.get('*', (_req, res) => {
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // 开发环境提示
  app.get('*', (_req, res) => {
    res.json({ 
      message: 'DeepCall Backend API',
      mode: 'development',
      hint: 'Frontend dev server should run on port 5173'
    });
  });
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ ok: false, error: 'internal_error' });
});

const server = http.createServer(app);
setupWsProxy(server);
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 DeepCall Server Started`);
  console.log('='.repeat(60));
  console.log(`📡 Backend API:  http://localhost:${PORT}`);
  console.log(`🌍 Environment:  ${NODE_ENV}`);
  if (NODE_ENV === 'production') {
    console.log(`🎨 Frontend:     http://localhost:${PORT} (static files)`);
  } else {
    console.log(`🎨 Frontend:     http://localhost:5173 (dev server)`);
  }
  console.log('='.repeat(60));
});


