-- Teacher "writing exercises" word selection per student (persists teal checkboxes in Curriculum Manager).
-- Run in Supabase SQL Editor after vocab_students and vocab_words exist.

CREATE TABLE IF NOT EXISTS vocab_student_writing_words (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_student_writing_words_student
    ON vocab_student_writing_words(student_id);
CREATE INDEX IF NOT EXISTS idx_vocab_student_writing_words_student_sort
    ON vocab_student_writing_words(student_id, sort_order);

ALTER TABLE vocab_student_writing_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Student writing words anon select" ON vocab_student_writing_words;
DROP POLICY IF EXISTS "Student writing words anon insert" ON vocab_student_writing_words;
DROP POLICY IF EXISTS "Student writing words anon update" ON vocab_student_writing_words;
DROP POLICY IF EXISTS "Student writing words anon delete" ON vocab_student_writing_words;

CREATE POLICY "Student writing words anon select"
    ON vocab_student_writing_words FOR SELECT USING (true);
CREATE POLICY "Student writing words anon insert"
    ON vocab_student_writing_words FOR INSERT WITH CHECK (true);
CREATE POLICY "Student writing words anon update"
    ON vocab_student_writing_words FOR UPDATE USING (true);
CREATE POLICY "Student writing words anon delete"
    ON vocab_student_writing_words FOR DELETE USING (true);

-- Optional: Database → Publications → supabase_realtime → add vocab_student_writing_words
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.vocab_student_writing_words;
