import { db, ensureSchema } from '../lib/db.js';

export default async function handler(req, res) {
  try {
    await ensureSchema();
    const sql = db();
    const moduleName = req.query.module || req.body?.module;
    if (!moduleName) return res.status(400).json({ error: 'Brak modułu.' });

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, module, title, detail, status, created_at, updated_at
        FROM module_items
        WHERE module = ${moduleName}
        ORDER BY created_at DESC
      `;
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (!b.title) return res.status(400).json({ error: 'Nazwa jest wymagana.' });
      const rows = await sql`
        INSERT INTO module_items (module, title, detail, status)
        VALUES (${moduleName}, ${b.title}, ${b.detail || ''}, ${b.status || ''})
        RETURNING *
      `;
      return res.status(201).json(rows[0]);
    }

    if (req.method === 'DELETE') {
      const id = Number(req.query.id);
      if (!id) return res.status(400).json({ error: 'Brak id.' });
      await sql`DELETE FROM module_items WHERE id = ${id} AND module = ${moduleName}`;
      return res.status(204).end();
    }

    res.setHeader('Allow', 'GET,POST,DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Błąd serwera' });
  }
}
