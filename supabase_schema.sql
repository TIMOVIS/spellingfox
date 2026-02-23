-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- WORDS TABLE (Shared Word Bank)
-- ============================================
-- This table stores all words available in the word bank
-- Used by all students and teachers
CREATE TABLE vocab_words (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word TEXT NOT NULL UNIQUE,
    definition TEXT NOT NULL,
    
    -- Etymology information
    root TEXT, -- e.g., "Bene (Good)", "Dorm (Sleep)"
    origin TEXT, -- e.g., "Latin", "Greek", "Old English"
    etymology JSONB, -- Detailed etymology: {"root": "Bene", "language": "Latin", "meaning": "Good"}
    
    -- Morphology information
    morphology JSONB, -- e.g., {"prefix": "un-", "base": "happy", "suffix": "-ness"}
    
    -- Letter strings (spelling patterns)
    letter_strings TEXT[], -- e.g., ["ough", "ous", "tion"]
    
    -- Curriculum information
    year_group TEXT NOT NULL CHECK (year_group IN ('Year 3', 'Year 4', 'Year 5', 'Year 6')),
    learning_point TEXT NOT NULL, -- e.g., "-ous suffix", "Homophones", "Silent letters"
    
    -- Vocabulary information
    synonyms TEXT[] DEFAULT '{}',
    antonyms TEXT[] DEFAULT '{}',
    example TEXT NOT NULL, -- Example sentence from children's literature
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_vocab_words_year_group ON vocab_words(year_group);
CREATE INDEX idx_vocab_words_learning_point ON vocab_words(learning_point);
CREATE INDEX idx_vocab_words_letter_strings ON vocab_words USING GIN(letter_strings);

-- ============================================
-- STUDENTS TABLE
-- ============================================
CREATE TABLE vocab_students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- STUDENT_PROGRESS TABLE
-- ============================================
-- Tracks overall progress for each student
CREATE TABLE vocab_student_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    points INTEGER DEFAULT 0,
    streak INTEGER DEFAULT 0,
    last_active_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(student_id)
);

-- Index for faster lookups
CREATE INDEX idx_vocab_student_progress_student_id ON vocab_student_progress(student_id);

-- ============================================
-- DAILY_QUESTS TABLE
-- ============================================
-- Links students to words for their daily quest
-- Teachers assign words to students for specific dates
CREATE TABLE vocab_daily_quests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
    quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completed BOOLEAN DEFAULT FALSE,
    completed_at TIMESTAMP WITH TIME ZONE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure a word can only be assigned once per student per day
    UNIQUE(student_id, word_id, quest_date)
);

-- Indexes for faster lookups
CREATE INDEX idx_vocab_daily_quests_student_id ON vocab_daily_quests(student_id);
CREATE INDEX idx_vocab_daily_quests_word_id ON vocab_daily_quests(word_id);
CREATE INDEX idx_vocab_daily_quests_quest_date ON vocab_daily_quests(quest_date);
CREATE INDEX idx_vocab_daily_quests_student_date ON vocab_daily_quests(student_id, quest_date);

-- ============================================
-- QUEST_COMPLETIONS TABLE (Optional - for detailed tracking)
-- ============================================
-- Tracks when and how students complete quest activities
CREATE TABLE vocab_quest_completions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    daily_quest_id UUID NOT NULL REFERENCES vocab_daily_quests(id) ON DELETE CASCADE,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('flashcard', 'quiz', 'spelling')),
    score INTEGER DEFAULT 0,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_vocab_quest_completions_daily_quest_id ON vocab_quest_completions(daily_quest_id);

