-- ============================================================
-- 078_security_hardening.sql   (DRAFT: review before running)
-- 1. auth_attempts: failed-login counter used for lockout.
-- 2. Remove anonymous read access to portal_users (it holds password hashes).
-- Safe to run more than once.
-- ============================================================

create table if not exists auth_attempts (
  id bigserial primary key,
  key text not null,
  at timestamptz not null default now()
);
create index if not exists auth_attempts_key_at_idx on auth_attempts (key, at desc);
alter table auth_attempts enable row level security;   -- no policies: only the service role can use it

-- The portal reads portal_users with the service-role key only. The public anon key must not be able to read it.
drop policy if exists "login_lookup" on portal_users;
revoke all on portal_users from anon;

-- NOT done here on purpose (needs a decision, n8n may rely on it): the anon "anon_lookup" read policies on
-- client_receiver_emails and client_whatsapp_numbers, and the anon grant on the view active_client_by_email.
--   drop policy if exists "anon_lookup" on client_receiver_emails;
--   drop policy if exists "anon_lookup" on client_whatsapp_numbers;
--   revoke select on active_client_by_email from anon;
