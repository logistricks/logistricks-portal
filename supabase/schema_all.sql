-- ============================================================
-- 001_clients.sql
-- Master client registry — run this first, everything else
-- depends on the client_code FK.
-- ============================================================

CREATE TABLE IF NOT EXISTS clients (
  client_code   VARCHAR(15)  PRIMARY KEY,
  company_name  VARCHAR(100) NOT NULL,
  trading_name  VARCHAR(100),
  industry      VARCHAR(50),
  contact_name  VARCHAR(100),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(30),
  country       VARCHAR(50),
  standard_package BOOLEAN NOT NULL DEFAULT true,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- RLS enabled here; policy added in 002_profiles.sql after
-- get_my_client_code() is defined.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- ── Seed ──────────────────────────────────────────────────
INSERT INTO clients (client_code, company_name, contact_name, contact_email, country, notes)
VALUES (
  'DEMO',
  'Logistricks Demo',
  'Abdulaziz',
  'abd.khayyat@gmail.com',
  'Jordan',
  'Internal demo / test client — all sandbox data lives here'
)
ON CONFLICT (client_code) DO NOTHING;
-- ============================================================
-- 002_profiles.sql
-- Extends auth.users — links every Supabase user to a client.
-- Run AFTER 001_clients.sql.
-- ============================================================

-- Role enum
CREATE TYPE user_role AS ENUM ('admin', 'operator', 'viewer');

CREATE TABLE IF NOT EXISTS profiles (
  id           UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_code  VARCHAR(15)  NOT NULL REFERENCES clients(client_code),
  full_name    VARCHAR(100),
  role         user_role    NOT NULL DEFAULT 'operator',
  avatar_url   TEXT,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── Helper used by all RLS policies ─────────────────────────
-- SECURITY DEFINER so it can read profiles even under RLS.
CREATE OR REPLACE FUNCTION get_my_client_code()
RETURNS VARCHAR(15)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT client_code FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Convenience: is the current user an admin for their client?
CREATE OR REPLACE FUNCTION i_am_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ── Auto-create profile on sign-up ──────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, client_code, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'client_code', 'DEMO'),
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(
      (NEW.raw_user_meta_data->>'role')::user_role,
      'operator'
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── RLS: clients (needs get_my_client_code, defined above) ───
CREATE POLICY "clients_select_own"
  ON clients FOR SELECT
  USING (client_code = get_my_client_code());

-- ── RLS: profiles ────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_same_client"
  ON profiles FOR SELECT
  USING (client_code = get_my_client_code());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── Seed: link Abdulaziz to DEMO ────────────────────────────
-- Run separately after this script:
--   SELECT id FROM auth.users WHERE email = 'abd.khayyat@gmail.com';
-- Then:
-- INSERT INTO profiles (id, client_code, full_name, role)
-- VALUES ('<YOUR_UUID>', 'DEMO', 'Abdulaziz', 'admin')
-- ON CONFLICT (id) DO UPDATE
--   SET client_code = 'DEMO', full_name = 'Abdulaziz', role = 'admin';
-- ============================================================
-- 003_data_tables.sql
-- carriers, message_templates, freight_requests, outreach_log
-- Run AFTER 002_profiles.sql.
-- ============================================================

-- ── Enums ───────────────────────────────────────────────────
CREATE TYPE template_type   AS ENUM ('Email', 'WhatsApp');
CREATE TYPE request_source  AS ENUM ('Email', 'WhatsApp', 'Phone', 'Web');
CREATE TYPE request_urgency AS ENUM ('High', 'Medium', 'Low');
CREATE TYPE request_status  AS ENUM ('New', 'In Review', 'Quoted', 'Won', 'Lost', 'Archived');
CREATE TYPE outreach_method AS ENUM ('Email', 'WhatsApp');

-- ────────────────────────────────────────────────────────────
-- CARRIERS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carriers (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  VARCHAR(15)  NOT NULL REFERENCES clients(client_code),
  name         VARCHAR(100) NOT NULL,
  contact_name VARCHAR(100),
  email        VARCHAR(255),
  whatsapp     VARCHAR(30),
  country      VARCHAR(50),
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TRIGGER carriers_updated_at
  BEFORE UPDATE ON carriers
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

ALTER TABLE carriers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carriers_client_isolation" ON carriers
  USING (client_code = get_my_client_code())
  WITH CHECK (client_code = get_my_client_code());

-- ── Seed carriers (DEMO) ────────────────────────────────────
INSERT INTO carriers (client_code, name, contact_name, email, whatsapp, country) VALUES
  ('DEMO', 'Orient Shipping',     'Mohammed Al-Rashid', 'mohammed@orientshipping.ae', '+971501234567', 'UAE'),
  ('DEMO', 'Gulf Freight Lines',  'Fatima Hassan',      'fatima@gulffreight.com',     '+97150987654',  'UAE'),
  ('DEMO', 'Meridian Logistics',  'Ahmed Khalil',       'ahmed@meridianlog.com',      '+966512345678', 'KSA'),
  ('DEMO', 'Atlas Cargo',         'Sara Al-Mansouri',   'sara@atlascargo.net',        '+97145678901',  'UAE'),
  ('DEMO', 'Pacific Freight Co.', 'John Chen',          'john.chen@pacificfreight.hk','+85291234567',  'Hong Kong'),
  ('DEMO', 'Apex Global Cargo',   'Priya Nair',         'priya@apexglobal.in',        '+919876543210', 'India')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- MESSAGE TEMPLATES
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_templates (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  VARCHAR(15)   NOT NULL REFERENCES clients(client_code),
  name         VARCHAR(100)  NOT NULL,
  type         template_type NOT NULL,
  subject      VARCHAR(255),           -- Email only
  body         TEXT          NOT NULL,
  is_default   BOOLEAN       NOT NULL DEFAULT false,
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TRIGGER message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "templates_client_isolation" ON message_templates
  USING (client_code = get_my_client_code())
  WITH CHECK (client_code = get_my_client_code());

-- ── Seed templates (DEMO) ───────────────────────────────────
INSERT INTO message_templates (client_code, name, type, subject, body, is_default) VALUES
(
  'DEMO',
  'RFQ — Standard',
  'Email',
  'Rate Request: {{origin_city}} → {{destination_city}} | {{cargo_type}}',
  E'Dear {{contact_name}},\n\nWe have a freight request and would appreciate your best rates for the following shipment:\n\n• Origin: {{origin_city}}, {{origin_country}}\n• Destination: {{destination_city}}, {{destination_country}}\n• Cargo: {{cargo_type}}\n• Equipment: {{equipment}}\n• Weight: {{weight}}\n• Incoterm: {{incoterm}}\n• Mode: {{mode}}\n\nKindly provide your rates at your earliest convenience.\n\nBest regards,\nLogistricks Team',
  true
),
(
  'DEMO',
  'RFQ — Urgent',
  'Email',
  'URGENT Rate Request: {{origin_city}} → {{destination_city}}',
  E'Dear {{contact_name}},\n\n⚡ URGENT REQUEST — Please respond ASAP.\n\nWe require immediate rates for:\n\n• Route: {{origin_city}} → {{destination_city}}\n• Cargo: {{cargo_type}} | {{equipment}}\n• Weight: {{weight}}\n• Urgency: {{urgency}}\n\nPlease reply within 2 hours if possible.\n\nThank you,\nLogistricks Team',
  false
),
(
  'DEMO',
  'WhatsApp RFQ',
  'WhatsApp',
  NULL,
  E'Hi {{contact_name}} 👋\n\nQuick rate request from Logistricks:\n📦 {{cargo_type}} | {{equipment}}\n🛫 {{origin_city}} → {{destination_city}}\n⚖️ {{weight}} | {{mode}}\n📋 Incoterm: {{incoterm}}\n\nCan you share your best rate? 🙏',
  true
),
(
  'DEMO',
  'WhatsApp Follow-up',
  'WhatsApp',
  NULL,
  E'Hi {{contact_name}}, following up on our freight inquiry for {{origin_city}} → {{destination_city}}. Do you have rates available? Thanks!',
  false
)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- FREIGHT REQUESTS
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS freight_requests (
  id                    UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code           VARCHAR(15)      NOT NULL REFERENCES clients(client_code),

  -- Sender
  sender_name           VARCHAR(100),
  sender_email          VARCHAR(255),
  sender_phone          VARCHAR(30),
  source                request_source   NOT NULL DEFAULT 'Email',
  received_at           TIMESTAMPTZ      NOT NULL DEFAULT now(),
  raw_message           TEXT,

  -- Parsed shipment fields
  origin_city           VARCHAR(100),
  origin_country        VARCHAR(50),
  destination_city      VARCHAR(100),
  destination_country   VARCHAR(50),
  cargo_type            VARCHAR(100),
  equipment             VARCHAR(100),
  weight                VARCHAR(50),
  quantity              VARCHAR(50),
  dimensions            VARCHAR(100),
  incoterm              VARCHAR(20),
  bl_type               VARCHAR(50),
  preferred_carrier     VARCHAR(100),

  -- AI scoring
  urgency               request_urgency  NOT NULL DEFAULT 'Medium',
  confidence            SMALLINT         NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  modes                 TEXT[]           NOT NULL DEFAULT '{}',

  -- Status
  status                request_status   NOT NULL DEFAULT 'New',
  is_done               BOOLEAN          NOT NULL DEFAULT false,

  -- Flexible JSONB fields
  special_requirements  JSONB            NOT NULL DEFAULT '[]',
  availability_questions JSONB           NOT NULL DEFAULT '[]',
  history               JSONB            NOT NULL DEFAULT '[]',

  created_at            TIMESTAMPTZ      NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ      NOT NULL DEFAULT now()
);

CREATE TRIGGER freight_requests_updated_at
  BEFORE UPDATE ON freight_requests
  FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

CREATE INDEX IF NOT EXISTS freight_requests_client_code_idx ON freight_requests(client_code);
CREATE INDEX IF NOT EXISTS freight_requests_status_idx ON freight_requests(status);
CREATE INDEX IF NOT EXISTS freight_requests_received_at_idx ON freight_requests(received_at DESC);

ALTER TABLE freight_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests_client_isolation" ON freight_requests
  USING (client_code = get_my_client_code())
  WITH CHECK (client_code = get_my_client_code());

-- ── Seed 5 mock requests (DEMO) ─────────────────────────────
INSERT INTO freight_requests (
  client_code, sender_name, sender_email, sender_phone,
  source, received_at, raw_message,
  origin_city, origin_country, destination_city, destination_country,
  cargo_type, equipment, weight, quantity, incoterm, bl_type,
  urgency, confidence, modes, status,
  special_requirements, availability_questions,
  history
) VALUES
(
  'DEMO', 'Ahmed Al-Farsi', 'ahmed.farsi@tradeco.ae', '+971501234567',
  'Email', now() - interval '2 hours',
  'Hi, we need a rate for 2x20ft dry containers from Dubai to Rotterdam. Cargo is industrial machinery, approx 18 tons each. Incoterm CIF. Please advise soonest.',
  'Dubai', 'UAE', 'Rotterdam', 'Netherlands',
  'Industrial Machinery', '2x20ft DC', '36 MT', '2 units', 'CIF', 'OBL',
  'High', 92, ARRAY['Ocean'], 'New',
  '["Temperature controlled storage during port wait", "Insurance certificate required"]',
  '["Do you have availability for first week of next month?", "Can you handle customs clearance at Rotterdam?"]',
  '[{"label":"Received","done":true,"time":"2 hours ago"},{"label":"Parsing","done":true,"time":"2 hours ago"},{"label":"RFQ Sent","done":false,"time":"—"},{"label":"Rate Received","done":false,"time":"—"}]'
),
(
  'DEMO', 'Sarah Mitchell', 'sarah.m@globalimports.co.uk', '+447891234567',
  'WhatsApp', now() - interval '4 hours',
  'Hello, can you help with air freight from Shanghai to London? 500kg electronics, urgent shipment needed within 3 days.',
  'Shanghai', 'China', 'London', 'UK',
  'Electronics', 'Air Cargo', '500 KG', '12 cartons', 'DAP', '—',
  'High', 85, ARRAY['Air'], 'In Review',
  '["Lithium battery declaration required", "Fragile handling"]',
  '["What is the earliest departure you can arrange?"]',
  '[{"label":"Received","done":true,"time":"4 hours ago"},{"label":"Parsing","done":true,"time":"4 hours ago"},{"label":"RFQ Sent","done":true,"time":"3 hours ago"},{"label":"Rate Received","done":false,"time":"—"}]'
),
(
  'DEMO', 'Mohammed Al-Qassim', 'mq@logisticsme.com', '+966512345678',
  'Email', now() - interval '1 day',
  'Greetings, we require FCL ocean freight from Jeddah to Singapore. 1x40ft HC with perishable goods (frozen seafood). Need reefer container with temperature -18°C.',
  'Jeddah', 'Saudi Arabia', 'Singapore', 'Singapore',
  'Frozen Seafood', '1x40ft HC Reefer', '24 MT', '1 unit', 'FOB', 'OBL',
  'Medium', 78, ARRAY['Ocean'], 'New',
  '["Reefer monitoring throughout transit", "Health certificate required", "Port health inspection at destination"]',
  '["What is your transit time Jeddah to Singapore?", "Can you arrange reefer monitoring alerts?"]',
  '[{"label":"Received","done":true,"time":"1 day ago"},{"label":"Parsing","done":true,"time":"1 day ago"},{"label":"RFQ Sent","done":false,"time":"—"},{"label":"Rate Received","done":false,"time":"—"}]'
),
(
  'DEMO', 'Lisa Chen', 'lchen@sourcingco.hk', '+85298765432',
  'Phone', now() - interval '3 hours',
  'Need LCL consolidation from Guangzhou to Dubai. Mixed goods, about 5 CBM, not hazardous. EXW terms.',
  'Guangzhou', 'China', 'Dubai', 'UAE',
  'General Merchandise', 'LCL', '1.2 MT', '5 CBM', 'EXW', 'HBL',
  'Low', 71, ARRAY['Ocean'], 'New',
  '[]',
  '["What is the cut-off date for next consolidation?"]',
  '[{"label":"Received","done":true,"time":"3 hours ago"},{"label":"Parsing","done":true,"time":"3 hours ago"},{"label":"RFQ Sent","done":false,"time":"—"},{"label":"Rate Received","done":false,"time":"—"}]'
),
(
  'DEMO', 'Ravi Patel', 'ravi.p@indiaexports.in', '+919876543210',
  'Email', now() - interval '30 minutes',
  'Urgent inquiry for multimodal shipment from Mumbai to Paris. 15 MT automotive parts. Ocean + road, DDP basis.',
  'Mumbai', 'India', 'Paris', 'France',
  'Automotive Parts', '1x20ft DC', '15 MT', '1 unit', 'DDP', 'OBL',
  'High', 88, ARRAY['Ocean', 'Road'], 'New',
  '["MSDS documents available", "Customs bond required in France"]',
  '["Can you handle last-mile delivery within Paris?", "Do you have experience with automotive parts customs?"]',
  '[{"label":"Received","done":true,"time":"30 min ago"},{"label":"Parsing","done":true,"time":"30 min ago"},{"label":"RFQ Sent","done":false,"time":"—"},{"label":"Rate Received","done":false,"time":"—"}]'
)
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- OUTREACH LOG (tracks every Email/WhatsApp send)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outreach_log (
  id            UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code   VARCHAR(15)     NOT NULL REFERENCES clients(client_code),
  request_id    UUID            REFERENCES freight_requests(id) ON DELETE SET NULL,
  carrier_id    UUID            REFERENCES carriers(id) ON DELETE SET NULL,
  template_id   UUID            REFERENCES message_templates(id) ON DELETE SET NULL,
  sent_by       UUID            REFERENCES auth.users(id),
  sent_at       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  method        outreach_method NOT NULL,
  send_to       VARCHAR(255)    NOT NULL,
  subject       VARCHAR(255),
  message_body  TEXT
);

ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outreach_log_client_isolation" ON outreach_log
  USING (client_code = get_my_client_code())
  WITH CHECK (client_code = get_my_client_code());
-- ============================================================
-- 004_login_log.sql
-- Every sign-in attempt, success or failure.
-- Run AFTER 002_profiles.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS login_log (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  client_code    VARCHAR(15)  REFERENCES clients(client_code),
  logged_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ip_address     INET,
  user_agent     TEXT,
  device_type    VARCHAR(20),            -- 'desktop' | 'mobile' | 'tablet'
  country_code   CHAR(2),
  success        BOOLEAN      NOT NULL DEFAULT true,
  failure_reason VARCHAR(100)            -- populated on failed attempts
);

CREATE INDEX IF NOT EXISTS login_log_user_idx        ON login_log(user_id);
CREATE INDEX IF NOT EXISTS login_log_client_code_idx ON login_log(client_code);
CREATE INDEX IF NOT EXISTS login_log_logged_at_idx   ON login_log(logged_at DESC);

ALTER TABLE login_log ENABLE ROW LEVEL SECURITY;

-- Admins see all logins for their client; operators see only their own
CREATE POLICY "login_log_admin_select"
  ON login_log FOR SELECT
  USING (
    client_code = get_my_client_code()
    AND (
      i_am_admin()
      OR user_id = auth.uid()
    )
  );

-- Inserts happen via service_role (n8n / Edge Function) only
-- No INSERT policy for authenticated users (they can't self-insert)

-- ── How to populate this table ──────────────────────────────
-- Option A (recommended): Supabase Auth Hook
--   In Supabase Dashboard → Authentication → Hooks
--   Set "Sign In" hook to call an Edge Function that inserts here.
--
-- Option B: n8n webhook
--   Call supabase.auth.onAuthStateChange in the Next.js client,
--   then POST to n8n when event === 'SIGNED_IN'.
--   n8n inserts into login_log using the service_role key.
--
-- Option C: Next.js server action (simplest to start)
--   After successful signInWithPassword(), call a server action
--   that inserts a row using the admin client (service_role).
--
-- Example server action call:
--   await supabaseAdmin.from('login_log').insert({
--     user_id: session.user.id,
--     client_code: profile.client_code,
--     ip_address: req.headers['x-forwarded-for'],
--     user_agent: req.headers['user-agent'],
--     success: true
--   })
-- ============================================================
-- 005_user_action_log.sql
-- Full audit trail: CREATE, UPDATE, DELETE (triggers),
-- VIEW and SEND (app-level calls).
-- Run AFTER 003_data_tables.sql.
-- ============================================================

CREATE TYPE action_type AS ENUM (
  'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'SEND'
);

CREATE TABLE IF NOT EXISTS user_action_log (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  client_code  VARCHAR(15)  REFERENCES clients(client_code),
  action       action_type  NOT NULL,
  table_name   VARCHAR(50)  NOT NULL,
  record_id    TEXT,                    -- usually a UUID cast to text
  old_values   JSONB,                   -- NULL on CREATE
  new_values   JSONB,                   -- NULL on DELETE
  description  TEXT,                    -- human-readable summary
  acted_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ual_user_idx        ON user_action_log(user_id);
CREATE INDEX IF NOT EXISTS ual_client_code_idx ON user_action_log(client_code);
CREATE INDEX IF NOT EXISTS ual_acted_at_idx    ON user_action_log(acted_at DESC);
CREATE INDEX IF NOT EXISTS ual_table_name_idx  ON user_action_log(table_name);

ALTER TABLE user_action_log ENABLE ROW LEVEL SECURITY;

-- Admins see all; operators see only their own
CREATE POLICY "ual_admin_select"
  ON user_action_log FOR SELECT
  USING (
    client_code = get_my_client_code()
    AND (i_am_admin() OR user_id = auth.uid())
  );

-- ── Generic trigger function for automatic DB logging ────────
CREATE OR REPLACE FUNCTION _log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action     action_type;
  v_record_id  TEXT;
  v_old        JSONB := NULL;
  v_new        JSONB := NULL;
  v_client     VARCHAR(15);
BEGIN
  IF    TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new    := to_jsonb(NEW);
    v_record_id := NEW.id::TEXT;
    v_client    := NEW.client_code;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_record_id := NEW.id::TEXT;
    v_client    := NEW.client_code;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old    := to_jsonb(OLD);
    v_record_id := OLD.id::TEXT;
    v_client    := OLD.client_code;
  END IF;

  INSERT INTO user_action_log
    (user_id, client_code, action, table_name, record_id, old_values, new_values)
  VALUES
    (auth.uid(), v_client, v_action, TG_TABLE_NAME, v_record_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Attach trigger to each audited table ────────────────────
CREATE TRIGGER audit_freight_requests
  AFTER INSERT OR UPDATE OR DELETE ON freight_requests
  FOR EACH ROW EXECUTE FUNCTION _log_table_change();

CREATE TRIGGER audit_carriers
  AFTER INSERT OR UPDATE OR DELETE ON carriers
  FOR EACH ROW EXECUTE FUNCTION _log_table_change();

CREATE TRIGGER audit_message_templates
  AFTER INSERT OR UPDATE OR DELETE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION _log_table_change();

-- ── App-level helper (call from Next.js server action) ───────
-- For VIEW and SEND events that triggers cannot capture:
--
--   await supabaseAdmin.from('user_action_log').insert({
--     user_id:     session.user.id,
--     client_code: profile.client_code,
--     action:      'VIEW',              -- or 'SEND'
--     table_name:  'freight_requests',
--     record_id:   requestId,
--     description: 'Opened request from Ahmed Al-Farsi'
--   })
-- ============================================================
-- 006_n8n_prep.sql
-- webhook_log table + notes on n8n credentials.
-- Run AFTER 003_data_tables.sql.
-- ============================================================

CREATE TYPE webhook_status AS ENUM (
  'received', 'processing', 'processed', 'error'
);

-- Logs every inbound webhook call from n8n
CREATE TABLE IF NOT EXISTS webhook_log (
  id                   BIGSERIAL       PRIMARY KEY,
  client_code          VARCHAR(15)     REFERENCES clients(client_code),
  source               VARCHAR(50)     NOT NULL,   -- e.g. 'n8n-email-parser', 'n8n-whatsapp'
  payload              JSONB           NOT NULL DEFAULT '{}',
  status               webhook_status  NOT NULL DEFAULT 'received',
  error_details        TEXT,
  processed_request_id UUID            REFERENCES freight_requests(id) ON DELETE SET NULL,
  received_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
  processed_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS whl_client_idx     ON webhook_log(client_code);
CREATE INDEX IF NOT EXISTS whl_received_idx   ON webhook_log(received_at DESC);
CREATE INDEX IF NOT EXISTS whl_status_idx     ON webhook_log(status);

-- Only service_role can write to webhook_log (n8n uses service_role key)
-- Authenticated users can read (admins for their client)
ALTER TABLE webhook_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook_log_admin_select"
  ON webhook_log FOR SELECT
  USING (client_code = get_my_client_code() AND i_am_admin());

-- ============================================================
-- n8n SETUP CHECKLIST (non-SQL steps — follow in n8n UI)
-- ============================================================
--
-- 1. CREDENTIALS TO CREATE IN N8N
-- ────────────────────────────────
-- a) "Supabase (Service Role)" — HTTP Header Auth credential
--    Header Name:   apikey
--    Header Value:  <your service_role key>
--    Also set:      Authorization: Bearer <service_role key>
--    Base URL hint: https://<project-ref>.supabase.co/rest/v1/
--
-- b) "Supabase Postgres" — Postgres credential
--    Host:     db.<project-ref>.supabase.co
--    Port:     5432
--    Database: postgres
--    User:     postgres
--    Password: <your db password>
--    SSL:      require
--
-- c) "Gmail" or "IMAP" — for email trigger workflow
-- d) Optional: "OpenAI" or "Anthropic" — for AI parsing node
--
-- 2. ENVIRONMENT VARIABLES (add to .env.local)
-- ─────────────────────────────────────────────
-- N8N_WEBHOOK_URL=https://n8n.yourdomain.com/webhook/<id>
-- SUPABASE_SERVICE_ROLE_KEY=<your service_role key>   # server-side only, never expose
--
-- 3. N8N WORKFLOW: EMAIL → FREIGHT REQUEST
-- ─────────────────────────────────────────
-- [Gmail Trigger] → [AI Parse Node] → [Code Node: map fields] →
-- [Supabase: INSERT webhook_log] →
-- [Supabase: INSERT freight_requests] →
-- [Supabase: UPDATE webhook_log SET status=processed]
--
-- 4. N8N WORKFLOW: WHATSAPP → FREIGHT REQUEST
-- ─────────────────────────────────────────────
-- [Webhook Trigger] → [AI Parse Node] → [Code Node: map fields] →
-- [Supabase: INSERT freight_requests with source='WhatsApp']
--
-- 5. SECURING N8N WEBHOOKS
-- ─────────────────────────
-- Add a secret header to n8n webhook trigger:
--   X-Webhook-Secret: <random string>
-- Verify in the workflow's first node before processing.
--
-- ============================================================

-- Verify setup by checking tables exist:
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'clients', 'profiles', 'carriers',
    'message_templates', 'freight_requests',
    'outreach_log', 'login_log',
    'user_action_log', 'webhook_log'
  )
ORDER BY table_name;
