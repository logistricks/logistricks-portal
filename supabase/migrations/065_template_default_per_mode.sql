-- 065: "Quote Request" default templates per mode. One default per mode (Sea / Air / Land) and per channel
-- (Email / WhatsApp); one template may be the default for several modes. is_default stays as "default for at least one mode".
ALTER TABLE templates ADD COLUMN IF NOT EXISTS default_sea  boolean NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS default_air  boolean NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS default_land boolean NOT NULL DEFAULT false;

-- Existing single default → default for all three modes (one per client and channel)
UPDATE templates t SET default_sea = true, default_air = true, default_land = true
WHERE t.is_default AND t.id = (
  SELECT t2.id FROM templates t2 WHERE t2.client_code = t.client_code AND t2.type = t.type AND t2.is_default ORDER BY t2.template_id LIMIT 1
);
UPDATE templates SET is_default = (default_sea OR default_air OR default_land);

CREATE UNIQUE INDEX IF NOT EXISTS templates_one_default_sea  ON templates (client_code, type) WHERE default_sea;
CREATE UNIQUE INDEX IF NOT EXISTS templates_one_default_air  ON templates (client_code, type) WHERE default_air;
CREATE UNIQUE INDEX IF NOT EXISTS templates_one_default_land ON templates (client_code, type) WHERE default_land;
