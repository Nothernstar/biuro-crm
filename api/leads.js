import { db, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const sql = db();

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, company, contact, email, phone, source,
               mrr::float8 AS mrr, grade, stage,
               followup::text AS followup, note, owner,
               created_at, updated_at
        FROM leads
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.company || !b.contact) return res.status(400).json({ error: 'Firma i osoba kontaktowa są wymagane.' });
      const rows = await sql`
        INSERT INTO leads (company, contact, email, phone, source, mrr, grade, stage, followup, note, owner)
        VALUES (
          ${b.company}, ${b.contact}, ${b.email || ''}, ${b.phone || ''},
          ${b.source || 'Inne'}, ${Number(b.mrr) || 0}, ${b.grade || 'B'},
          ${b.stage || 'Nowy lead'}, ${b.followup || null}, ${b.note || ''},
          ${b.owner || 'Nieprzypisany'}
        )
        RETURNING id, company, contact, email, phone, source,
                  mrr::float8 AS mrr, grade, stage,
                  followup::text AS followup, note, owner,
                  created_at, updated_at
      `;
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'PATCH') {
      const b = req.body || {};
      if (!b.id) return res.status(400).json({ error: 'Brak id.' });
      const rows = await sql`
        UPDATE leads
        SET company = COALESCE(${b.company ?? null}, company),
            contact = COALESCE(${b.contact ?? null}, contact),
            email = COALESCE(${b.email ?? null}, email),
            phone = COALESCE(${b.phone ?? null}, phone),
            source = COALESCE(${b.source ?? null}, source),
            mrr = COALESCE(${b.mrr !== undefined ? Number(b.mrr) : null}, mrr),
            grade = COALESCE(${b.grade ?? null}, grade),
            stage = COALESCE(${b.stage ?? null}, stage),
            followup = CASE WHEN ${b.followup === ''} THEN NULL ELSE COALESCE(${b.followup ?? null}::date, followup) END,
            note = COALESCE(${b.note ?? null}, note),
            owner = COALESCE(${b.owner ?? null}, owner),
            updated_at = NOW()
        WHERE id = ${Number(b.id)}
        RETURNING id, company, contact, email, phone, source,
                  mrr::float8 AS mrr, grade, stage,
                  followup::text AS followup, note, owner,
                  created_at, updated_at
      `;
      if (!rows[0]) return res.status(404).json({ error: 'Nie znaleziono leada.' });
      return res.status(200).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'Brak id.' });
      await sql`DELETE FROM leads WHERE id = ${id}`;
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET,POST,PATCH,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Błąd serwera' });
  }
}
