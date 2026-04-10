
export type UserRole = 'student' | 'tutor';

export type YearGroup = 'Year 3' | 'Year 4' | 'Year 5' | 'Year 6';

export interface WordEntry {
  id: string;
  word: string;
  definition: string;
  root?: string;
  origin?: string;
  /** Optional semantic/word family label, e.g. "walk family" */
  wordFamily?: string;
  /** Single value: noun | verb | adjective | adverb | pronoun | conjunction | preposition | determiner | interjection */
  partOfSpeech?: string;
  /** Allowed tags only; see lib/vocabTaxonomy.ts (grammar TEXT[] in DB) */
  grammar?: string[];
  writing?: string[];
  semantic?: string[];
  synonyms: string[];
  antonyms: string[];
  example: string;
  yearGroup: YearGroup;
  learningPoint: string; // e.g., "-ous", "-ly", "Homophones"
}

export interface Exercise {
  id: string;
  title: string;
  type: 'synonym' | 'morphology' | 'root-search' | 'cloze' | 'spelling';
  difficulty: YearGroup;
  targetWords: string[];
}

export interface StudentData {
  id: string;
  name: string;
  points: number;
  streak: number;
  wordBank: WordEntry[];
  dailyWordIds: string[]; // IDs of words selected for today's list
  /** Word IDs ticked for "Writing exercises" (stored in Supabase). */
  writingWordIds: string[];
}

export interface AppState {
  role: UserRole;
  studentName: string;
  points: number;
  streak: number;
  wordBank: WordEntry[];
  dailyWordIds: string[]; // IDs of words selected for today's list
  activeExercise: Exercise | null;
  // Teacher mode state
  students: StudentData[];
  selectedStudentId: string | null;
}
