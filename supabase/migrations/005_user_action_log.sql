-- ============================================================
-- 005_user_action_log.sql
-- Full audit trail: CREATE, UPDATE, DELETE (triggers),
-- VIEW and SEND (app-level calls).
-- Run AFTER 003_data_tables.sql.
-- ============================================================

CREATE TYPE action_type AS ENUM (
  'CREATE', 'UPDATE', 'DELETE', 'VIEW', 'SEND'
);

CREATE TABLE IF NOT EXISTS user_action_log (
  id           BIGSERIAL    PRIMARY KEY,
  user_id      UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  client_code  VARCHAR(15)  REFERENCES clients(client_code),
  action       action_type  NOT NULL,
  table_name   VARCHAR(50)  NOT NULL,
  record_id    TEXT,                    -- usually a UUID cast to text
  old_values   JSONB,                   -- NULL on CREATE
  new_values   JSONB,                   -- NULL on DELETE
  description  TEXT,                    -- human-readable summary
  acted_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ual_user_idx        ON user_action_log(user_id);
CREATE INDEX IF NOT EXISTS ual_client_code_idx ON user_action_log(client_code);
CREATE INDEX IF NOT EXISTS ual_acted_at_idx    ON user_action_log(acted_at DESC);
CREATE INDEX IF NOT EXISTS ual_table_name_idx  ON user_action_log(table_name);

ALTER TABLE user_action_log ENABLE ROW LEVEL SECURITY;

-- Admins see all; operators see only their own
CREATE POLICY "ual_admin_select"
  ON user_action_log FOR SELECT
  USING (
    client_code = get_my_client_code()
    AND (i_am_admin() OR user_id = auth.uid())
  );

-- ── Generic trigger function for automatic DB logging ────────
CREATE OR REPLACE FUNCTION _log_table_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_action     action_type;
  v_record_id  TEXT;
  v_old        JSONB := NULL;
  v_new        JSONB := NULL;
  v_client     VARCHAR(15);
BEGIN
  IF    TG_OP = 'INSERT' THEN
    v_action := 'CREATE';
    v_new    := to_jsonb(NEW);
    v_record_id := NEW.id::TEXT;
    v_client    := NEW.client_code;
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'UPDATE';
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_record_id := NEW.id::TEXT;
    v_client    := NEW.client_code;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_old    := to_jsonb(OLD);
    v_record_id := OLD.id::TEXT;
    v_client    := OLD.client_code;
  END IF;

  INSERT INTO user_action_log
    (user_id, client_code, action, table_name, record_id, old_values, new_values)
  VALUES
    (auth.uid(), v_client, v_action, TG_TABLE_NAME, v_record_id, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Attach trigger to each audited table ────────────────────
CREATE TRIGGER audit_freight_requests
  AFTER INSERT OR UPDATE OR DELETE ON freight_requests
  FOR EACH ROW EXECUTE FUNCTION _log_table_change();

CREATE TRIGGER audit_carriers
  AFTER INSERT OR UPDATE OR DELETE ON carriers
  FOR EACH ROW EXECUTE FUNCTION _log_table_change();

CREATE TRIGGER audit_message_templates
  AFTER INSERT OR UPDATE OR DELETE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION _log_table_change();

-- ── App-level helper (call from Next.js server action) ───────
-- For VIEW and SEND events that triggers cannot capture:
--
--   await supabaseAdmin.from('user_action_log').insert({
--     user_id:     session.user.id,
--     client_code: profile.client_code,
--     action:      'VIEW',              -- or 'SEND'
--     table_name:  'freight_requests',
--     record_id:   requestId,
--     description: 'Opened request from Ahmed Al-Farsi'
--   })
