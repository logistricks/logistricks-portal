-- 066: which modes a template is for (mode_*), separate from which modes it is the default for (default_*).
-- A default requires the mode; one default per mode and channel (unique indexes from 065).
ALTER TABLE templates ADD COLUMN IF NOT EXISTS mode_sea  boolean NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS mode_air  boolean NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS mode_land boolean NOT NULL DEFAULT false;
UPDATE templates SET mode_sea = true  WHERE default_sea;
UPDATE templates SET mode_air = true  WHERE default_air;
UPDATE templates SET mode_land = true WHERE default_land;
