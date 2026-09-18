-- ============================================================
-- 007_schema_align.sql
-- Align freight_requests schema with n8n output + portal UI
-- Run in Supabase SQL Editor AFTER all prior migrations.
-- ============================================================

-- ── 1. urgency: ENUM request_urgency → VARCHAR(20) ──────────
-- Portal + n8n use 'Urgent' / 'Standard' (not High/Medium/Low)
ALTER TABLE freight_requests ALTER COLUMN urgency DROP DEFAULT;
ALTER TABLE freight_requests
  ALTER COLUMN urgency TYPE VARCHAR(20) USING urgency::text;
UPDATE freight_requests
  SET urgency = CASE
    WHEN LOWER(urgency) IN ('high', 'urgent')           THEN 'Urgent'
    WHEN LOWER(urgency) IN ('medium', 'low', 'standard') THEN 'Standard'
    ELSE 'Standard'
  END;
ALTER TABLE freight_requests ALTER COLUMN urgency SET DEFAULT 'Standard';
ALTER TABLE freight_requests ALTER COLUMN urgency SET NOT NULL;

-- ── 2. confidence: SMALLINT → VARCHAR(10) ───────────────────
-- n8n sends 'High'/'Medium'/'Low'; seeded rows had numeric 0-100
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'freight_requests'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%confidence%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE freight_requests DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE freight_requests ALTER COLUMN confidence DROP DEFAULT;
ALTER TABLE freight_requests
  ALTER COLUMN confidence TYPE VARCHAR(10)
  USING CASE
    WHEN confidence::smallint >= 80 THEN 'High'
    WHEN confidence::smallint >= 60 THEN 'Medium'
    ELSE 'Low'
  END;
ALTER TABLE freight_requests ALTER COLUMN confidence SET DEFAULT 'Medium';
ALTER TABLE freight_requests ALTER COLUMN confidence SET NOT NULL;

-- ── 3. status: ENUM request_status → VARCHAR(20) ────────────
-- Portal uses: 'Pending', 'Sent to Carrier', 'Quoted', 'Closed'
ALTER TABLE freight_requests ALTER COLUMN status DROP DEFAULT;
ALTER TABLE freight_requests
  ALTER COLUMN status TYPE VARCHAR(20) USING status::text;
UPDATE freight_requests
  SET status = CASE
    WHEN status IN ('New', 'In Review')          THEN 'Pending'
    WHEN status = 'Quoted'                        THEN 'Quoted'
    WHEN status IN ('Won', 'Lost', 'Archived')   THEN 'Closed'
    ELSE status  -- already portal-style value
  END;
ALTER TABLE freight_requests ALTER COLUMN status SET DEFAULT 'Pending';
ALTER TABLE freight_requests ALTER COLUMN status SET NOT NULL;

-- ── 4. Add missing_fields + suggested_reply ──────────────────
ALTER TABLE freight_requests
  ADD COLUMN IF NOT EXISTS missing_fields  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS suggested_reply TEXT;

-- ── 5. Normalise existing modes data ─────────────────────────
-- Seeded rows had 'Ocean', 'Road' — standardise to 'Sea', 'Land'
UPDATE freight_requests
  SET modes = ARRAY(
    SELECT CASE
      WHEN LOWER(m) IN ('ocean', 'sea') THEN 'Sea'
      WHEN LOWER(m) = 'air'             THEN 'Air'
      WHEN LOWER(m) IN ('road', 'land') THEN 'Land'
      ELSE initcap(m)
    END
    FROM unnest(modes) AS m
  );

-- ── 6. Enable Realtime on freight_requests ───────────────────
-- (safe to run even if already enabled via dashboard)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'freight_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE freight_requests;
  END IF;
END $$;
