import { db, ensureSchema } from '../lib/db.js';
import { hashPassword, requireUser } from '../lib/auth.js';

export default async function handler(req,res){
  try{
    await ensureSchema();
    const admin=await requireUser(req,res,['admin']);
    if(!admin) return;
    const sql=db();

    if(req.method==='GET'){
      const rows=await sql`
        SELECT id,email,full_name,role,is_active,must_change_password,created_at,last_login_at
        FROM app_users ORDER BY created_at ASC
      `;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const b=req.body||{};
      const email=String(b.email||'').trim().toLowerCase();
      const fullName=String(b.full_name||'').trim();
      const role=['admin','manager','employee'].includes(b.role)?b.role:'employee';
      if(!email||!fullName) return res.status(400).json({error:'Imię i e-mail są wymagane.'});
      const passwordHash=hashPassword(String(b.password||''));
      const rows=await sql`
        INSERT INTO app_users(email,full_name,password_hash,role,is_active,must_change_password)
        VALUES(${email},${fullName},${passwordHash},${role},TRUE,TRUE)
        RETURNING id,email,full_name,role,is_active,must_change_password,created_at,last_login_at
      `;
      return res.status(201).json(rows[0]);
    }

    if(req.method==='PATCH'){
      const b=req.body||{};
      const id=Number(b.id);
      if(!id) return res.status(400).json({error:'Brak id.'});
      if(Number(admin.id)===id && b.is_active===false) return res.status(400).json({error:'Nie możesz dezaktywować własnego konta.'});
      const role=b.role===undefined?null:(['admin','manager','employee'].includes(b.role)?b.role:null);
      const email=b.email===undefined?null:String(b.email||'').trim().toLowerCase();
      if(email==='') return res.status(400).json({error:'E-mail nie może być pusty.'});
      if(email){
        const duplicate=await sql`SELECT id FROM app_users WHERE lower(email)=${email} AND id<>${id} LIMIT 1`;
        if(duplicate[0]) return res.status(409).json({error:'Konto z tym e-mailem już istnieje.'});
      }
      if(b.password){
        const passwordHash=hashPassword(String(b.password));
        await sql`UPDATE app_users SET password_hash=${passwordHash},must_change_password=${Number(admin.id)!==id},updated_at=NOW() WHERE id=${id}`;
      }
      const rows=await sql`
        UPDATE app_users
        SET full_name=COALESCE(${b.full_name??null},full_name),
            email=COALESCE(${email},email),
            role=COALESCE(${role},role),
            is_active=COALESCE(${b.is_active===undefined?null:Boolean(b.is_active)},is_active),
            updated_at=NOW()
        WHERE id=${id}
        RETURNING id,email,full_name,role,is_active,must_change_password,created_at,last_login_at
      `;
      if(!rows[0]) return res.status(404).json({error:'Nie znaleziono użytkownika.'});
      return res.status(200).json(rows[0]);
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    if(String(e.message||'').includes('duplicate key')) return res.status(409).json({error:'Konto z tym e-mailem już istnieje.'});
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
