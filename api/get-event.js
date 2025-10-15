import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,message:'Method Not Allowed'});
  const id = Number(req.query?.id || req.query?.event_id);
  if(!id) return res.status(400).json({ok:false,message:'event id required'});
  try{
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .from('events')
      .select('id,event_name,lead,description,main_image,sub_images,start_date,end_date,apply_start,apply_end,venue_name,venue_address')
      .eq('id', id)
      .single();
    if(error) throw error;
    return res.status(200).json({ ok:true, event:data });
  }catch(e){
    return res.status(400).json({ ok:false, message:String(e) });
  }
}
