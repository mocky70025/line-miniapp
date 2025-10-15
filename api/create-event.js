// api/create-event.js
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

/** Vercel環境差異に強い JSON パーサ */
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

  // 本番ルート：ヘッダのバイパスは無視
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
  return data.sub; // LINE userId
}

/** サニタイズ/整形 */
function normalizeEventPayload(input = {}) {
  const e = { ...input };

  // 型整理
  const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));
  e.lat = toNum(e.lat);
  e.lon = toNum(e.lon);

  // sub_images は配列 or カンマ区切り文字列のどちらでもOK
  if (Array.isArray(e.sub_images)) {
    if (!e.sub_images.length) e.sub_images = null;
  } else if (typeof e.sub_images === 'string') {
    const arr = e.sub_images.split(',').map(s => s.trim()).filter(Boolean);
    e.sub_images = arr.length ? arr : null;
  } else {
    e.sub_images = null;
  }

  // 空文字は null に統一
  for (const k of Object.keys(e)) {
    if (typeof e[k] === 'string' && e[k].trim() === '') e[k] = null;
  }

  return e;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  try {
    const body = await readJsonBody(req);
    const { idToken, event } = body || {};
    if (!event || typeof event !== 'object') {
      return res.status(400).json({ ok: false, message: 'event payload required' });
    }

    const line_user_id = await getLineUserIdOrBypass(req, idToken);
    const payload = normalizeEventPayload(event);

    // 必須
    if (!payload.event_name) return res.status(400).json({ ok: false, message: 'event_name required' });

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .from('events')
      .insert({
        // 開発時に作ってきたカラムに合わせてマッピング
        event_name          : payload.event_name,
        event_name_kana     : payload.event_name_kana ?? null,
        genre               : payload.genre ?? null,
        label               : payload.label ?? null,
        start_date          : payload.start_date ?? null,
        end_date            : payload.end_date ?? null,
        start_time          : payload.start_time ?? null,
        end_time            : payload.end_time ?? null,
        apply_start         : payload.apply_start ?? null,
        apply_end           : payload.apply_end ?? null,
        lead                : payload.lead ?? null,
        description         : payload.description ?? null,
        supplement          : payload.supplement ?? null,
        main_image          : payload.main_image ?? null,
        sub_images          : payload.sub_images ?? null, // text[] なら supabase-js が自動で配列保存
        venue_name          : payload.venue_name ?? null,
        venue_address       : payload.venue_address ?? null,
        lat                 : payload.lat,
        lon                 : payload.lon,
        organizer           : payload.organizer ?? null,
        contact_name        : payload.contact_name ?? null,
        contact_phone       : payload.contact_phone ?? null,
        contact_email       : payload.contact_email ?? null,
        price               : payload.price ?? null,
        ticket_release      : payload.ticket_release ?? null,
        ticket_place        : payload.ticket_place ?? null,

        // 追跡用
        created_by          : line_user_id,
      })
      .select('id')
      .single();

    if (error) return res.status(400).json({ ok: false, message: error.message || String(error) });

    return res.status(200).json({ ok: true, event_id: data.id });
  } catch (e) {
    const status = (e?.code === 'INVALID_IDTOKEN_FORMAT' || e?.code === 'LINE_VERIFY_FAILED') ? 401 : 400;
    return res.status(status).json({ ok: false, message: e?.message || String(e) });
  }
}
