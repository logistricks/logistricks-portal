-- ============================================================
-- 011_client_receiver_emails.sql
-- Replaces the single receiver_email column (010) with a proper
-- one-to-many table. Each client can have multiple receiver
-- addresses; n8n checks r_mail + active flag.
-- Run in Supabase SQL Editor.
-- ============================================================

-- 1. Clean up what 010 created
DROP VIEW IF EXISTS active_client_by_email;
ALTER TABLE clients DROP COLUMN IF EXISTS receiver_email;
-- keep license_active + license_expires on clients — still useful

-- 2. Create the table
CREATE TABLE IF NOT EXISTS client_receiver_emails (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  VARCHAR(15) NOT NULL REFERENCES clients(client_code) ON DELETE CASCADE,
  r_mail       TEXT        NOT NULL,
  active       BOOLEAN     NOT NULL DEFAULT true,
  label        TEXT,                     -- optional: "imports", "exports", etc.
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_receiver_emails_r_mail_key UNIQUE (r_mail)
);

-- 3. RLS
ALTER TABLE client_receiver_emails ENABLE ROW LEVEL SECURITY;

-- n8n anon key can look up by r_mail
CREATE POLICY "anon_lookup"
  ON client_receiver_emails FOR SELECT
  TO anon
  USING (true);

-- Authenticated users can manage their own client's emails
CREATE POLICY "own_client_select"
  ON client_receiver_emails FOR SELECT
  TO authenticated
  USING (client_code = get_my_client_code());

CREATE POLICY "own_client_insert"
  ON client_receiver_emails FOR INSERT
  TO authenticated
  WITH CHECK (client_code = get_my_client_code());

CREATE POLICY "own_client_update"
  ON client_receiver_emails FOR UPDATE
  TO authenticated
  USING (client_code = get_my_client_code());

CREATE POLICY "own_client_delete"
  ON client_receiver_emails FOR DELETE
  TO authenticated
  USING (client_code = get_my_client_code());

-- 4. Seed
INSERT INTO client_receiver_emails (client_code, r_mail, active, label)
VALUES
  ('DEMOX', 'demox@intake.logistricks.com', true, 'Main'),
  ('DEMO',  'demo@intake.logistricks.com',  true, 'Main')
ON CONFLICT (r_mail) DO NOTHING;

-- 5. Verify
SELECT client_code, r_mail, active, label FROM client_receiver_emails ORDER BY client_code;
