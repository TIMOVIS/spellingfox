-- Links each teacher-assigned writing exercise to a vocab word (optional for legacy rows).
-- Run in Supabase SQL Editor after vocab_student_assignments exists.

ALTER TABLE vocab_student_assignments
  ADD COLUMN IF NOT EXISTS word_id UUID REFERENCES vocab_words(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_student_assignments_student_created
  ON vocab_student_assignments(student_id, created_at DESC);
