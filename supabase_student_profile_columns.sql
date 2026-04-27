-- =============================================================================
-- vocab_students: student profile columns (year group, levels, interests)
--
-- IMPORTANT: If you already have vocab_students, do NOT run supabase_schema.sql
-- or any CREATE TABLE vocab_students — that causes: ERROR 42P07 relation exists.
-- Use supabase_student_profile_migrate_only.sql (smallest copy-paste) or run (A) below.
--
-- Safe to re-run (idempotent).
--
-- If saves from the app still fail after this:
-- 1) Settings → API → reload/restart so PostgREST picks up new columns.
-- 2) RLS: tutors must be allowed to UPDATE vocab_students. For open anon
--    access (dev), run supabase_rls_update.sql. For auth-only setups, ensure
--    your policy allows UPDATE for your role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) Existing database: add columns (skip if already present)
-- ---------------------------------------------------------------------------
ALTER TABLE vocab_students
  ADD COLUMN IF NOT EXISTS year_group TEXT,
  ADD COLUMN IF NOT EXISTS comprehension_level TEXT,
  ADD COLUMN IF NOT EXISTS writing_level TEXT,
  ADD COLUMN IF NOT EXISTS interests TEXT;

-- Enforce allowed year labels (matches app YearGroup type)
ALTER TABLE vocab_students DROP CONSTRAINT IF EXISTS vocab_students_year_group_check;
ALTER TABLE vocab_students
  ADD CONSTRAINT vocab_students_year_group_check CHECK (
    year_group IS NULL OR year_group IN ('Year 3', 'Year 4', 'Year 5', 'Year 6')
  );

COMMENT ON COLUMN vocab_students.year_group IS 'Student school year (curriculum band), not a word field.';
COMMENT ON COLUMN vocab_students.comprehension_level IS 'Teacher-set reading comprehension band.';
COMMENT ON COLUMN vocab_students.writing_level IS 'Teacher-set writing level.';
COMMENT ON COLUMN vocab_students.interests IS 'Topics or hobbies to personalise learning.';

-- Full CREATE TABLE for brand-new projects lives in supabase_schema.sql only.

-- ---------------------------------------------------------------------------
-- Verify columns (optional)
-- ---------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'vocab_students'
-- ORDER BY ordinal_position;
