-- ============================================================
-- 040_carrier_quote_extraction_fields.sql
--
-- Full carrier-quote field set for the n8n "carrier reply" workflow
-- (based on freight-quote-extraction-spec.md). Everything is nullable:
-- the AI returns null for anything the carrier did not state.
--
-- Design:
--   * Common, searchable fields are real columns.
--   * Repeating / mode-specific data is JSONB (charges, legs, cutoffs,
--     mode_details), so no schema change per mode.
--   * Weight, totals and date checks are computed in CODE
--     (lib/quote-math.ts) and written here — never by the AI.
--   * Per-field evidence ("raw_text", "evidence", "confidence") lives in
--     `extraction`, so a review screen can highlight the source.
--
-- Run after 039. Safe to re-run.
-- ============================================================

BEGIN;

ALTER TABLE public.carrier_quotes
  -- A. Quote header
  ADD COLUMN IF NOT EXISTS carrier_quote_ref     TEXT,           -- carrier's own reference number
  ADD COLUMN IF NOT EXISTS response_type         TEXT,           -- quote | counter | decline | info_request | update | other
  ADD COLUMN IF NOT EXISTS quote_status          TEXT,           -- firm | indicative | subject_to_space | subject_to_equipment
  ADD COLUMN IF NOT EXISTS version               INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS supersedes_quote_id   BIGINT REFERENCES public.carrier_quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mode                  TEXT,           -- land | air | sea
  ADD COLUMN IF NOT EXISTS service_level         TEXT,           -- express | standard | deferred | FTL | LTL | FCL | LCL ...
  ADD COLUMN IF NOT EXISTS quote_date            DATE,
  ADD COLUMN IF NOT EXISTS valid_from            DATE,
  ADD COLUMN IF NOT EXISTS is_all_in             BOOLEAN,
  ADD COLUMN IF NOT EXISTS tax_included         BOOLEAN,
  ADD COLUMN IF NOT EXISTS tax_amount            NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS total_amount          NUMERIC(14,2),  -- COMPUTED in code from charge lines
  ADD COLUMN IF NOT EXISTS total_amount_stated   NUMERIC(14,2),  -- as written by the carrier
  ADD COLUMN IF NOT EXISTS minimum_charge        NUMERIC(14,2),

  -- B. Cargo as quoted (compare with the request to catch mismatches)
  ADD COLUMN IF NOT EXISTS commodity_description TEXT,
  ADD COLUMN IF NOT EXISTS hs_code               TEXT,
  ADD COLUMN IF NOT EXISTS pieces                INTEGER,
  ADD COLUMN IF NOT EXISTS packaging_type        TEXT,
  ADD COLUMN IF NOT EXISTS gross_weight          NUMERIC(14,3),  -- as stated, in weight_unit
  ADD COLUMN IF NOT EXISTS weight_unit           TEXT,           -- kg | lb | t
  ADD COLUMN IF NOT EXISTS gross_weight_kg       NUMERIC(14,3),  -- COMPUTED (normalised to kg)
  ADD COLUMN IF NOT EXISTS volume_cbm            NUMERIC(14,3),
  ADD COLUMN IF NOT EXISTS dimensions            JSONB,          -- [{length_cm,width_cm,height_cm,pieces}]
  ADD COLUMN IF NOT EXISTS volumetric_divisor    INTEGER,        -- 6000 air (default), 5000 courier ...
  ADD COLUMN IF NOT EXISTS volumetric_weight_kg  NUMERIC(14,3),  -- COMPUTED
  ADD COLUMN IF NOT EXISTS chargeable_weight_stated NUMERIC(14,3), -- as written by the carrier (kg)
  ADD COLUMN IF NOT EXISTS chargeable_weight     NUMERIC(14,3),  -- COMPUTED: air/land kg; sea LCL revenue tons
  ADD COLUMN IF NOT EXISTS chargeable_unit       TEXT,           -- kg | rt (W/M revenue ton)
  ADD COLUMN IF NOT EXISTS chargeable_basis      TEXT,           -- actual | volumetric | wm_weight | wm_volume | stated
  ADD COLUMN IF NOT EXISTS stackable             BOOLEAN,
  ADD COLUMN IF NOT EXISTS declared_value        NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS temperature_control   TEXT,
  ADD COLUMN IF NOT EXISTS hazmat                JSONB,          -- {un_number,class,packing_group}
  ADD COLUMN IF NOT EXISTS special_handling      TEXT,
  ADD COLUMN IF NOT EXISTS container_type        TEXT,           -- 20GP | 40GP | 40HC | 20RF ...
  ADD COLUMN IF NOT EXISTS container_count       INTEGER,

  -- C. Route and schedule
  ADD COLUMN IF NOT EXISTS origin_place          TEXT,
  ADD COLUMN IF NOT EXISTS destination_place     TEXT,
  ADD COLUMN IF NOT EXISTS origin_code           TEXT,           -- UN/LOCODE or IATA
  ADD COLUMN IF NOT EXISTS destination_code      TEXT,
  ADD COLUMN IF NOT EXISTS incoterm              TEXT,
  ADD COLUMN IF NOT EXISTS incoterm_place        TEXT,
  ADD COLUMN IF NOT EXISTS etd                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS eta                   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS frequency             TEXT,           -- weekly | daily ...
  ADD COLUMN IF NOT EXISTS direct_or_connecting TEXT,
  ADD COLUMN IF NOT EXISTS legs                  JSONB,          -- [{seq,type,origin,destination,carrier,vessel_flight,voyage,etd,eta}]
  ADD COLUMN IF NOT EXISTS cutoffs               JSONB,          -- {documents,cargo,vgm,gate_in,screening}

  -- D. Pricing lines
  ADD COLUMN IF NOT EXISTS charges               JSONB,          -- [{canonical_code,carrier_label,category,basis,unit_rate,quantity,amount,currency,inclusion,applies_to_leg,payable_by,condition_note}]
  ADD COLUMN IF NOT EXISTS weight_break_tiers    JSONB,          -- air/LTL [{from_kg,rate}]

  -- E. Mode-specific details and equipment
  ADD COLUMN IF NOT EXISTS equipment_type        TEXT,           -- dry van | reefer | flatbed ...
  ADD COLUMN IF NOT EXISTS space_confirmed       BOOLEAN,        -- air/sea: confirmed vs subject to availability
  ADD COLUMN IF NOT EXISTS free_days_demurrage   SMALLINT,       -- sea: at port
  ADD COLUMN IF NOT EXISTS free_days_detention   SMALLINT,       -- sea: container
  ADD COLUMN IF NOT EXISTS per_diem_note         TEXT,           -- rates after free time
  ADD COLUMN IF NOT EXISTS mode_details         JSONB,          -- airline, flight_numbers, awb_prefix, vessel, voyage, freight_class, ...

  -- F. Terms
  ADD COLUMN IF NOT EXISTS payment_terms         TEXT,
  ADD COLUMN IF NOT EXISTS insurance_offered     BOOLEAN,
  ADD COLUMN IF NOT EXISTS liability_limit       TEXT,
  ADD COLUMN IF NOT EXISTS cancellation_terms    TEXT,
  ADD COLUMN IF NOT EXISTS exclusions            TEXT,
  ADD COLUMN IF NOT EXISTS subject_to_conditions TEXT,
  ADD COLUMN IF NOT EXISTS required_documents    TEXT,

  -- G. Extraction metadata
  ADD COLUMN IF NOT EXISTS source_type           TEXT,           -- email_body | pdf | excel | image
  ADD COLUMN IF NOT EXISTS source_files          JSONB,          -- [{filename,page}]
  ADD COLUMN IF NOT EXISTS extraction            JSONB,          -- {field: {raw_text,evidence,confidence,status}}
  ADD COLUMN IF NOT EXISTS model_version         TEXT,
  ADD COLUMN IF NOT EXISTS prompt_version        TEXT,
  ADD COLUMN IF NOT EXISTS validation_flags      JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{code,field,severity,message}]
  ADD COLUMN IF NOT EXISTS rfq_match_score       NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS discrepancies         JSONB,          -- differences vs the request
  ADD COLUMN IF NOT EXISTS review_status         TEXT NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS verified_by           TEXT,
  ADD COLUMN IF NOT EXISTS verified_at           TIMESTAMPTZ;

