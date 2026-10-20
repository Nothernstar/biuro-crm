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
    const sql=db();
    const ownOnly=user.role==='employee';

    if(req.method==='GET'){
      const from=String(req.query.from||'');
      const to=String(req.query.to||'');
      const rows=ownOnly
        ? await sql`
          SELECT m.id,m.title,m.meeting_date::text AS meeting_date,m.start_time::text AS start_time,
                 m.client_id,m.lead_id,m.note,m.owner_id,m.owner_name,m.created_at,m.updated_at,
                 c.name AS client_name,l.company AS lead_name
          FROM meetings m
          LEFT JOIN clients c ON c.id=m.client_id
          LEFT JOIN leads l ON l.id=m.lead_id
          WHERE m.owner_id=${Number(user.id)}
            AND (${from}='' OR m.meeting_date>=${from}::date)
            AND (${to}='' OR m.meeting_date<=${to}::date)
          ORDER BY m.meeting_date,m.start_time`
        : await sql`
          SELECT m.id,m.title,m.meeting_date::text AS meeting_date,m.start_time::text AS start_time,
                 m.client_id,m.lead_id,m.note,m.owner_id,m.owner_name,m.created_at,m.updated_at,
                 c.name AS client_name,l.company AS lead_name
          FROM meetings m
          LEFT JOIN clients c ON c.id=m.client_id
          LEFT JOIN leads l ON l.id=m.lead_id
          WHERE (${from}='' OR m.meeting_date>=${from}::date)
            AND (${to}='' OR m.meeting_date<=${to}::date)
          ORDER BY m.meeting_date,m.start_time`;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const b=req.body||{};
      const title=String(b.title||'').trim();
      const date=String(b.meeting_date||'').trim();
      const time=String(b.start_time||'').trim();
      if(!title||!date||!time)return res.status(400).json({error:'Uzupełnij tytuł, datę i godzinę spotkania.'});
      const clientId=b.client_id?Number(b.client_id):null;
      const leadId=b.lead_id?Number(b.lead_id):null;
      const rows=await sql`
        INSERT INTO meetings(title,meeting_date,start_time,client_id,lead_id,note,owner_id,owner_name)
        VALUES(${title},${date}::date,${time}::time,${clientId},${leadId},${String(b.note||'').trim()},${Number(user.id)},${user.full_name})
        RETURNING id,title,meeting_date::text AS meeting_date,start_time::text AS start_time,client_id,lead_id,note,owner_id,owner_name,created_at,updated_at
      `;
      await addHistory(sql,{title:'Dodano spotkanie',detail:title+' • '+date+' '+time,actor:user.full_name,status:'meeting_created'});
      return res.status(201).json(rows[0]);
    }

    if(req.method==='DELETE'){
      const id=Number(req.query.id);
      if(!id)return res.status(400).json({error:'Brak id spotkania.'});
      const current=(await sql`SELECT id,owner_id,title,meeting_date::text AS meeting_date,start_time::text AS start_time FROM meetings WHERE id=${id} LIMIT 1`)[0];
      if(!current)return res.status(404).json({error:'Nie znaleziono spotkania.'});
      if(ownOnly&&Number(current.owner_id)!==Number(user.id))return res.status(403).json({error:'Brak dostępu do tego spotkania.'});
      await sql`DELETE FROM meetings WHERE id=${id}`;
      await addHistory(sql,{title:'Usunięto spotkanie',detail:current.title+' • '+current.meeting_date+' '+String(current.start_time||'').slice(0,5),actor:user.full_name,status:'meeting_deleted'});
      return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
