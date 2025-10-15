import { createClient } from '@supabase/supabase-js'; import 'dotenv/config';

const isDev = () => String(process.env.DEV_MODE||'').toLowerCase()==='true';
const devUid = (req) => (isDev() || (req.headers['x-dev-bypass']==='1'))
  ? (process.env.DEV_FIXED_LINE_USER||'dev-user') : null;

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({ok:false,message:'Method Not Allowed'});
  try{
    const lineUser = devUid(req);
    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    // 本番化する時は .eq('created_by', lineUser) を追加
    const { data, error } = await supa
      .from('events')
      .select('id,event_name,start_date,end_date,lead,created_by')
      .order('id',{ascending:false});
    if(error) throw error;
    res.status(200).json({ok:true, events:data});
  }catch(e){ res.status(400).json({ok:false,message:String(e)}); }
}
