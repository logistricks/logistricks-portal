-- ============================================================
-- 042_quotation_templates_v2.sql
-- Rich (HTML) quotation templates, Word import metadata, per-mode
-- templates, one default per client enforced by the database, and
-- richer stored quotations.
-- ============================================================

-- ── 1. quotation_templates: rich body + options ──────────────
ALTER TABLE public.quotation_templates
  ADD COLUMN IF NOT EXISTS format          TEXT  NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS body_html       TEXT,
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS applies_to_mode TEXT  NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS source_filename TEXT,
  ADD COLUMN IF NOT EXISTS options         JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.quotation_templates DROP CONSTRAINT IF EXISTS quotation_templates_format_check;
ALTER TABLE public.quotation_templates
  ADD CONSTRAINT quotation_templates_format_check CHECK (format IN ('text', 'html'));

ALTER TABLE public.quotation_templates DROP CONSTRAINT IF EXISTS quotation_templates_mode_check;
ALTER TABLE public.quotation_templates
  ADD CONSTRAINT quotation_templates_mode_check CHECK (applies_to_mode IN ('any', 'sea', 'air', 'land'));

COMMENT ON COLUMN public.quotation_templates.format IS
  'text = plain body (body column); html = rich body (body_html), with body kept as a plain-text fallback.';
COMMENT ON COLUMN public.quotation_templates.applies_to_mode IS
  'any | sea | air | land. The builder pre-selects the template matching the carrier quote mode, falling back to the default.';
COMMENT ON COLUMN public.quotation_templates.options IS
  'Rendering options: {charges_style: marked_up|detailed|total_only, show_unit_rates, accent_color, font_family, validity_days}.';

-- ── 2. Exactly one default per client ────────────────────────
-- Fix any existing duplicates first (keep the most recently updated), then enforce.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY client_code ORDER BY updated_at DESC, id DESC) AS rn
  FROM public.quotation_templates WHERE is_default
)
UPDATE public.quotation_templates t
   SET is_default = false
  FROM ranked r
 WHERE t.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS quotation_templates_one_default_idx
  ON public.quotation_templates (client_code)
  WHERE is_default;

-- ── 3. quotations: keep the rich output ──────────────────────
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS generated_html   TEXT,
  ADD COLUMN IF NOT EXISTS generated_format TEXT NOT NULL DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS quotation_number TEXT,
  ADD COLUMN IF NOT EXISTS valid_until      DATE,
  ADD COLUMN IF NOT EXISTS currency         TEXT;
