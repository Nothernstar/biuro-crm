import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { apiRateLimit } from '../lib/rate-limit.js';
import { addHistory } from '../lib/history.js';

export default async function handler(req,res){
  try{
    if(!apiRateLimit(req,res)) return;
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db(),moduleName=req.query.module||req.body?.module;
    if(!moduleName)return res.status(400).json({error:'Brak modułu.'});
    const settingsManagerKeys=new Set(['crm_dictionaries','onboarding','reminders','templates_defaults']);
    if(moduleName==='settings' && user.role==='employee'){
      return res.status(403).json({error:'Ustawienia systemu są dostępne tylko dla administratora i managera.'});
    }

    if(req.method==='GET'){
      const rows=await sql`SELECT id,module,title,detail,status,created_at,updated_at FROM module_items WHERE module=${moduleName} ORDER BY created_at DESC`;
      return res.status(200).json(rows);
    }
    if(req.method==='POST'){
      const b=req.body||{};if(!b.title)return res.status(400).json({error:'Nazwa jest wymagana.'});
      if(moduleName==='settings'){
        if(user.role!=='admin' && !settingsManagerKeys.has(String(b.title))) return res.status(403).json({error:'To ustawienie może zmienić tylko administrator.'});
        const rows=await sql`
          INSERT INTO module_items(module,title,detail,status)
          VALUES('settings',${String(b.title)},${b.detail||''},${b.status||''})
          RETURNING *
        `;
        await addHistory(sql,{title:'Zmieniono ustawienia systemu',detail:String(b.status||b.title),actor:user.full_name,status:'settings_updated'});
        return res.status(201).json(rows[0]);
      }
      const rows=await sql`INSERT INTO module_items(module,title,detail,status) VALUES(${moduleName},${b.title},${b.detail||''},${b.status||''}) RETURNING *`;
      return res.status(201).json(rows[0]);
    }

    if(req.method==='PATCH'){
      const b=req.body||{};
      if(moduleName!=='settings')return res.status(405).json({error:'Method not allowed'});
      const key=String(b.title||'').trim();
      if(!key)return res.status(400).json({error:'Brak klucza ustawienia.'});
      if(user.role!=='admin' && !settingsManagerKeys.has(key)) return res.status(403).json({error:'To ustawienie może zmienić tylko administrator.'});
      const existing=(await sql`SELECT id FROM module_items WHERE module='settings' AND title=${key} ORDER BY updated_at DESC LIMIT 1`)[0];
      let rows;
      if(existing){
        rows=await sql`
          UPDATE module_items
          SET detail=${b.detail||''},status=${b.status||''},updated_at=NOW()
          WHERE id=${existing.id}
          RETURNING *
        `;
      }else{
        rows=await sql`
          INSERT INTO module_items(module,title,detail,status)
          VALUES('settings',${key},${b.detail||''},${b.status||''})
          RETURNING *
        `;
      }
      await addHistory(sql,{title:'Zmieniono ustawienia systemu',detail:String(b.status||key),actor:user.full_name,status:'settings_updated'});
      return res.status(200).json(rows[0]);
    }
    if(req.method==='DELETE'){
      if(user.role==='employee')return res.status(403).json({error:'Brak uprawnień do usuwania.'});
      const id=Number(req.query.id);if(!id)return res.status(400).json({error:'Brak id.'});
      await sql`DELETE FROM module_items WHERE id=${id} AND module=${moduleName}`;return res.status(204).end();
    }
    return res.status(405).json({error:'Method not allowed'});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||'Błąd serwera'})}
}
