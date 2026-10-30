// Live viewers: every open tab of the app posts a heartbeat here (a random tab id, every 20 s); the count is
// the number of tabs heard from in the last 45 s. Stored in Redis (Upstash, from the Vercel Marketplace) as
// one sorted set: member = tab id, score = time last heard. No personal data: the id is random per tab.
//
// Needs KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN), which
// connecting an Upstash Redis store to the Vercel project sets. Without them it answers 503 and the app
// shows the count as offline.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'floorplan:presence';
const TTL = 45_000;

async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`redis ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) { res.status(503).json({ error: 'presence store not configured' }); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const id = typeof body?.id === 'string' && /^[a-z0-9-]{8,40}$/i.test(body.id) ? body.id : null;
  if (!id) { res.status(400).json({ error: 'bad id' }); return; }
  const now = Date.now();
  try {
    const out = await redis([
      body.leave ? ['ZREM', KEY, id] : ['ZADD', KEY, String(now), id],
      ['ZREMRANGEBYSCORE', KEY, '-inf', String(now - TTL)],
      ['ZCARD', KEY],
      ['PEXPIRE', KEY, String(TTL * 4)],
    ]);
    res.status(200).json({ count: Number(out[2]?.result) || 0 });
  } catch {
    res.status(502).json({ error: 'presence store unavailable' });
  }
}
