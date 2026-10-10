-- AI-extracted fields can be longer than the old VARCHAR limits (e.g. weight with a per-container breakdown).
-- Widen them to TEXT so a long value never makes the request insert fail. No data is changed.
ALTER TABLE public.freight_requests
  ALTER COLUMN origin_city          TYPE text,
  ALTER COLUMN origin_country       TYPE text,
  ALTER COLUMN destination_city     TYPE text,
  ALTER COLUMN destination_country  TYPE text,
  ALTER COLUMN cargo_type           TYPE text,
  ALTER COLUMN equipment            TYPE text,
  ALTER COLUMN weight               TYPE text,
  ALTER COLUMN quantity             TYPE text,
  ALTER COLUMN dimensions           TYPE text,
  ALTER COLUMN bl_type              TYPE text,
  ALTER COLUMN preferred_carrier    TYPE text;
