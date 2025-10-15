import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  try {
    const body = await req.json?.() || req.body || {};
    const filename = body.filename || 'upload.bin';
    const prefix = body.prefix || 'events';
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const path = `${prefix}/${stamp}-${Math.random().toString(36).slice(2,6)}-${filename}`;

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa.storage
      .from('images')
      .createSignedUploadUrl(path);
    if (error) throw error;

    const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/images/${path}`;
    return res.status(200).json({ ok: true, uploadUrl: data.signedUrl, path, publicUrl });
  } catch (e) {
    return res.status(400).json({ ok: false, message: e?.message || String(e) });
  }
}
