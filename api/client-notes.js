import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { apiRateLimit } from '../lib/rate-limit.js';

export default async function handler(req,res){
  try{
    if(!apiRateLimit(req,res)) return;
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    const sql=db();

    if(req.method==='GET'){
      const clientId=Number(req.query.client_id);
      if(!clientId)return res.status(400).json({error:'Brak client_id.'});
      const rows=await sql`
        SELECT id,client_id,note,author_id,author_name,created_at
        FROM client_notes
        WHERE client_id=${clientId}
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const clientId=Number(req.body?.client_id);
      const note=String(req.body?.note||'').trim();
      if(!clientId||!note)return res.status(400).json({error:'Wpisz treść uwagi.'});
      const exists=await sql`SELECT id FROM clients WHERE id=${clientId} LIMIT 1`;
      if(!exists[0])return res.status(404).json({error:'Nie znaleziono klienta.'});
      const rows=await sql`
        INSERT INTO client_notes(client_id,note,author_id,author_name)
        VALUES(${clientId},${note},${Number(user.id)},${user.full_name})
        RETURNING id,client_id,note,author_id,author_name,created_at
      `;
      return res.status(201).json(rows[0]);
    }

    if(req.method==='DELETE'){
      const id=Number(req.query.id);
      if(!id)return res.status(400).json({error:'Brak id uwagi.'});
      const rows=await sql`SELECT id,author_id FROM client_notes WHERE id=${id} LIMIT 1`;
      if(!rows[0])return res.status(404).json({error:'Nie znaleziono uwagi.'});
      if(user.role==='employee' && Number(rows[0].author_id)!==Number(user.id)){
        return res.status(403).json({error:'Możesz usuwać tylko własne uwagi.'});
      }
      await sql`DELETE FROM client_notes WHERE id=${id}`;
      return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
