-- Phase 4: AOG and DGR flags on freight_requests
ALTER TABLE public.freight_requests
  ADD COLUMN IF NOT EXISTS aog BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS dgr BOOLEAN NOT NULL DEFAULT FALSE;

-- Index so the requests list can sort AOG/DGR rows to top efficiently
CREATE INDEX IF NOT EXISTS idx_freight_requests_aog ON public.freight_requests (client_code, aog DESC, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_freight_requests_dgr ON public.freight_requests (client_code, dgr DESC, received_at DESC);
