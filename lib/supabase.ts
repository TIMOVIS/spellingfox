import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for our tables
export interface VocabWord {
  id: string;
  word: string;
  definition: string;
  root?: string;
  origin?: string;
  etymology?: any;
  morphology?: any;
  letter_strings?: string[];
  year_group: 'Year 3' | 'Year 4' | 'Year 5' | 'Year 6';
  learning_point: string;
  synonyms: string[];
  antonyms: string[];
  example: string;
  created_at?: string;
  updated_at?: string;
}

export interface VocabStudent {
  id: string;
  name: string;
  created_at?: string;
  updated_at?: string;
}

export interface VocabStudentProgress {
  id: string;
  student_id: string;
  points: number;
  streak: number;
  last_active_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VocabDailyQuest {
  id: string;
  student_id: string;
  word_id: string;
  quest_date: string;
  completed: boolean;
  completed_at?: string;
  assigned_at?: string;
}

export interface VocabQuestCompletion {
  id: string;
  daily_quest_id: string;
  activity_type: 'flashcard' | 'quiz' | 'spelling';
  score: number;
  completed_at?: string;
}

export interface VocabPracticeRecord {
  id: string;
  student_id: string;
  word_id: string;
  practice_date: string;
  activity_type: 'spelling_snake' | 'spelling_bee' | 'flashcard' | 'quiz';
  correct: boolean;
  details?: Record<string, unknown>;
  created_at?: string;
}
