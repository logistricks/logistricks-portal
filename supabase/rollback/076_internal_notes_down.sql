-- Undo 076: removes the notes column (the notes are lost).
ALTER TABLE freight_requests DROP COLUMN IF EXISTS internal_notes;