-- ============================================
-- PRACTICE RECORDS TABLE (student history: which day, which words, right/wrong)
-- ============================================
CREATE TABLE vocab_practice_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID NOT NULL REFERENCES vocab_students(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES vocab_words(id) ON DELETE CASCADE,
    practice_date DATE NOT NULL,
    activity_type TEXT NOT NULL CHECK (activity_type IN ('spelling_snake', 'spelling_bee', 'flashcard', 'quiz')),
    correct BOOLEAN NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vocab_practice_records_student_id ON vocab_practice_records(student_id);
CREATE INDEX idx_vocab_practice_records_practice_date ON vocab_practice_records(practice_date);
CREATE INDEX idx_vocab_practice_records_student_date ON vocab_practice_records(student_id, practice_date);

-- ============================================
-- TRIGGERS
-- ============================================
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_vocab_words_updated_at BEFORE UPDATE ON vocab_words
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vocab_students_updated_at BEFORE UPDATE ON vocab_students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vocab_student_progress_updated_at BEFORE UPDATE ON vocab_student_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================
-- Enable RLS on all tables
ALTER TABLE vocab_words ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_daily_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_quest_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vocab_practice_records ENABLE ROW LEVEL SECURITY;

-- Words: Public read, authenticated write
CREATE POLICY "Words are viewable by everyone"
    ON vocab_words FOR SELECT
    USING (true);

CREATE POLICY "Words can be inserted by authenticated users"
    ON vocab_words FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Words can be updated by authenticated users"
    ON vocab_words FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Students: Authenticated users can read/write
CREATE POLICY "Students are viewable by authenticated users"
    ON vocab_students FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Students can be inserted by authenticated users"
    ON vocab_students FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Students can be updated by authenticated users"
    ON vocab_students FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Student Progress: Authenticated users can read/write
CREATE POLICY "Student progress is viewable by authenticated users"
    ON vocab_student_progress FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Student progress can be inserted by authenticated users"
    ON vocab_student_progress FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Student progress can be updated by authenticated users"
    ON vocab_student_progress FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Daily Quests: Authenticated users can read/write
CREATE POLICY "Daily quests are viewable by authenticated users"
    ON vocab_daily_quests FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Daily quests can be inserted by authenticated users"
    ON vocab_daily_quests FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Daily quests can be updated by authenticated users"
    ON vocab_daily_quests FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Quest Completions: Authenticated users can read/write
CREATE POLICY "Quest completions are viewable by authenticated users"
    ON vocab_quest_completions FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Quest completions can be inserted by authenticated users"
    ON vocab_quest_completions FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

-- Practice records: same as other student data
CREATE POLICY "Practice records are viewable by authenticated users"
    ON vocab_practice_records FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Practice records can be inserted by authenticated users"
    ON vocab_practice_records FOR INSERT
    WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Practice records can be updated by authenticated users"
    ON vocab_practice_records FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Allow anon (no Supabase Auth) so practice history works with the public anon key
CREATE POLICY "Practice records anon select"
    ON vocab_practice_records FOR SELECT
    USING (true);
CREATE POLICY "Practice records anon insert"
    ON vocab_practice_records FOR INSERT
    WITH CHECK (true);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================
-- Function to get today's quest words for a student
CREATE OR REPLACE FUNCTION get_student_daily_quests(p_student_id UUID, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
    word_id UUID,
    word TEXT,
    definition TEXT,
    year_group TEXT,
    learning_point TEXT,
    completed BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        w.id,
        w.word,
        w.definition,
        w.year_group,
        w.learning_point,
        dq.completed
    FROM vocab_daily_quests dq
    JOIN vocab_words w ON dq.word_id = w.id
    WHERE dq.student_id = p_student_id
    AND dq.quest_date = p_date
    ORDER BY w.word;
END;
$$ LANGUAGE plpgsql;

-- Function to initialize student progress when a student is created
CREATE OR REPLACE FUNCTION initialize_student_progress()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO vocab_student_progress (student_id, points, streak)
    VALUES (NEW.id, 0, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_vocab_student_created
    AFTER INSERT ON vocab_students
    FOR EACH ROW
    EXECUTE FUNCTION initialize_student_progress();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================
-- Insert sample words
INSERT INTO vocab_words (word, definition, root, origin, year_group, learning_point, synonyms, antonyms, example, letter_strings, morphology, etymology) VALUES
(
    'Benevolent',
    'Well-meaning and kindly; desiring to do good for others.',
    'Bene (Good)',
    'Latin',
    'Year 5',
    '-ent suffix',
    ARRAY['Kind', 'Generous', 'Compassionate'],
    ARRAY['Malevolent', 'Spiteful', 'Cruel'],
    'The benevolent headmaster, much like Albus Dumbledore, always had a twinkle in his eye and a lemon sherbet for a troubled student.',
    ARRAY['ent'],
    '{"suffix": "-ent", "base": "benevol"}',
    '{"root": "Bene", "language": "Latin", "meaning": "Good"}'
),
(
    'Dormant',
    'In a deep sleep or state of rest; inactive for a period of time.',
    'Dorm (Sleep)',
    'Latin',
    'Year 5',
    '-ant suffix',
    ARRAY['Inactive', 'Sleeping', 'Latent'],
    ARRAY['Active', 'Awake', 'Lively'],
    'Deep in the Lonely Mountain, the dragon Smaug lay dormant for decades, guarding his stolen treasure in silence.',
    ARRAY['ant'],
    '{"suffix": "-ant", "base": "dorm"}',
    '{"root": "Dorm", "language": "Latin", "meaning": "Sleep"}'
),
(
    'Courageous',
    'Showing great bravery and not being deterred by danger or pain.',
    'Cor (Heart)',
    'Latin',
    'Year 4',
    '-ous suffix',
    ARRAY['Brave', 'Valiant', 'Heroic'],
    ARRAY['Cowardly', 'Timid', 'Fearful'],
    'Lucy Pevensie was a courageous explorer, stepping through the wardrobe into the snowy woods of Narnia without a second thought.',
    ARRAY['ous'],
    '{"suffix": "-ous", "base": "courage"}',
    '{"root": "Cor", "language": "Latin", "meaning": "Heart"}'
);
