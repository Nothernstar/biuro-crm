import { neon } from '@neondatabase/serverless';

let sqlClient;
let schemaPromise;

export function db() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured');
  }
  if (!sqlClient) sqlClient = neon(process.env.DATABASE_URL);
  return sqlClient;
}

export async function ensureSchema() {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const sql = db();
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id BIGSERIAL PRIMARY KEY,
        company TEXT NOT NULL,
        contact TEXT NOT NULL,
        email TEXT DEFAULT '',
        phone TEXT DEFAULT '',
        source TEXT DEFAULT 'Inne',
        mrr NUMERIC(12,2) DEFAULT 0,
        grade TEXT DEFAULT 'B',
        stage TEXT DEFAULT 'Nowy lead',
        followup DATE,
        note TEXT DEFAULT '',
        owner TEXT DEFAULT 'Nieprzypisany',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS module_items (
        id BIGSERIAL PRIMARY KEY,
        module TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT DEFAULT '',
        status TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_module_items_module ON module_items(module)`;
  })();
  return schemaPromise;
}
