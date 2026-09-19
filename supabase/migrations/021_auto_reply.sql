-- Phase 5: Auto-Reply for Missing Items
-- Add is_reply_template flag to templates table (only one active per client)
ALTER TABLE public.templates
  ADD COLUMN IF NOT EXISTS is_reply_template BOOLEAN NOT NULL DEFAULT FALSE;

-- Add auto-reply settings to clients table
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS auto_reply_delay_min INT NOT NULL DEFAULT 0;

-- Constraint: delay between 0 and 60 minutes
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_auto_reply_delay_range,
  ADD CONSTRAINT clients_auto_reply_delay_range CHECK (auto_reply_delay_min >= 0 AND auto_reply_delay_min <= 60);

-- Index for fast reply template lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_templates_reply_template
  ON public.templates (client_code)
  WHERE is_reply_template = TRUE;
