-- Teacher-assigned writing exercises for students (run in Supabase SQL Editor).
CREATE TABLE IF NOT EXISTS vocab_student_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    exercise_type TEXT,
    title TEXT NOT NULL,
    student_instructions TEXT NOT NULL DEFAULT '',
    main_content TEXT NOT NULL DEFAULT '',
    options TEXT[] DEFAULT '{}',
    sort_order INT NOT NULL DEFAULT 0,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocab_student_assignments_student_id ON vocab_student_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_vocab_student_assignments_completed ON vocab_student_assignments(student_id, completed_at);

ALTER TABLE vocab_student_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Student assignments anon select" ON vocab_student_assignments;
DROP POLICY IF EXISTS "Student assignments anon insert" ON vocab_student_assignments;
DROP POLICY IF EXISTS "Student assignments anon update" ON vocab_student_assignments;
DROP POLICY IF EXISTS "Student assignments anon delete" ON vocab_student_assignments;

CREATE POLICY "Student assignments anon select"
    ON vocab_student_assignments FOR SELECT USING (true);
CREATE POLICY "Student assignments anon insert"
    ON vocab_student_assignments FOR INSERT WITH CHECK (true);
CREATE POLICY "Student assignments anon update"
    ON vocab_student_assignments FOR UPDATE USING (true);
CREATE POLICY "Student assignments anon delete"
    ON vocab_student_assignments FOR DELETE USING (true);
