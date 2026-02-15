# Supabase Database Setup Guide

This guide will help you set up the Supabase database for the Spelling Fox app.

## Prerequisites

1. A Supabase account (sign up at https://supabase.com)
2. A new Supabase project created

## Setup Steps

### 1. Create a New Supabase Project

1. Go to https://supabase.com and sign in
2. Click "New Project"
3. Fill in your project details
4. Wait for the project to be created

### 2. Run the SQL Schema

1. In your Supabase project dashboard, go to **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase_schema.sql`
4. Click **Run** (or press Cmd/Ctrl + Enter)
5. Verify that all tables were created successfully

### 3. Get Your Project Credentials

1. Go to **Project Settings** → **API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (for client-side access)
   - **service_role key** (for server-side access - keep this secret!)

### 4. Configure Authentication (Optional)

If you want to use Supabase Auth:
1. Go to **Authentication** → **Providers**
2. Enable the authentication methods you want (Email, Google, etc.)
3. Configure your settings

## Database Schema Overview

### Tables

1. **vocab_words** - Shared word bank with detailed etymology, morphology, and letter strings
2. **vocab_students** - Student records
3. **vocab_student_progress** - Tracks points, streaks, and progress for each student
4. **vocab_daily_quests** - Links students to words for their daily quests
5. **vocab_quest_completions** - Detailed tracking of quest activity completions

### Key Features

- **Shared Word Bank**: All words are stored in one table, accessible by all students and teachers
- **Student-Specific Daily Quests**: Teachers assign words to individual students
- **Progress Tracking**: Points, streaks, and completion status
- **Rich Word Data**: Etymology, morphology, and letter strings for each word
- **Row Level Security**: Configured for authenticated access

## Useful Queries

### Get all words for a specific year group
```sql
SELECT * FROM vocab_words WHERE year_group = 'Year 5' ORDER BY word;
```

### Get words with a specific learning point
```sql
SELECT * FROM vocab_words WHERE learning_point = '-ous suffix' ORDER BY word;
```

### Get words containing a specific letter string
```sql
SELECT * FROM vocab_words WHERE 'ous' = ANY(letter_strings) ORDER BY word;
```

### Get today's quest for a student
```sql
SELECT * FROM get_student_daily_quests('student-uuid-here', CURRENT_DATE);
```

### Assign words to a student's daily quest
```sql
INSERT INTO vocab_daily_quests (student_id, word_id, quest_date)
VALUES 
  ('student-uuid-here', 'word-uuid-1', CURRENT_DATE),
  ('student-uuid-here', 'word-uuid-2', CURRENT_DATE);
```

### Get student progress
```sql
SELECT s.name, sp.points, sp.streak, sp.last_active_date
FROM vocab_students s
JOIN vocab_student_progress sp ON s.id = sp.student_id
WHERE s.id = 'student-uuid-here';
```

### Mark a daily quest as completed
```sql
UPDATE vocab_daily_quests
SET completed = TRUE, completed_at = NOW()
WHERE student_id = 'student-uuid-here' 
  AND word_id = 'word-uuid-here'
  AND quest_date = CURRENT_DATE;
```

### Get all students with their progress
```sql
SELECT 
  s.id,
  s.name,
  sp.points,
  sp.streak,
  COUNT(DISTINCT dq.id) as total_quests,
  COUNT(DISTINCT CASE WHEN dq.completed THEN dq.id END) as completed_quests
FROM vocab_students s
LEFT JOIN vocab_student_progress sp ON s.id = sp.student_id
LEFT JOIN vocab_daily_quests dq ON s.id = dq.student_id
GROUP BY s.id, s.name, sp.points, sp.streak
ORDER BY s.name;
```

## Next Steps

1. Install Supabase client library in your app:
   ```bash
   npm install @supabase/supabase-js
   ```

2. Create a Supabase client configuration file
3. Update your app to use Supabase for data storage
4. Implement authentication if needed

## Notes

- The schema includes sample data for testing
- Row Level Security (RLS) is enabled - you may need to adjust policies based on your authentication setup
- All timestamps use `TIMESTAMP WITH TIME ZONE` for proper timezone handling
- The `get_student_daily_quests` function is a helper for retrieving daily quests
