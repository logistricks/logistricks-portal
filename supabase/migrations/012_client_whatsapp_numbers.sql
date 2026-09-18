-- ============================================================
-- 012_client_whatsapp_numbers.sql
-- Per-client WhatsApp numbers for inbound receivables.
-- Same pattern as client_receiver_emails.
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS client_whatsapp_numbers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code  VARCHAR(15) NOT NULL REFERENCES clients(client_code) ON DELETE CASCADE,
  number       TEXT        NOT NULL,        -- E.164 format, e.g. +96612345678
  active       BOOLEAN     NOT NULL DEFAULT true,
  label        TEXT,                        -- e.g. "Main", "Imports line"
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT client_whatsapp_numbers_number_key UNIQUE (number)
);

ALTER TABLE client_whatsapp_numbers ENABLE ROW LEVEL SECURITY;

-- n8n anon key can look up by number
CREATE POLICY "anon_lookup"
  ON client_whatsapp_numbers FOR SELECT
  TO anon
  USING (true);

-- Authenticated users manage their own client's numbers
CREATE POLICY "own_client_select"
  ON client_whatsapp_numbers FOR SELECT
  TO authenticated
  USING (client_code = get_my_client_code());

CREATE POLICY "own_client_insert"
  ON client_whatsapp_numbers FOR INSERT
  TO authenticated
  WITH CHECK (client_code = get_my_client_code());

CREATE POLICY "own_client_update"
  ON client_whatsapp_numbers FOR UPDATE
  TO authenticated
  USING (client_code = get_my_client_code());

CREATE POLICY "own_client_delete"
  ON client_whatsapp_numbers FOR DELETE
  TO authenticated
  USING (client_code = get_my_client_code());

-- Seed
INSERT INTO client_whatsapp_numbers (client_code, number, active, label)
VALUES ('DEMOX', '+96600000000', true, 'Main')
ON CONFLICT (number) DO NOTHING;

-- Verify
SELECT client_code, number, active, label FROM client_whatsapp_numbers ORDER BY client_code;
