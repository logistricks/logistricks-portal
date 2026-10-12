-- Files that came with a request email: [{ filename, url, mime_type, size_bytes }].
-- If the column already exists as text, it is left as is; the portal reads both.
alter table freight_requests add column if not exists attachments jsonb default '[]'::jsonb;
