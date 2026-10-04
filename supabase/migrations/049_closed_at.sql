-- 049: track when a freight request was closed (dashboard "Closed in period").
ALTER TABLE public.freight_requests ADD COLUMN IF NOT EXISTS closed_at timestamptz;

UPDATE public.freight_requests SET closed_at = updated_at WHERE status = 'Closed' AND closed_at IS NULL;

CREATE OR REPLACE FUNCTION public.set_freight_closed_at() RETURNS trigger AS $$
BEGIN
  IF NEW.status = 'Closed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'Closed') THEN
    NEW.closed_at := now();
  ELSIF NEW.status <> 'Closed' THEN
    NEW.closed_at := NULL;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_freight_closed_at ON public.freight_requests;
CREATE TRIGGER trg_freight_closed_at BEFORE INSERT OR UPDATE OF status ON public.freight_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_freight_closed_at();

CREATE INDEX IF NOT EXISTS freight_requests_client_received_idx ON public.freight_requests (client_code, received_at DESC);
CREATE INDEX IF NOT EXISTS carrier_quotes_received_idx ON public.carrier_quotes (received_at DESC);
CREATE INDEX IF NOT EXISTS quotations_client_created_idx ON public.quotations (client_code, created_at DESC);
