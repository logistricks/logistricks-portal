-- Add active flag to templates (matches carriers table pattern)
ALTER TABLE public.templates ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
