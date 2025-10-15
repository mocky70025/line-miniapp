// api/create-event.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

/** 空文字を null に変換（Postgres の date/time/text に安全） */
const toNull = (v) => (v === '' || v === undefined ? null : v);

/** 本文を堅牢にパース（Vercelの環境差分に強い） */
async function readJsonBody(req) {
  try {
    if (req.body && typeof req.body === 'object') return req.body;
    if (typeof req.json === 'function') return await req.json();
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** DEV_MODE ならバイパス、本番は LINE verify。ヘッダでも明示バイパス可。 */
async function getLineUserIdOrBypass(req, idToken) {
  const devMode = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  const devHeader = (req.headers?.['x-dev-bypass'] || req.headers?.['X-Dev-Bypass'] || '').toString().toLowerCase() === '1';
  if (devMode || devHeader) {
    return process.env.DEV_FIXED_LINE_USER || 'dev-user';
  }

  // 本番検証：idToken の形式チェック（JWS 3パート）
  if (!idToken || typeof idToken !== 'string' || idToken.split('.').length !== 3) {
    const msg = 'Invalid idToken format (expect JWS x.y.z)';
    const e = new Error(msg);
    e.code = 'INVALID_IDTOKEN_FORMAT';
    throw e;
  }

  const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: process.env.LINE_CHANNEL_ID || '',
    }),
  });

  const text = await resp.text();
  if (!resp.ok) {
    const e = new Error(`LINE verify failed: ${resp.status} ${text}`);
    e.code = 'LINE_VERIFY_FAILED';
    throw e;
  }

  let data;
  try { data = JSON.parse(text); }
  catch {
    const e = new Error(`LINE verify parse error: ${text}`);
    e.code = 'LINE_VERIFY_PARSE_ERROR';
    throw e;
  }

  if (!data?.sub) {
    const e = new Error('LINE user not found in id_token');
    e.code = 'LINE_SUB_MISSING';
    throw e;
  }
  return data.sub; // LINE userId
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  }

  try {
    const body = await readJsonBody(req);
    const { idToken = null, event } = body || {};
    if (!event || typeof event !== 'object') {
      return res.status(400).json({ ok: false, message: 'event payload required' });
    }

    // 開発: バイパス / 本番: LINE verify
    const line_user_id = await getLineUserIdOrBypass(req, idToken);

    // Supabase
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // サニタイズ（空文字→null / 配列整形）
    const payload = {
      created_by: toNull(line_user_id), // 作成者（hosts.line_user_id などに合わせて使うなら）
      event_name: event.event_name,
      event_name_kana: toNull(event.event_name_kana),
      genre: toNull(event.genre),
      label: toNull(event.label),
      lead: toNull(event.lead),
      description: toNull(event.description),
      supplement: toNull(event.supplement),
      main_image: toNull(event.main_image),
      sub_images: Array.isArray(event.sub_images)
        ? event.sub_images
        : (typeof event.sub_images === 'string'
            ? event.sub_images.split(',').map(s => s.trim()).filter(Boolean)
            : null),

      start_date: toNull(event.start_date),
      end_date: toNull(event.end_date),
      start_time: toNull(event.start_time),
      end_time: toNull(event.end_time),

      apply_start: toNull(event.apply_start),
      apply_end: toNull(event.apply_end),

      venue_name: toNull(event.venue_name),
      venue_address: toNull(event.venue_address),
      lat: event.lat ?? null,
      lon: event.lon ?? null,

      organizer: toNull(event.organizer),
      contact_name: toNull(event.contact_name),
      contact_phone: toNull(event.contact_phone),
      contact_email: toNull(event.contact_email),

      price: toNull(event.price),
      ticket_release: toNull(event.ticket_release),
      ticket_place: toNull(event.ticket_place),
    };

    // Insert
    const { data, error } = await supa.from('events').insert(payload).select('id').single();
    if (error) {
      // Supabase の詳細をそのまま返す（開発効率重視）
      return res.status(400).json({ ok: false, message: error.message || String(error), details: error.details || null, code: error.code || null });
    }

    return res.status(200).json({ ok: true, event_id: data.id });
  } catch (e) {
    const status = (e?.code === 'INVALID_IDTOKEN_FORMAT') ? 400
                 : (e?.code && String(e.code).startsWith('LINE_')) ? 401
                 : 400;
    const message = e?.message || e?.error?.message || JSON.stringify(e);
    return res.status(status).json({ ok: false, message });
  }
}
