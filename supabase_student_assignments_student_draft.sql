-- Autosaved in-progress answers (student can close the pack and continue later).
-- Run in Supabase SQL Editor.

ALTER TABLE vocab_student_assignments
  ADD COLUMN IF NOT EXISTS student_draft JSONB DEFAULT NULL;

COMMENT ON COLUMN vocab_student_assignments.student_draft IS
  'Partial response while not completed, same shape as student_response: text, selectedOptionIndex.';
