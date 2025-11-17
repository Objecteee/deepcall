import type { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';

export function setupWsProxy(server: Server) {
  const wss = new WebSocketServer({ server, path: '/realtime/ws' });

  // 显式标注参数类型为 any，避免 strict 模式下的隐式 any 报错
  wss.on('connection', async (client: any, req: any) => {
    try {
      const apiKey = process.env.DASHSCOPE_API_KEY || process.env.OPENAI_API_KEY; // allow reuse if user sets OPENAI_API_KEY
      if (!apiKey) {
        client.close(1011, 'missing api key');
        return;
      }

      const url = new URL(req.url || '', 'http://localhost');
      const model = (url.searchParams.get('model') || process.env.REALTIME_MODEL || 'qwen3-omni-flash-realtime').trim();
      const base = process.env.REALTIME_BASE || 'wss://dashscope.aliyuncs.com/api-ws/v1/realtime';
      const upstreamUrl = `${base}?model=${encodeURIComponent(model)}`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
      };

      const upstream = new WebSocket(upstreamUrl, { headers });

      let pingTimer: NodeJS.Timeout | null = null;

      upstream.on('open', () => {
        // keepalive to prevent idle close
        pingTimer = setInterval(() => {
          try { (upstream as any).ping?.(); } catch {}
        }, 20000);
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'upstream.open' }));
        }
      });

      upstream.on('message', (data: any, isBinary: any) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: isBinary });
        }
      });

      upstream.on('error', (err: any) => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'upstream.error', message: (err as any)?.message || 'error' }));
          }
          client.close(1011, 'upstream error');
        } catch {}
      });

      upstream.on('close', (code: any, reason: any) => {
        try {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'upstream.close', code, reason: reason.toString() }));
            client.close(code, reason.toString());
          }
        } catch {}
        if (pingTimer) clearInterval(pingTimer);
      });

      client.on('message', (data: any, isBinary: any) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        }
      });

      client.on('close', () => {
        try { if (upstream.readyState === WebSocket.OPEN) upstream.close(); } catch {}
        if (pingTimer) clearInterval(pingTimer);
      });

      client.on('error', () => {
        try { if (upstream.readyState === WebSocket.OPEN) upstream.close(); } catch {}
        if (pingTimer) clearInterval(pingTimer);
      });
    } catch {
      try { client.close(1011, 'proxy init error'); } catch {}
    }
  });
}
