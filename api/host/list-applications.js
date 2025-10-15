import { createClient } from '@supabase/supabase-js'; import 'dotenv/config';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,message:'Method Not Allowed'});
  const eventId = Number(req.query?.event_id);
  if(!eventId) return res.status(400).json({ok:false,message:'event_id required'});
  try{
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supa
      .from('event_applications')
      .select('id,store_name,phone,email,memo,status,created_at')
      .eq('event_id', eventId)
      .order('id',{ascending:false});
    if(error) throw error;
    res.status(200).json({ok:true, applications:data});
  }catch(e){ res.status(400).json({ok:false,message:String(e)}); }
}
