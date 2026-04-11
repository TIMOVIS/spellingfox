-- Online answers from students on writing assignments (run in Supabase SQL Editor).

ALTER TABLE vocab_student_assignments
  ADD COLUMN IF NOT EXISTS student_response JSONB DEFAULT NULL;

COMMENT ON COLUMN vocab_student_assignments.student_response IS
  'Student submission, e.g. {"text":"..."} and/or {"selectedOptionIndex":0} for multiple choice.';
