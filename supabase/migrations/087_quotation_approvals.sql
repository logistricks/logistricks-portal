-- 087: approval of a generated quotation before it goes to the requester.
-- Optional per approval cycle: Settings → Approval Workflow → quotation_approval (off | always | warnings = only when the AI review found something)
-- and quotation_after_approval (manual = the person sends it | auto = the portal sends it right after the last approval).
ALTER TABLE public.approval_cycles
  ADD COLUMN IF NOT EXISTS quotation_approval text NOT NULL DEFAULT 'off' CHECK (quotation_approval IN ('off', 'always', 'warnings')),
  ADD COLUMN IF NOT EXISTS quotation_after_approval text NOT NULL DEFAULT 'manual' CHECK (quotation_after_approval IN ('manual', 'auto'));

-- One row per step of one submission (batch). Same shape as the request approval steps, kept apart so the two never mix.
CREATE TABLE IF NOT EXISTS public.quotation_approvals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code        citext NOT NULL REFERENCES public.clients(client_code) ON DELETE CASCADE ON UPDATE CASCADE,
  quotation_id       bigint NOT NULL,
  freight_request_id uuid   NOT NULL,
  cycle_id           uuid,
  batch_id           uuid   NOT NULL,                          -- one submission = one batch of steps
  sort_order         int    NOT NULL DEFAULT 1,
  assigned_usernames text[] NOT NULL DEFAULT '{}',
  committee_mode     text   NOT NULL DEFAULT 'any_approves',
  step_status        text   NOT NULL DEFAULT 'waiting' CHECK (step_status IN ('waiting', 'active', 'approved', 'rejected', 'skipped')),
  submitted_by       text   NOT NULL,
  decided_by         text,
  notes              text,
  decided_at         timestamptz,
  content_hash       text   NOT NULL,                          -- the exact quotation text that was submitted
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quotation_approvals_q_idx ON public.quotation_approvals (quotation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotation_approvals_active_idx ON public.quotation_approvals (client_code, step_status) WHERE step_status = 'active';
ALTER TABLE public.quotation_approvals ENABLE ROW LEVEL SECURITY;   -- read/written only through the portal API (service role)

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS approval_status text CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approval_hash   text,                -- hash of the text that was approved: an edit afterwards makes the approval void
  ADD COLUMN IF NOT EXISTS approved_by     text,
  ADD COLUMN IF NOT EXISTS approved_at     timestamptz;
