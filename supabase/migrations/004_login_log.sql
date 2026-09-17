-- ============================================================
-- 004_login_log.sql
-- Every sign-in attempt, success or failure.
-- Run AFTER 002_profiles.sql.
-- ============================================================

CREATE TABLE IF NOT EXISTS login_log (
  id             BIGSERIAL    PRIMARY KEY,
  user_id        UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  client_code    VARCHAR(15)  REFERENCES clients(client_code),
  logged_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ip_address     INET,
  user_agent     TEXT,
  device_type    VARCHAR(20),            -- 'desktop' | 'mobile' | 'tablet'
  country_code   CHAR(2),
  success        BOOLEAN      NOT NULL DEFAULT true,
  failure_reason VARCHAR(100)            -- populated on failed attempts
);

CREATE INDEX IF NOT EXISTS login_log_user_idx        ON login_log(user_id);
CREATE INDEX IF NOT EXISTS login_log_client_code_idx ON login_log(client_code);
CREATE INDEX IF NOT EXISTS login_log_logged_at_idx   ON login_log(logged_at DESC);

ALTER TABLE login_log ENABLE ROW LEVEL SECURITY;

-- Admins see all logins for their client; operators see only their own
CREATE POLICY "login_log_admin_select"
  ON login_log FOR SELECT
  USING (
    client_code = get_my_client_code()
    AND (
      i_am_admin()
      OR user_id = auth.uid()
    )
  );

-- Inserts happen via service_role (n8n / Edge Function) only
-- No INSERT policy for authenticated users (they can't self-insert)

-- ── How to populate this table ──────────────────────────────
-- Option A (recommended): Supabase Auth Hook
--   In Supabase Dashboard → Authentication → Hooks
--   Set "Sign In" hook to call an Edge Function that inserts here.
--
-- Option B: n8n webhook
--   Call supabase.auth.onAuthStateChange in the Next.js client,
--   then POST to n8n when event === 'SIGNED_IN'.
--   n8n inserts into login_log using the service_role key.
--
-- Option C: Next.js server action (simplest to start)
--   After successful signInWithPassword(), call a server action
--   that inserts a row using the admin client (service_role).
--
-- Example server action call:
--   await supabaseAdmin.from('login_log').insert({
--     user_id: session.user.id,
--     client_code: profile.client_code,
--     ip_address: req.headers['x-forwarded-for'],
--     user_agent: req.headers['user-agent'],
--     success: true
--   })
