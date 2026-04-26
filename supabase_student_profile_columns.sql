-- Student profile fields for teacher mode (run in Supabase SQL Editor after vocab_students exists).
ALTER TABLE vocab_students
  ADD COLUMN IF NOT EXISTS year_group TEXT CHECK (
    year_group IS NULL OR year_group IN ('Year 3', 'Year 4', 'Year 5', 'Year 6')
  ),
  ADD COLUMN IF NOT EXISTS comprehension_level TEXT,
  ADD COLUMN IF NOT EXISTS writing_level TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT;

COMMENT ON COLUMN vocab_students.year_group IS 'Student school year (curriculum band), not a word field.';
COMMENT ON COLUMN vocab_students.comprehension_level IS 'Teacher-set reading comprehension band.';
COMMENT ON COLUMN vocab_students.writing_level IS 'Teacher-set writing level.';
COMMENT ON COLUMN vocab_students.interests IS 'Topics or hobbies to personalise learning.';
