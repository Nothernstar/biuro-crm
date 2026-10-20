import { db, ensureSchema } from '../lib/db.js';
import { hashPassword, verifyPassword, setSession, clearSession, getCurrentUser } from '../lib/auth.js';

export default async function handler(req,res){
  try{
    await ensureSchema();
    const sql=db();

    if(req.method==='GET'){
      const countRows=await sql`SELECT COUNT(*)::int AS count FROM app_users`;
      const user=await getCurrentUser(req).catch(()=>null);
      return res.status(200).json({setup_required:countRows[0].count===0,user:user?{
        id:Number(user.id),email:user.email,full_name:user.full_name,role:user.role
      }:null});
    }

    if(req.method!=='POST') return res.status(405).json({error:'Method not allowed'});
    const b=req.body||{};

    if(b.action==='setup'){
      const countRows=await sql`SELECT COUNT(*)::int AS count FROM app_users`;
      if(countRows[0].count>0) return res.status(409).json({error:'Administrator został już utworzony.'});
      const email=String(b.email||'').trim().toLowerCase();
      const fullName=String(b.full_name||'').trim();
      if(!email||!fullName) return res.status(400).json({error:'Uzupełnij imię i e-mail.'});
      const passwordHash=hashPassword(String(b.password||''));
      const rows=await sql`
        INSERT INTO app_users(email,full_name,password_hash,role)
        VALUES(${email},${fullName},${passwordHash},'admin')
        RETURNING id,email,full_name,role
      `;
      setSession(res,rows[0]);
      return res.status(201).json({user:rows[0]});
    }

    if(b.action==='login'){
      const email=String(b.email||'').trim().toLowerCase();
      const rows=await sql`
        SELECT id,email,full_name,password_hash,role,is_active
        FROM app_users WHERE lower(email)=${email} LIMIT 1
      `;
      const user=rows[0];
      if(!user||!user.is_active||!verifyPassword(String(b.password||''),user.password_hash)){
        return res.status(401).json({error:'Nieprawidłowy e-mail lub hasło.'});
      }
      await sql`UPDATE app_users SET last_login_at=NOW(),updated_at=NOW() WHERE id=${user.id}`;
      setSession(res,user);
      return res.status(200).json({user:{id:Number(user.id),email:user.email,full_name:user.full_name,role:user.role}});
    }

    if(b.action==='logout'){
      clearSession(res);
      return res.status(204).end();
    }

    return res.status(400).json({error:'Nieznana akcja.'});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
