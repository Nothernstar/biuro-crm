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
        lead_quality TEXT DEFAULT 'Dobry',
        lead_result TEXT NOT NULL DEFAULT 'in_progress' CHECK (lead_result IN ('in_progress','won','rejected')),
        result_note TEXT DEFAULT '',
        closed_at TIMESTAMPTZ,
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
        entity_type TEXT CHECK (entity_type IN ('jdg','company','foundation')),
        nip TEXT,
        pesel TEXT,
        krs TEXT,
        regon TEXT,
        residence_address TEXT DEFAULT '',
        business_address TEXT DEFAULT '',
        correspondence_address TEXT DEFAULT '',
        taxation_form TEXT DEFAULT '',
        vat_status TEXT DEFAULT '',
        zus_form TEXT DEFAULT '',
        business_start_date DATE,
        cooperation_start_date DATE,
        father_name TEXT DEFAULT '',
        mother_name TEXT DEFAULT '',
        tax_office TEXT DEFAULT '',
        contact_email TEXT DEFAULT '',
        service_language TEXT DEFAULT 'Polski',
        settlement_frequency TEXT DEFAULT 'miesięcznie',
        client_status TEXT NOT NULL DEFAULT 'active' CHECK (client_status IN ('active','suspended','inactive','payment_hold')),
        source_lead_id BIGINT UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
        profile_complete BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS client_status_events (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        from_status TEXT,
        to_status TEXT NOT NULL CHECK (to_status IN ('active','suspended','inactive','payment_hold')),
        actor_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
        actor_name TEXT DEFAULT '',
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS client_notes (
        id BIGSERIAL PRIMARY KEY,
        client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        author_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
        author_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS lead_onboarding_items (
        id BIGSERIAL PRIMARY KEY,
        lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        assignee_user_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
        assignee_name TEXT DEFAULT '',
        is_done BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        phase TEXT NOT NULL DEFAULT 'onboarding' CHECK (phase IN ('acquisition','onboarding')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS lead_events (
        id BIGSERIAL PRIMARY KEY,
        lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL DEFAULT 'note',
        title TEXT NOT NULL,
        detail TEXT DEFAULT '',
        actor_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
        actor_name TEXT DEFAULT '',
        occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS meetings (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        meeting_date DATE NOT NULL,
        start_time TIME NOT NULL,
        client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
        lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL,
        note TEXT DEFAULT '',
        owner_id BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
        owner_name TEXT NOT NULL DEFAULT '',
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
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_quality TEXT DEFAULT 'Dobry'`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_result TEXT NOT NULL DEFAULT 'in_progress'`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS result_note TEXT DEFAULT ''`;
    await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(stage)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_leads_owner ON leads(owner)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_module_items_module ON module_items(module)`;
    await sql`ALTER TABLE clients ALTER COLUMN contact_name DROP NOT NULL`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS first_name TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_name TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS regon TEXT`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS residence_address TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_address TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS correspondence_address TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS taxation_form TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS vat_status TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS zus_form TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_start_date DATE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS cooperation_start_date DATE`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS father_name TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS mother_name TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS tax_office TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT ''`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS service_language TEXT DEFAULT 'Polski'`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS settlement_frequency TEXT DEFAULT 'miesięcznie'`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status TEXT NOT NULL DEFAULT 'active'`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS source_lead_id BIGINT REFERENCES leads(id) ON DELETE SET NULL`;
    await sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN NOT NULL DEFAULT TRUE`;
    await sql`ALTER TABLE clients ALTER COLUMN entity_type DROP NOT NULL`;
    await sql`ALTER TABLE clients ALTER COLUMN nip DROP NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_nip ON clients(nip)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(client_status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_notes_client ON client_notes(client_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_client_status_events_client ON client_status_events(client_id,occurred_at)`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_source_lead ON clients(source_lead_id) WHERE source_lead_id IS NOT NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(meeting_date)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_meetings_owner ON meetings(owner_id)`;
    await sql`ALTER TABLE lead_onboarding_items ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'onboarding'`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lead_onboarding_lead ON lead_onboarding_items(lead_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lead_onboarding_phase ON lead_onboarding_items(lead_id,phase)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_lead_events_lead ON lead_events(lead_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_role ON app_users(role)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_app_users_active ON app_users(is_active)`;
  })();
  return schemaPromise;
}
