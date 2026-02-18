-- Migration: Student practice history (which day, which words, right/wrong)
-- Run this in Supabase SQL Editor if you already have the main schema.

-- ============================================
-- PRACTICE RECORDS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS vocab_practice_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
    practice_date DATE NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('spelling_snake', 'spelling_bee', 'flashcard', 'quiz')),
    correct BOOLEAN NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vocab_practice_records_student_id ON vocab_practice_records(student_id);
CREATE INDEX IF NOT EXISTS idx_vocab_practice_records_practice_date ON vocab_practice_records(practice_date);
CREATE INDEX IF NOT EXISTS idx_vocab_practice_records_student_date ON vocab_practice_records(student_id, practice_date);

ALTER TABLE vocab_practice_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Practice records are viewable by authenticated users"
    ON vocab_practice_records FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Practice records can be inserted by authenticated users"
    ON vocab_practice_records FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Practice records can be updated by authenticated users"
    ON vocab_practice_records FOR UPDATE
    USING (auth.role() = 'authenticated');
