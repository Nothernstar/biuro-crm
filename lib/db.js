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
      CREATE TABLE IF NOT EXISTS app_users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `;
    await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`
      CREATE TABLE IF NOT EXISTS app_users (
        id BIGSERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('admin','manager','employee')),
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_login_at TIMESTAMPTZ
      )
    `;
    await sql`ALTER TABLE app_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE`;
    await sql`
      CREATE TABLE IF NOT EXISTS clients (
        id BIGSERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_name TEXT,
        first_name TEXT,
        last_name TEXT,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('jdg','company','foundation')),
        nip TEXT NOT NULL,
        pesel TEXT,
        krs TEXT,
        regon TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
    await sql`ALTER TABLE clients ALTER COLUMN contact_name DROP NOT NULL`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS regon TEXT`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_nip ON clients(nip)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active)`;
  })();
  return schemaPromise;
}
