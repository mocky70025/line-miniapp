import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
  try {
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .from('events')
      .select('id,event_name,lead,start_date,end_date,main_image,label,apply_start,apply_end')
      .order('start_date', { ascending: true });
    if (error) throw error;
    return res.status(200).json({ ok: true, events: data });
  } catch (e) {
    return res.status(400).json({ ok: false, message: e?.message || String(e) });
  }
}
