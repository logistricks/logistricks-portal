-- A freight request can only be deleted once nothing else points to it.
-- Every foreign key that references freight_requests is re-created with ON DELETE RESTRICT,
-- so deleting a request that still has quotes, quotations, notifications, emails etc. fails
-- until those rows are removed first. Run once in the Supabase SQL editor; safe to re-run.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS child, c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.confrelid = 'public.freight_requests'::regclass
      AND c.confdeltype <> 'r'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.child, r.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      r.child, r.conname,
      regexp_replace(regexp_replace(r.def, '\s+ON DELETE (CASCADE|SET NULL|SET DEFAULT|NO ACTION)', '', 'g'), '$', ' ON DELETE RESTRICT')
    );
    RAISE NOTICE 'Protected: %.%', r.child, r.conname;
  END LOOP;
END $$;

-- Check: every row should now say RESTRICT.
-- select conrelid::regclass, conname, case confdeltype when 'r' then 'RESTRICT' when 'c' then 'CASCADE' when 'n' then 'SET NULL' else 'NO ACTION' end
-- from pg_constraint where confrelid = 'public.freight_requests'::regclass;
