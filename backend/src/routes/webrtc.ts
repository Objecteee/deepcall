import { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

router.post('/offer', async (req, res) => {
  try {
    const { sdp, model = 'gpt-4o-realtime-preview-2024-12-17', voice = 'alloy' } = req.body || {};
    if (!sdp) return res.status(400).json({ ok: false, error: 'missing_sdp' });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'missing_api_key' });

    // Switch to OpenAI official Realtime WebRTC endpoint
    const base = `https://api.openai.com/v1/realtime`;
    const url = `${base}?model=${encodeURIComponent(model)}&voice=${encodeURIComponent(voice)}`;
    // Attempt JSON body first (some providers require { sdp, type })
    // Optional HTTPS proxy (corporate networks)
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    let agent: any = undefined;
    if (proxyUrl) {
      const { HttpsProxyAgent } = await import('https-proxy-agent');
      agent = new HttpsProxyAgent(proxyUrl);
    }
    const commonHeaders = {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/sdp, application/json',
      'OpenAI-Beta': 'realtime=v1',
    } as Record<string, string>;

    const tryJson = async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...commonHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sdp,
          type: 'offer',
          model,
          voice,
          modalities: ['audio', 'text'],
        }),
        agent,
      });
      return r;
    };
    const trySdp = async () => {
      const r = await fetch(url, {
        method: 'POST',
        headers: { ...commonHeaders, 'Content-Type': 'application/sdp' },
        body: sdp,
        agent,
      });
      return r;
    };

    let resp = await tryJson();
    if (!resp.ok && resp.status === 400) {
      // Fallback: some servers expect raw SDP
      resp = await trySdp();
    }

    const ctype = resp.headers.get('content-type') || '';
    if (!resp.ok) {
      const body = await resp.text();
      console.error('Realtime offer failed', {
        status: resp.status,
        headers: Object.fromEntries(resp.headers.entries()),
        endpoint: url,
        body: body.slice(0, 800),
      });
      return res.status(resp.status).type(ctype.includes('json') ? 'application/json' : 'text/plain').send(body);
    }

    if (ctype.includes('application/json')) {
      const data = await resp.json().catch(() => ({}));
      const answerSdp =
        (data && (data.sdp || data.answer?.sdp || data.webrtc?.answer)) || '';
      if (!answerSdp) {
        console.error('Realtime offer ok but no SDP in JSON', data);
        return res.status(502).json({ ok: false, error: 'no_sdp_in_response' });
      }
      return res.type('application/sdp').send(answerSdp);
    } else {
      const text = await resp.text();
      return res.type('application/sdp').send(text);
    }
  } catch (err: any) {
    console.error('webrtc/offer error', err);
    res.status(500).json({ ok: false, error: 'webrtc_offer_failed' });
  }
});

export default router;


