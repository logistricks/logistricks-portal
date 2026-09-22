-- ──────────────────────────────────────────────────────────────────────────────
-- 029  Approval Cycles
--
-- Adds the tables and columns needed for Phase 8 sequential approval chains.
-- Run AFTER migration 022 (notifications) and 003 (freight_requests).
-- ──────────────────────────────────────────────────────────────────────────────

-- approval_cycles: named, ordered cycle definitions per client
CREATE TABLE IF NOT EXISTS public.approval_cycles (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code citext  NOT NULL REFERENCES public.clients(client_code) ON UPDATE CASCADE,
  name        TEXT    NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approval_cycles_client_idx ON public.approval_cycles (client_code);

-- Ensure at most one default cycle per client
CREATE UNIQUE INDEX IF NOT EXISTS approval_cycles_default_idx
  ON public.approval_cycles (client_code)
  WHERE is_default = TRUE;

-- approval_cycle_steps: ordered steps within a cycle template
CREATE TABLE IF NOT EXISTS public.approval_cycle_steps (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id          UUID    NOT NULL REFERENCES public.approval_cycles(id) ON DELETE CASCADE,
  sort_order        INT     NOT NULL,
  assigned_to       TEXT    NOT NULL,   -- portal_users.username
  can_edit_template BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit_cc       BOOLEAN NOT NULL DEFAULT FALSE,
  required          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, sort_order)
);

-- approval_requests: one row per step per freight request (sequential chain)
-- The base table was created in Phase 0; add the new columns here.
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS sort_order        INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS can_edit_template BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_edit_cc       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cycle_id          UUID    REFERENCES public.approval_cycles(id),
  ADD COLUMN IF NOT EXISTS step_status       TEXT    NOT NULL DEFAULT 'waiting'
    CHECK (step_status IN ('waiting','active','approved','rejected','skipped'));

-- Replace the old status CHECK (was pending/approved/rejected) with a broader one
-- Use DROP/ADD to replace the constraint; IF EXISTS guard keeps it idempotent-ish
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_status_check;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_status_check
    CHECK (status IN ('pending','approved','rejected','skipped'));

-- Index for fast "which freight request is this step for" lookups
CREATE INDEX IF NOT EXISTS approval_requests_request_id_idx
  ON public.approval_requests (request_id, sort_order);
CREATE INDEX IF NOT EXISTS approval_requests_assignee_idx
  ON public.approval_requests (assigned_to, step_status)
  WHERE step_status = 'active';

-- approval_drafts: per-step email edits recorded in order
CREATE TABLE IF NOT EXISTS public.approval_drafts (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id   UUID    NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  edited_by     TEXT    NOT NULL,
  email_subject TEXT,
  email_body    TEXT,
  email_cc      TEXT[],
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS approval_drafts_approval_idx
  ON public.approval_drafts (approval_id, created_at DESC);

-- approval_enabled flag on clients (enables the Approval Cycles feature)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS approval_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS default_cycle_id     UUID    REFERENCES public.approval_cycles(id);
