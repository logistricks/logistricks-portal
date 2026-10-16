-- Undo 074. Drops the new columns (and their data). Run only if the portal no longer reads them.
DROP INDEX IF EXISTS freight_requests_shipment_type_idx;
ALTER TABLE freight_requests
  DROP COLUMN IF EXISTS legs,
  DROP COLUMN IF EXISTS cargo_lines,
  DROP COLUMN IF EXISTS truck_type,
  DROP COLUMN IF EXISTS temperature_control,
  DROP COLUMN IF EXISTS cargo_ready_date,
  DROP COLUMN IF EXISTS package_type,
  DROP COLUMN IF EXISTS chargeable_weight_stated,
  DROP COLUMN IF EXISTS chargeable_weight,
  DROP COLUMN IF EXISTS cbm,
  DROP COLUMN IF EXISTS type_source,
  DROP COLUMN IF EXISTS shipment_type;
