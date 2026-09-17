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
