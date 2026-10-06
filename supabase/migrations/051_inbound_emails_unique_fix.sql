-- 051: PostgREST upsert (onConflict: client_code,message_id) cannot target a PARTIAL unique index,
-- which caused "there is no unique or exclusion constraint matching the ON CONFLICT specification".
-- A plain unique index works: NULL message_ids are treated as distinct, so rows without an id are unaffected.
DROP INDEX IF EXISTS public.inbound_emails_msgid_key;
CREATE UNIQUE INDEX IF NOT EXISTS inbound_emails_msgid_key ON public.inbound_emails (client_code, message_id);
