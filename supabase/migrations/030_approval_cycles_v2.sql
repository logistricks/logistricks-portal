-- ──────────────────────────────────────────────────────────────────────────────
-- 030  Approval Cycles v2 — Committee-based redesign
--
-- Replaces the single-approver-per-step model with:
--   • Committee steps (multiple users; first to approve advances the chain)
--   • notify_only steps (no approval gate, just sends notifications)
--   • Initiator mapping (which users trigger which cycle)
--   • Automated email triggers (carrier email / reply email)
--   • Per-response tracking (approval_step_responses)
--
-- Run AFTER migration 029.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. New columns on approval_cycles
ALTER TABLE public.approval_cycles
  ADD COLUMN IF NOT EXISTS applies_to_automated_emails BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS automated_trigger TEXT
    CHECK (automated_trigger IN ('carrier_email', 'reply_email', 'both'));

-- 2. New column on approval_cycle_steps
-- committee_mode:
--   'any_approves'  — first committee member to approve advances the chain
--   'notify_only'   — no approval gate; step auto-completes after notifying members
ALTER TABLE public.approval_cycle_steps
  ADD COLUMN IF NOT EXISTS committee_mode TEXT NOT NULL DEFAULT 'any_approves'
    CHECK (committee_mode IN ('any_approves', 'notify_only'));

-- 3. Step members — one row per user per template step
CREATE TABLE IF NOT EXISTS public.approval_cycle_step_members (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id    UUID    NOT NULL REFERENCES public.approval_cycle_steps(id) ON DELETE CASCADE,
  username   TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (step_id, username)
);
CREATE INDEX IF NOT EXISTS acsmembers_step_idx
  ON public.approval_cycle_step_members (step_id);

-- 4. Initiators — which users are linked to which cycle
-- Each user can be an initiator of at most ONE cycle per client.
CREATE TABLE IF NOT EXISTS public.approval_cycle_initiators (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id    UUID    NOT NULL REFERENCES public.approval_cycles(id) ON DELETE CASCADE,
  client_code citext  NOT NULL REFERENCES public.clients(client_code) ON UPDATE CASCADE,
  username    TEXT    NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_code, username)
);
CREATE INDEX IF NOT EXISTS aci_cycle_idx
  ON public.approval_cycle_initiators (cycle_id);

-- 5. Per-step committee responses
CREATE TABLE IF NOT EXISTS public.approval_step_responses (
  id                  UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_request_id UUID    NOT NULL REFERENCES public.approval_requests(id) ON DELETE CASCADE,
  username            TEXT    NOT NULL,
  response            TEXT    NOT NULL CHECK (response IN ('approved', 'rejected')),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (approval_request_id, username)
);
CREATE INDEX IF NOT EXISTS asr_request_idx
  ON public.approval_step_responses (approval_request_id);

-- 6. New column on approval_requests — array of assigned usernames
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS assigned_usernames TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS ar_assigned_usernames_idx
  ON public.approval_requests USING GIN (assigned_usernames);
