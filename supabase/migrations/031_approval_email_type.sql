-- ──────────────────────────────────────────────────────────────────────────────
-- 031  Approval email type + To-address tracking
--
-- Adds:
--   • approval_drafts.email_to  TEXT  — recipient address(es) for the email
--   • approval_requests.email_type TEXT — 'carrier' | 'reply' (what kind of
--     email this approval chain is for)
--
-- Also extends freight_requests status to include the four new approved states.
-- ──────────────────────────────────────────────────────────────────────────────

-- 1. Track who the email is addressed to (stored with the initial draft)
ALTER TABLE public.approval_drafts
  ADD COLUMN IF NOT EXISTS email_to TEXT;

-- 2. Track the approval type on every step row
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS email_type TEXT
    CHECK (email_type IN ('carrier', 'reply'));

-- 3. Extend freight_requests status check to allow the four new values
--    (drop + recreate the check constraint if one exists)
ALTER TABLE public.freight_requests
  DROP CONSTRAINT IF EXISTS freight_requests_status_check;

ALTER TABLE public.freight_requests
  ADD CONSTRAINT freight_requests_status_check
    CHECK (status IN (
      'Pending',
      'Waiting for Approval',
      'Rejected',
      'Approved - Carrier, Pending Send',
      'Approved - Carrier, Sent',
      'Approved - Reply, Pending Send',
      'Approved - Reply, Sent',
      'Sent to Carrier',
      'Quoted',
      'Closed'
    ));
