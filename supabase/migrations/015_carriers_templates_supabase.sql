-- ============================================================
-- Migration 015: Carriers & Templates tables (Supabase-backed)
-- ============================================================

-- Drop old cc_emails column added in 014 (if it exists)
ALTER TABLE IF EXISTS public.clients DROP COLUMN IF EXISTS cc_emails;

-- ──────────────────────────────────────────────
-- CARRIERS
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carriers (
  id            BIGSERIAL    PRIMARY KEY,
  client_code   TEXT         NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE,
  carrier_id    INTEGER      NOT NULL,          -- logical serial per client_code
  carrier_name  TEXT         NOT NULL DEFAULT '',
  person_name   TEXT         NOT NULL DEFAULT '',
  role          TEXT         NOT NULL DEFAULT '',
  email         TEXT         NOT NULL DEFAULT '',
  number        TEXT         NOT NULL DEFAULT '',
  is_sea        BOOLEAN      NOT NULL DEFAULT false,
  is_air        BOOLEAN      NOT NULL DEFAULT false,
  is_land       BOOLEAN      NOT NULL DEFAULT false,
  lang          SMALLINT     NOT NULL DEFAULT -1, -- 1=Arabic 2=English -1=Both
  routes        TEXT         NOT NULL DEFAULT '',
  is_cc         BOOLEAN      NOT NULL DEFAULT false,
  active        BOOLEAN      NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS carriers_client_code_idx  ON public.carriers (client_code);
CREATE INDEX IF NOT EXISTS carriers_carrier_id_idx   ON public.carriers (client_code, carrier_id);

ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carriers_select" ON public.carriers FOR SELECT
  USING (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

CREATE POLICY "carriers_insert" ON public.carriers FOR INSERT
  WITH CHECK (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

CREATE POLICY "carriers_update" ON public.carriers FOR UPDATE
  USING (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

CREATE POLICY "carriers_delete" ON public.carriers FOR DELETE
  USING (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

-- ──────────────────────────────────────────────
-- TEMPLATES
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.templates (
  id                  BIGSERIAL    PRIMARY KEY,
  client_code         TEXT         NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE,
  template_id         INTEGER      NOT NULL,     -- logical serial per client_code
  template_name       TEXT         NOT NULL DEFAULT '',
  type                TEXT         NOT NULL DEFAULT 'Email' CHECK (type IN ('Email', 'WhatsApp')),
  subject             TEXT,
  body                TEXT         NOT NULL DEFAULT '',
  linked_carrier_ids  INTEGER[]    NOT NULL DEFAULT '{}',
  is_default          BOOLEAN      NOT NULL DEFAULT false,
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (client_code, template_id)
);

CREATE INDEX IF NOT EXISTS templates_client_code_idx ON public.templates (client_code);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select" ON public.templates FOR SELECT
  USING (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

CREATE POLICY "templates_insert" ON public.templates FOR INSERT
  WITH CHECK (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

CREATE POLICY "templates_update" ON public.templates FOR UPDATE
  USING (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));

CREATE POLICY "templates_delete" ON public.templates FOR DELETE
  USING (client_code = (
    SELECT client_code FROM public.portal_users WHERE id = auth.uid() LIMIT 1
  ));
