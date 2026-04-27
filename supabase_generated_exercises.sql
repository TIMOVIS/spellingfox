-- Store AI-generated comprehension text + exercises for each student.
-- Safe to run on existing projects (idempotent).

CREATE TABLE IF NOT EXISTS vocab_generated_exercises (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    -- e.g. "comprehension" (future-proof for other generated worksheet types)
    exercise_kind TEXT NOT NULL DEFAULT 'comprehension',
    title TEXT NOT NULL DEFAULT '',
    teacher_instructions TEXT NOT NULL DEFAULT '',
    passage TEXT NOT NULL DEFAULT '',
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    generator_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_word_ids UUID[] NOT NULL DEFAULT '{}',
    assigned_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    student_response JSONB DEFAULT NULL,
    student_draft JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vocab_generated_exercises_kind_check
      CHECK (exercise_kind IN ('comprehension'))
);

ALTER TABLE vocab_generated_exercises
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS student_response JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS student_draft JSONB DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_vocab_generated_exercises_student_id
  ON vocab_generated_exercises(student_id);
CREATE INDEX IF NOT EXISTS idx_vocab_generated_exercises_student_created
  ON vocab_generated_exercises(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vocab_generated_exercises_kind
  ON vocab_generated_exercises(exercise_kind);
CREATE INDEX IF NOT EXISTS idx_vocab_generated_exercises_questions_gin
  ON vocab_generated_exercises USING GIN (questions jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_vocab_generated_exercises_config_gin
  ON vocab_generated_exercises USING GIN (generator_config jsonb_path_ops);

DROP TRIGGER IF EXISTS update_vocab_generated_exercises_updated_at ON vocab_generated_exercises;
CREATE TRIGGER update_vocab_generated_exercises_updated_at
  BEFORE UPDATE ON vocab_generated_exercises
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vocab_generated_exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Generated exercises anon select" ON vocab_generated_exercises;
DROP POLICY IF EXISTS "Generated exercises anon insert" ON vocab_generated_exercises;
DROP POLICY IF EXISTS "Generated exercises anon update" ON vocab_generated_exercises;
DROP POLICY IF EXISTS "Generated exercises anon delete" ON vocab_generated_exercises;

CREATE POLICY "Generated exercises anon select"
  ON vocab_generated_exercises FOR SELECT USING (true);
CREATE POLICY "Generated exercises anon insert"
  ON vocab_generated_exercises FOR INSERT WITH CHECK (true);
CREATE POLICY "Generated exercises anon update"
  ON vocab_generated_exercises FOR UPDATE USING (true);
CREATE POLICY "Generated exercises anon delete"
  ON vocab_generated_exercises FOR DELETE USING (true);
