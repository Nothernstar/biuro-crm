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
    const requested=typeof req.query.owner==='string'?req.query.owner:'';
    const ownerFilter=user.role==='employee'?user.full_name:(requested&&requested!=='all'?requested:null);

    const totals=await sql`
      SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('Wygrany','Przegrany'))::int AS active,
        COUNT(*) FILTER (WHERE stage='Wygrany')::int AS won,
        COUNT(*) FILTER (WHERE stage='Przegrany')::int AS lost,
        COALESCE(SUM(mrr) FILTER (WHERE stage='Wygrany'),0)::float8 AS won_mrr,
        COALESCE(SUM(mrr) FILTER (WHERE stage NOT IN ('Wygrany','Przegrany')),0)::float8 AS pipeline_mrr,
        CASE WHEN COUNT(*)=0 THEN 0 ELSE ROUND((COUNT(*) FILTER (WHERE stage='Wygrany')::numeric/COUNT(*)::numeric)*100,1) END::float8 AS conversion
      FROM leads WHERE (${ownerFilter}::text IS NULL OR owner=${ownerFilter})`;

    const stages=await sql`SELECT stage,COUNT(*)::int AS count,COALESCE(SUM(mrr),0)::float8 AS mrr FROM leads WHERE (${ownerFilter}::text IS NULL OR owner=${ownerFilter}) GROUP BY stage ORDER BY MIN(created_at)`;
    const sources=await sql`SELECT source,COUNT(*)::int AS count,COALESCE(SUM(mrr),0)::float8 AS mrr,COUNT(*) FILTER (WHERE stage='Wygrany')::int AS won FROM leads WHERE (${ownerFilter}::text IS NULL OR owner=${ownerFilter}) GROUP BY source ORDER BY count DESC,source ASC`;
    const clientStatus=await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE client_status='active')::int AS active,
        COUNT(*) FILTER (WHERE client_status='suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE client_status='inactive')::int AS inactive,
        COUNT(*) FILTER (WHERE client_status='payment_hold')::int AS payment_hold,
        COUNT(*) FILTER (WHERE profile_complete=FALSE)::int AS incomplete
      FROM clients
    `;

    const clientFlow=await sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE)-interval '5 months',
          date_trunc('month', CURRENT_DATE),
          interval '1 month'
        ) AS month_start
      ),
      created AS (
        SELECT date_trunc('month',created_at) AS month_start,COUNT(*)::int AS count
        FROM clients
        WHERE created_at>=date_trunc('month',CURRENT_DATE)-interval '5 months'
        GROUP BY 1
      ),
      events AS (
        SELECT
          date_trunc('month',occurred_at) AS month_start,
          COUNT(*) FILTER (WHERE to_status='suspended')::int AS suspended,
          COUNT(*) FILTER (WHERE to_status='inactive')::int AS inactive,
          COUNT(*) FILTER (WHERE to_status='payment_hold')::int AS payment_hold,
          COUNT(*) FILTER (WHERE to_status='active' AND from_status IS NOT NULL AND from_status<>'active')::int AS reactivated
        FROM client_status_events
        WHERE occurred_at>=date_trunc('month',CURRENT_DATE)-interval '5 months'
        GROUP BY 1
      )
      SELECT
        to_char(m.month_start,'YYYY-MM') AS month,
        COALESCE(c.count,0)::int AS new_clients,
        COALESCE(e.suspended,0)::int AS suspended,
        COALESCE(e.inactive,0)::int AS inactive,
        COALESCE(e.payment_hold,0)::int AS payment_hold,
        COALESCE(e.reactivated,0)::int AS reactivated,
        (
          COALESCE(c.count,0)+COALESCE(e.reactivated,0)
          -COALESCE(e.suspended,0)-COALESCE(e.inactive,0)-COALESCE(e.payment_hold,0)
        )::int AS net
      FROM months m
      LEFT JOIN created c USING(month_start)
      LEFT JOIN events e USING(month_start)
      ORDER BY m.month_start
    `;

    const leadFlow=await sql`
      WITH months AS (
        SELECT generate_series(
          date_trunc('month', CURRENT_DATE)-interval '5 months',
          date_trunc('month', CURRENT_DATE),
          interval '1 month'
        ) AS month_start
      ),
      created AS (
        SELECT date_trunc('month',created_at) AS month_start,COUNT(*)::int AS count
        FROM leads
        WHERE created_at>=date_trunc('month',CURRENT_DATE)-interval '5 months'
          AND (${ownerFilter}::text IS NULL OR owner=${ownerFilter})
        GROUP BY 1
      ),
      closed AS (
        SELECT
          date_trunc('month',closed_at) AS month_start,
          COUNT(*) FILTER (WHERE lead_result='won')::int AS won,
          COUNT(*) FILTER (WHERE lead_result='rejected')::int AS rejected
        FROM leads
        WHERE closed_at>=date_trunc('month',CURRENT_DATE)-interval '5 months'
          AND (${ownerFilter}::text IS NULL OR owner=${ownerFilter})
        GROUP BY 1
      )
      SELECT
        to_char(m.month_start,'YYYY-MM') AS month,
        COALESCE(c.count,0)::int AS new_leads,
        COALESCE(x.won,0)::int AS won,
        COALESCE(x.rejected,0)::int AS rejected
      FROM months m
      LEFT JOIN created c USING(month_start)
      LEFT JOIN closed x USING(month_start)
      ORDER BY m.month_start
    `;

    const owners=user.role==='employee'
      ? [{owner:user.full_name,count:totals[0].total,won_mrr:totals[0].won_mrr}]
      : await sql`SELECT owner,COUNT(*)::int AS count,COALESCE(SUM(mrr) FILTER (WHERE stage='Wygrany'),0)::float8 AS won_mrr FROM leads GROUP BY owner ORDER BY owner`;

    return res.status(200).json({totals:totals[0],stages,sources,owners,client_status:clientStatus[0],client_flow:clientFlow,lead_flow:leadFlow});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||'Błąd serwera'})}
}
