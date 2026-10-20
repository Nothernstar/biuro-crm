import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';

export default async function handler(req,res){
  try{
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    const sql=db();
    const rows=await sql`
      SELECT id,full_name,role
      FROM app_users
      WHERE is_active=TRUE
      ORDER BY full_name
    `;
    return res.status(200).json(rows);
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}