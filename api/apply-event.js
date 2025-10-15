import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// DEVバイパス（curlですでに使った方法）
function devLineUser(req){
  const dev = String(process.env.DEV_MODE||'').toLowerCase()==='true';
  const hdr = (req.headers?.['x-dev-bypass']||'').toString()==='1';
  if(dev || hdr) return process.env.DEV_FIXED_LINE_USER || 'dev-user';
  return null;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,message:'Method Not Allowed'});
  try{
    const body = req.body && typeof req.body==='object' ? req.body
               : JSON.parse((await new Response(req).text?.()) ?? '{}'); // Vercel保険
    const { event_id, store_name, phone, email, memo, idToken } = body || {};
    if(!event_id) return res.status(400).json({ok:false,message:'event_id required'});

    // いまは DEV なので idToken 検証は省略。必要になったら create-event と同じ関数を流用。
    const line_user_id = devLineUser(req) || null;

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .from('event_applications')
      .insert({
        event_id,
        line_user_id,
        store_name: store_name ?? null,
        phone: phone ?? null,
        email: email ?? null,
        memo: memo ?? null
      })
      .select('id')
      .single();
    if(error) throw error;

    return res.status(200).json({ ok:true, application_id: data.id });
  }catch(e){
    return res.status(400).json({ ok:false, message:String(e) });
  }
}
