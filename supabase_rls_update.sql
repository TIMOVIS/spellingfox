-- ============================================
-- UPDATE RLS POLICIES FOR ANONYMOUS ACCESS
-- ============================================
-- This allows the app to work without authentication
-- Run this AFTER you've run the main schema

-- Drop existing policies
DROP POLICY IF EXISTS "Words are viewable by everyone" ON vocab_words;
DROP POLICY IF EXISTS "Words can be inserted by authenticated users" ON vocab_words;
DROP POLICY IF EXISTS "Words can be updated by authenticated users" ON vocab_words;

DROP POLICY IF EXISTS "Students are viewable by authenticated users" ON vocab_students;
DROP POLICY IF EXISTS "Students can be inserted by authenticated users" ON vocab_students;
DROP POLICY IF EXISTS "Students can be updated by authenticated users" ON vocab_students;

DROP POLICY IF EXISTS "Student progress is viewable by authenticated users" ON vocab_student_progress;
DROP POLICY IF EXISTS "Student progress can be inserted by authenticated users" ON vocab_student_progress;
DROP POLICY IF EXISTS "Student progress can be updated by authenticated users" ON vocab_student_progress;

DROP POLICY IF EXISTS "Daily quests are viewable by authenticated users" ON vocab_daily_quests;
DROP POLICY IF EXISTS "Daily quests can be inserted by authenticated users" ON vocab_daily_quests;
DROP POLICY IF EXISTS "Daily quests can be updated by authenticated users" ON vocab_daily_quests;

DROP POLICY IF EXISTS "Quest completions are viewable by authenticated users" ON vocab_quest_completions;
DROP POLICY IF EXISTS "Quest completions can be inserted by authenticated users" ON vocab_quest_completions;

-- Create new policies that allow anonymous access (for development)
-- Words: Public read/write
CREATE POLICY "Words are viewable by everyone"
    ON vocab_words FOR SELECT
    USING (true);

CREATE POLICY "Words can be inserted by anyone"
    ON vocab_words FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Words can be updated by anyone"
    ON vocab_words FOR UPDATE
    USING (true);

CREATE POLICY "Words can be deleted by anyone"
    ON vocab_words FOR DELETE
    USING (true);

-- Students: Public read/write
CREATE POLICY "Students are viewable by everyone"
    ON vocab_students FOR SELECT
    USING (true);

CREATE POLICY "Students can be inserted by anyone"
    ON vocab_students FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Students can be updated by anyone"
    ON vocab_students FOR UPDATE
    USING (true);

CREATE POLICY "Students can be deleted by anyone"
    ON vocab_students FOR DELETE
    USING (true);

-- Student Progress: Public read/write
CREATE POLICY "Student progress is viewable by everyone"
    ON vocab_student_progress FOR SELECT
    USING (true);

CREATE POLICY "Student progress can be inserted by anyone"
    ON vocab_student_progress FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Student progress can be updated by anyone"
    ON vocab_student_progress FOR UPDATE
    USING (true);

CREATE POLICY "Student progress can be deleted by anyone"
    ON vocab_student_progress FOR DELETE
    USING (true);

-- Daily Quests: Public read/write
CREATE POLICY "Daily quests are viewable by everyone"
    ON vocab_daily_quests FOR SELECT
    USING (true);

CREATE POLICY "Daily quests can be inserted by anyone"
    ON vocab_daily_quests FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Daily quests can be updated by anyone"
    ON vocab_daily_quests FOR UPDATE
    USING (true);

CREATE POLICY "Daily quests can be deleted by anyone"
    ON vocab_daily_quests FOR DELETE
    USING (true);

-- Quest Completions: Public read/write
CREATE POLICY "Quest completions are viewable by everyone"
    ON vocab_quest_completions FOR SELECT
    USING (true);

CREATE POLICY "Quest completions can be inserted by anyone"
    ON vocab_quest_completions FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Quest completions can be updated by anyone"
    ON vocab_quest_completions FOR UPDATE
    USING (true);

CREATE POLICY "Quest completions can be deleted by anyone"
    ON vocab_quest_completions FOR DELETE
    USING (true);
