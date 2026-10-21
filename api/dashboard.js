import { db, ensureSchema } from '../lib/db.js';
import { requireUser } from '../lib/auth.js';
import { apiRateLimit } from '../lib/rate-limit.js';

export default async function handler(req,res){
  try{
    if(!apiRateLimit(req,res)) return;
    await ensureSchema();
    const user=await requireUser(req,res);
    if(!user)return;
    if(req.method!=='GET') return res.status(405).json({error:'Method not allowed'});

    const sql=db();
    const ownOnly=user.role==='employee';

    const leadsQuery=ownOnly
      ? sql`SELECT id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,lead_quality,stage,followup::text AS followup,note,owner,lead_result,result_note,closed_at,created_at,updated_at FROM leads WHERE owner=${user.full_name} ORDER BY created_at DESC`
      : sql`SELECT id,company,contact,email,phone,source,mrr::float8 AS mrr,grade,lead_quality,stage,followup::text AS followup,note,owner,lead_result,result_note,closed_at,created_at,updated_at FROM leads ORDER BY created_at DESC`;

    const [leads,totalRows,history,favorites,reminders]=await Promise.all([
      leadsQuery,
      sql`SELECT COUNT(*)::int AS total FROM leads`,
      sql`SELECT id,module,title,detail,status,created_at,updated_at FROM module_items WHERE module='history' ORDER BY created_at DESC LIMIT 5`,
      sql`
        SELECT c.id,c.name,c.contact_name,c.contact_email,c.client_status,c.entity_type,f.created_at AS favorite_created_at
        FROM client_favorites f
        JOIN clients c ON c.id=f.client_id
        WHERE f.user_id=${Number(user.id)}
        ORDER BY f.created_at DESC
        LIMIT 8
      `,
      sql`SELECT id,module,title,detail,status,created_at,updated_at FROM module_items WHERE module='reminders' ORDER BY created_at DESC LIMIT 10`
    ]);

    return res.status(200).json({
      leads,
      totals:{total:totalRows[0]?.total||0},
      history,
      favorites,
      reminders
    });
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||'Błąd serwera'});
  }
}
