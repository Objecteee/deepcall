import type { Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { URL } from 'url';

type Query = { model?: string; voice?: string };

export function setupWsProxy(server: Server) {
  const wss = new WebSocketServer({ server, path: '/realtime/ws' });

  wss.on('connection', async (client, req) => {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        client.close(1011, 'missing api key');
        return;
      }

      const u = new URL(req.url || '', 'http://localhost');
      const model = (u.searchParams.get('model') || 'gpt-4o-realtime-preview-2024-12-17').trim();
      const voice = (u.searchParams.get('voice') || 'alloy').trim();

      const base = process.env.REALTIME_BASE || 'wss://api.302.ai/v1/realtime';
      const upstreamUrl = `${base}?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`;
      const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
      let agent: any = undefined;
      if (proxyUrl) {
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        agent = new HttpsProxyAgent(proxyUrl);
      }

      // Some providers expect a subprotocol; include common OpenAI realtime ones (harmless if ignored)
      const protocols = ['openai-realtime-v1', 'openai-realtime', 'openai-insecure-websocket-protocol', 'realtime'];
      const upstream = new WebSocket(upstreamUrl, protocols, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
          // Some CDNs require a non-empty Origin for WSS
          Origin: 'https://localhost',
          'User-Agent': 'DeepCall/1.0',
          'Accept': '*/*',
        },
        agent,
      });

      // Wire events
      upstream.on('open', () => client.send(JSON.stringify({ type: 'upstream.open' })));
      upstream.on('message', (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data, { binary: isBinary });
        }
      });
      upstream.on('error', (err) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'upstream.error', message: (err as any)?.message || 'error' }));
        }
        client.close(1011, 'upstream error');
      });
      upstream.on('close', (code, reason) => {
        if (client.readyState === WebSocket.OPEN) {
          client.close(code, reason.toString());
        }
      });

      client.on('message', (data, isBinary) => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.send(data, { binary: isBinary });
        }
      });
      client.on('close', () => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.close();
        }
      });
      client.on('error', () => {
        if (upstream.readyState === WebSocket.OPEN) {
          upstream.close();
        }
      });
    } catch (err) {
      try {
        client.close(1011, 'proxy init error');
      } catch {}
    }
  });
}


