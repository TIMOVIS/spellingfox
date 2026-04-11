-- Groups rows created in one teacher "assign" action into one pack for the student UI.
-- Run in Supabase SQL Editor.

ALTER TABLE vocab_student_assignments
  ADD COLUMN IF NOT EXISTS batch_id UUID;

CREATE INDEX IF NOT EXISTS idx_vocab_student_assignments_batch
  ON vocab_student_assignments(student_id, batch_id)
  WHERE batch_id IS NOT NULL;
