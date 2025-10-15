import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const toNull = (v) => (v === '' || v === undefined ? null : v);

async function getLineUserIdOrBypass(idToken) {
  const dev = String(process.env.DEV_MODE || '').toLowerCase() === 'true';
  if (dev) return process.env.DEV_FIXED_LINE_USER || 'dev-user';
  // 本番: LINE verify
  const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: idToken || '',
      client_id: process.env.LINE_CHANNEL_ID || '',
    }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`LINE verify failed: ${r.status} ${text}`);
  let data; try { data = JSON.parse(text); } catch { throw new Error(`LINE parse error: ${text}`); }
  if (!data?.sub) throw new Error('LINE user not found in id_token');
  return data.sub;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method Not Allowed' });

  try {
    const { idToken, event } = (await req.body) || (await req.json?.()) || req;
    if (!event || typeof event !== 'object') throw new Error('event payload required');

    const line_user_id = await getLineUserIdOrBypass(idToken);

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 文字列→null 変換（date/time/text で空文字が来ても安全）
    const payload = {
      line_user_id,
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
            ? event.sub_images.split(',').map(s=>s.trim()).filter(Boolean)
            : null),
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
      start_date: toNull(event.start_date),
      end_date: toNull(event.end_date),
      start_time: toNull(event.start_time),
      end_time: toNull(event.end_time),
    };

    const { data, error } = await supa.from('events').insert(payload).select('id').single();
    if (error) throw error;

    return res.status(200).json({ ok: true, event_id: data.id });
  } catch (e) {
    const msg = e?.message || e?.error?.message || JSON.stringify(e);
    return res.status(400).json({ ok: false, message: msg });
  }
}
