import { createClient } from '@supabase/supabase-js'; import 'dotenv/config';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({ok:false,message:'Method Not Allowed'});
  try{
    const { application_id, status } = req.body || {};
    if(!application_id || !['pending','accepted','rejected'].includes(status))
      return res.status(400).json({ok:false,message:'invalid payload'});
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supa
      .from('event_applications')
      .update({ status })
      .eq('id', application_id);
    if(error) throw error;
    res.status(200).json({ok:true});
  }catch(e){ res.status(400).json({ok:false,message:String(e)}); }
}
