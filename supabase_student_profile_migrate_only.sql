-- Safe when vocab_students already exists. Paste and run this whole file only.
-- (Do NOT run supabase_schema.sql or any CREATE TABLE vocab_students on an existing DB.)

ALTER TABLE vocab_students
  ADD COLUMN IF NOT EXISTS year_group TEXT,
  ADD COLUMN IF NOT EXISTS comprehension_level TEXT,
  ADD COLUMN IF NOT EXISTS writing_level TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT;

ALTER TABLE vocab_students DROP CONSTRAINT IF EXISTS vocab_students_year_group_check;
ALTER TABLE vocab_students
  ADD CONSTRAINT vocab_students_year_group_check CHECK (
    year_group IS NULL OR year_group IN ('Year 3', 'Year 4', 'Year 5', 'Year 6')
  );

COMMENT ON COLUMN vocab_students.year_group IS 'Student school year (curriculum band), not a word field.';
COMMENT ON COLUMN vocab_students.comprehension_level IS 'Teacher-set reading comprehension band.';
COMMENT ON COLUMN vocab_students.writing_level IS 'Teacher-set writing level.';
COMMENT ON COLUMN vocab_students.interests IS 'Topics or hobbies to personalise learning.';
