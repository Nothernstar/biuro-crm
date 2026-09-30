import { db, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const sql = db();
    const owner = typeof req.query.owner === 'string' ? req.query.owner : '';
    const ownerFilter = owner && owner !== 'all' ? owner : null;

    const totals = await sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE stage NOT IN ('Wygrany','Przegrany'))::int AS active,
        COUNT(*) FILTER (WHERE stage = 'Wygrany')::int AS won,
        COUNT(*) FILTER (WHERE stage = 'Przegrany')::int AS lost,
        COALESCE(SUM(mrr) FILTER (WHERE stage = 'Wygrany'),0)::float8 AS won_mrr,
        COALESCE(SUM(mrr) FILTER (WHERE stage NOT IN ('Wygrany','Przegrany')),0)::float8 AS pipeline_mrr,
        CASE WHEN COUNT(*) = 0 THEN 0
             ELSE ROUND((COUNT(*) FILTER (WHERE stage='Wygrany')::numeric / COUNT(*)::numeric) * 100, 1)
        END::float8 AS conversion
      FROM leads
      WHERE (${ownerFilter}::text IS NULL OR owner = ${ownerFilter})
    `;

    const stages = await sql`
      SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(mrr),0)::float8 AS mrr
      FROM leads
      WHERE (${ownerFilter}::text IS NULL OR owner = ${ownerFilter})
      GROUP BY stage
      ORDER BY MIN(created_at)
    `;

    const sources = await sql`
      SELECT source, COUNT(*)::int AS count,
             COALESCE(SUM(mrr),0)::float8 AS mrr,
             COUNT(*) FILTER (WHERE stage='Wygrany')::int AS won
      FROM leads
      WHERE (${ownerFilter}::text IS NULL OR owner = ${ownerFilter})
      GROUP BY source
      ORDER BY count DESC, source ASC
    `;

    const owners = await sql`
      SELECT owner, COUNT(*)::int AS count,
             COALESCE(SUM(mrr) FILTER (WHERE stage='Wygrany'),0)::float8 AS won_mrr
      FROM leads
      GROUP BY owner
      ORDER BY owner
    `;

    return res.status(200).json({ totals: totals[0], stages, sources, owners });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Błąd serwera' });
  }
}
