# Supabase Integration Guide

This guide explains how the Supabase integration works in the Spelling Fox app.

## Setup Complete ✅

Your Supabase credentials have been configured:
- **URL**: `https://lzbzmfzkqhkopgardfkq.supabase.co`
- **API Key**: Configured in `lib/supabase.ts`

## Files Created

1. **`lib/supabase.ts`** - Supabase client configuration and TypeScript types
2. **`lib/supabaseQueries.ts`** - Helper functions for database operations

## Available Functions

### Words Operations
- `getAllWords()` - Get all words from the word bank
- `getWordsByYearGroup(yearGroup)` - Get words for a specific year group
- `getWordsByLearningPoint(learningPoint)` - Get words with a specific learning point
- `addWord(word)` - Add a new word to the word bank
- `updateWord(id, updates)` - Update an existing word
- `deleteWord(id)` - Delete a word

### Students Operations
- `getAllStudents()` - Get all students
- `getStudent(id)` - Get a specific student
- `addStudent(name)` - Add a new student
- `updateStudent(id, updates)` - Update a student
- `deleteStudent(id)` - Delete a student

### Student Progress Operations
- `getStudentProgress(studentId)` - Get student's progress (points, streak)
- `updateStudentProgress(studentId, updates)` - Update student progress
- `addPointsToStudent(studentId, points)` - Add points to a student

### Daily Quests Operations
- `getStudentDailyQuests(studentId, date)` - Get student's daily quest words
- `getDailyQuestWordIds(studentId, date)` - Get just the word IDs for daily quest
- `assignWordsToDailyQuest(studentId, wordIds, date)` - Assign words to a student's daily quest
- `toggleDailyQuestWord(studentId, wordId, date)` - Toggle a word in/out of daily quest
- `markDailyQuestCompleted(studentId, wordId, date)` - Mark a quest as completed

## Usage Example

```typescript
import { getAllWords, addStudent, getStudentDailyQuests } from './lib/supabaseQueries';

// Get all words
const words = await getAllWords();

// Add a new student
const student = await addStudent('John Doe');

// Get today's quest for a student
const quests = await getStudentDailyQuests(student.id);
```

## Next Steps

1. **Run the SQL schema** in your Supabase project (from `supabase_schema.sql`)
2. **Update your app components** to use these Supabase functions instead of local state
3. **Test the integration** by adding words and students through the app

## Important Notes

- All functions return Promises, so use `async/await` or `.then()`
- Functions throw errors if something goes wrong - wrap in try/catch
- The `date` parameter defaults to today's date if not provided
- Student progress is automatically initialized when a student is created (via database trigger)
