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
  /** Optional semantic/word family label, e.g. "walk family" */
  word_family?: string | null;
  part_of_speech?: string | null;
  /** TEXT[] in DB; legacy single TEXT may still be parsed client-side */
  grammar?: string[] | string | null;
  writing?: string[] | string | null;
  semantic?: string[] | string | null;
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
  activity_type: 'spelling_snake' | 'spelling_bee' | 'disappearing_letters' | 'sentence_ninja' | 'flashcard' | 'quiz';
  correct: boolean;
  details?: Record<string, unknown>;
  created_at?: string;
}

/** Writing / task sheet assigned by teacher to one student */
export interface VocabStudentAssignment {
  id: string;
  student_id: string;
  exercise_type: string | null;
  title: string;
  student_instructions: string;
  main_content: string;
  options: string[];
  sort_order: number;
  completed_at: string | null;
  created_at?: string;
}
