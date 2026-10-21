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
    const userId=Number(user.id);

    if(req.method==='GET'){
      const rows=await sql`
        SELECT c.id,c.name,c.contact_name,c.first_name,c.last_name,c.client_status,c.entity_type,c.contact_email,
               f.created_at AS favorite_created_at
        FROM client_favorites f
        JOIN clients c ON c.id=f.client_id
        WHERE f.user_id=${userId}
        ORDER BY f.created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if(req.method==='POST'){
      const clientId=Number(req.body?.client_id);
      if(!clientId)return res.status(400).json({error:'Brak id klienta.'});
      const exists=(await sql`SELECT id FROM clients WHERE id=${clientId} LIMIT 1`)[0];
      if(!exists)return res.status(404).json({error:'Nie znaleziono klienta.'});
      await sql`
        INSERT INTO client_favorites(user_id,client_id)
        VALUES(${userId},${clientId})
        ON CONFLICT(user_id,client_id) DO NOTHING
      `;
      return res.status(200).json({ok:true});
    }

    if(req.method==='DELETE'){
      const clientId=Number(req.query.client_id);
      if(!clientId)return res.status(400).json({error:'Brak id klienta.'});
      await sql`DELETE FROM client_favorites WHERE user_id=${userId} AND client_id=${clientId}`;
      return res.status(204).end();
    }

    return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
