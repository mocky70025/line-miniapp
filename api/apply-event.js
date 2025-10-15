// api/apply-event.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

/** JSON パーサ（Vercel差異に強い） */
async function readJsonBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.json === 'function') return await req.json();
    const chunks = []; for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

/** DEV_MODE のときだけ固定ユーザーを返す。本番は LINE verify */
async function getLineUserIdOrBypass(req, idToken) {
  const dev = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  if (dev) return process.env.DEV_FIXED_LINE_USER || 'dev-user';

  if (!idToken || typeof idToken !== 'string' || idToken.split('.').length !== 3) {
    const e = new Error('Invalid idToken format (expect JWS x.y.z)');
    e.code = 'INVALID_IDTOKEN_FORMAT';
    throw e;
  }
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: process.env.LINE_CHANNEL_ID || '',
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    const e = new Error(`LINE verify failed: ${r.status} ${text}`);
    e.code = 'LINE_VERIFY_FAILED';
    throw e;
  }
  let data; try { data = JSON.parse(text); } catch { throw new Error(`LINE verify parse error: ${text}`); }
  if (!data?.sub) throw new Error('LINE user not found in id_token');
  return data.sub;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  try {
    const body = await readJsonBody(req);
    const { event_id, store_name, phone, email, memo, idToken } = body || {};

    // event_id を厳密に数値化
    const evId = Number.parseInt(String(event_id ?? ''), 10);
    if (!Number.isFinite(evId) || evId <= 0) {
      return res.status(400).json({ ok: false, message: 'event_id required' });
    }

    const line_user_id = await getLineUserIdOrBypass(req, idToken);

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .from('event_applications')
      .insert({
        event_id    : evId,
        line_user_id,
        store_name  : store_name ?? null,
        phone       : phone ?? null,
        email       : email ?? null,
        memo        : memo ?? null,
      })
      .select('id')
      .single();

    if (error) return res.status(400).json({ ok: false, message: error.message || String(error) });

    return res.status(200).json({ ok: true, application_id: data.id });
  } catch (e) {
    const status = (e?.code === 'INVALID_IDTOKEN_FORMAT' || e?.code === 'LINE_VERIFY_FAILED') ? 401 : 400;
    return res.status(status).json({ ok: false, message: e?.message || String(e) });
  }
}