-- ── Allowed values ─────────────────────────────────────────────────────────
ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS cq_response_type_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT cq_response_type_check CHECK (
  response_type IS NULL OR response_type IN ('quote','counter','decline','info_request','update','other'));

ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS cq_quote_status_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT cq_quote_status_check CHECK (
  quote_status IS NULL OR quote_status IN ('firm','indicative','subject_to_space','subject_to_equipment'));

ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS cq_mode_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT cq_mode_check CHECK (
  mode IS NULL OR mode IN ('land','air','sea'));

ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS cq_review_status_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT cq_review_status_check CHECK (
  review_status IN ('auto_accepted','needs_review','human_verified'));

ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS cq_chargeable_unit_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT cq_chargeable_unit_check CHECK (
  chargeable_unit IS NULL OR chargeable_unit IN ('kg','rt'));

ALTER TABLE public.carrier_quotes DROP CONSTRAINT IF EXISTS cq_chargeable_basis_check;
ALTER TABLE public.carrier_quotes ADD CONSTRAINT cq_chargeable_basis_check CHECK (
  chargeable_basis IS NULL OR chargeable_basis IN ('actual','volumetric','wm_weight','wm_volume','stated'));

CREATE INDEX IF NOT EXISTS cq_review_idx
  ON public.carrier_quotes (client_code, review_status)
  WHERE review_status = 'needs_review';

COMMIT;
