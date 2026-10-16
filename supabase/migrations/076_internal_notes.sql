-- 076_internal_notes.sql
-- "Notes": things only the team needs to know about a request (booked legs, weight remarks, internal comments).
-- Special requests stay what is sent to carriers; notes are never sent. ADDITIVE ONLY.
-- Undo: supabase/rollback/076_internal_notes_down.sql
ALTER TABLE freight_requests ADD COLUMN IF NOT EXISTS internal_notes JSONB NOT NULL DEFAULT '[]';
