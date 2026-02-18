import { supabase, VocabWord, VocabStudent, VocabStudentProgress, VocabDailyQuest, VocabPracticeRecord } from './supabase';

/** App timezone: London (Europe/London). */
const LONDON_TIMEZONE = 'Europe/London';

/** Returns today's date as YYYY-MM-DD in London timezone (for daily quests). */
export const getTodayLondonDate = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: LONDON_TIMEZONE });

// ============================================
// WORDS QUERIES
// ============================================

const WORDS_PAGE_SIZE = 1000;

/** Fetches all words; paginates to avoid PostgREST default 1000-row limit. */
export const getAllWords = async (): Promise<VocabWord[]> => {
  const all: VocabWord[] = [];
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const to = from + WORDS_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('vocab_words')
      .select('*')
      .order('word')
      .range(from, to);
    if (error) throw error;
    const page = data || [];
    all.push(...page);
    hasMore = page.length === WORDS_PAGE_SIZE;
    from += WORDS_PAGE_SIZE;
  }
  return all;
};

export const getWordsByYearGroup = async (yearGroup: string): Promise<VocabWord[]> => {
  const { data, error } = await supabase
    .from('vocab_words')
    .select('*')
    .eq('year_group', yearGroup)
    .order('word');
  
  if (error) throw error;
  return data || [];
};

export const getWordsByLearningPoint = async (learningPoint: string): Promise<VocabWord[]> => {
  const { data, error } = await supabase
    .from('vocab_words')
    .select('*')
    .eq('learning_point', learningPoint)
    .order('word');
  
  if (error) throw error;
  return data || [];
};

export const addWord = async (word: Omit<VocabWord, 'id' | 'created_at' | 'updated_at'>): Promise<VocabWord> => {
  const { data, error } = await supabase
    .from('vocab_words')
    .insert([word])
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateWord = async (id: string, updates: Partial<VocabWord>): Promise<VocabWord> => {
  const { data, error } = await supabase
    .from('vocab_words')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteWord = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('vocab_words')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// ============================================
// STUDENTS QUERIES
// ============================================

export const getAllStudents = async (): Promise<VocabStudent[]> => {
  const { data, error } = await supabase
    .from('vocab_students')
    .select('*')
    .order('name');
  
  if (error) throw error;
  return data || [];
};

export const getStudent = async (id: string): Promise<VocabStudent | null> => {
  const { data, error } = await supabase
    .from('vocab_students')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
};

export const addStudent = async (name: string): Promise<VocabStudent> => {
  const { data, error } = await supabase
    .from('vocab_students')
    .insert([{ name }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const updateStudent = async (id: string, updates: Partial<VocabStudent>): Promise<VocabStudent> => {
  const { data, error } = await supabase
    .from('vocab_students')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
};

export const deleteStudent = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('vocab_students')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
};

// ============================================
// STUDENT PROGRESS QUERIES
// ============================================

export const getStudentProgress = async (studentId: string): Promise<VocabStudentProgress | null> => {
  const { data, error } = await supabase
    .from('vocab_student_progress')
    .select('*')
    .eq('student_id', studentId)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
};

export const updateStudentProgress = async (
  studentId: string,
  updates: Partial<VocabStudentProgress>
): Promise<VocabStudentProgress> => {
  // Try to update first, if not found, insert
  const { data: existing } = await supabase
    .from('vocab_student_progress')
    .select('*')
    .eq('student_id', studentId)
    .single();
  
  if (existing) {
    const { data, error } = await supabase
      .from('vocab_student_progress')
      .update(updates)
      .eq('student_id', studentId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from('vocab_student_progress')
      .insert([{ student_id: studentId, ...updates }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
};

export const addPointsToStudent = async (studentId: string, points: number): Promise<VocabStudentProgress> => {
  const progress = await getStudentProgress(studentId);
  const currentPoints = progress?.points || 0;
  return updateStudentProgress(studentId, { points: currentPoints + points });
};

// ============================================
// DAILY QUESTS QUERIES
// ============================================

export const getStudentDailyQuests = async (
  studentId: string,
  date: string = getTodayLondonDate()
): Promise<(VocabDailyQuest & { word: VocabWord })[]> => {
  const { data, error } = await supabase
    .from('vocab_daily_quests')
    .select(`
      *,
      vocab_words:vocab_words (*)
    `)
    .eq('student_id', studentId)
    .eq('quest_date', date);
  
  if (error) throw error;
  
  // Sort by word name
  const sorted = (data || []).sort((a: any, b: any) => {
    const wordA = a.vocab_words?.word || '';
    const wordB = b.vocab_words?.word || '';
    return wordA.localeCompare(wordB);
  });
  
  return sorted.map((dq: any) => ({
    ...dq,
    word: dq.vocab_words
  }));
};

/** Returns a list of quest dates for a student (most recent first), for showing past daily quests. */
export const getStudentDailyQuestDates = async (
  studentId: string,
  limit: number = 60
): Promise<string[]> => {
  const { data, error } = await supabase
    .from('vocab_daily_quests')
    .select('quest_date')
    .eq('student_id', studentId)
    .order('quest_date', { ascending: false })
    .limit(limit * 5); // more rows to get enough unique dates
  if (error) throw error;
  const dates = [...new Set((data || []).map((r: { quest_date: string }) => r.quest_date))].slice(0, limit);
  return dates;
};

export const getDailyQuestWordIds = async (
  studentId: string,
  date: string = getTodayLondonDate()
): Promise<string[]> => {
  const { data, error } = await supabase
    .from('vocab_daily_quests')
    .select('word_id')
    .eq('student_id', studentId)
    .eq('quest_date', date);
  
  if (error) throw error;
  return (data || []).map((dq: any) => dq.word_id);
};

export const assignWordsToDailyQuest = async (
  studentId: string,
  wordIds: string[],
  date: string = getTodayLondonDate()
): Promise<VocabDailyQuest[]> => {
  // First, remove existing quests for this date
  await supabase
    .from('vocab_daily_quests')
    .delete()
    .eq('student_id', studentId)
    .eq('quest_date', date);
  
  // Then insert new quests
  const quests = wordIds.map(wordId => ({
    student_id: studentId,
    word_id: wordId,
    quest_date: date,
    completed: false
  }));
  
  const { data, error } = await supabase
    .from('vocab_daily_quests')
    .insert(quests)
    .select();
  
  if (error) throw error;
  return data || [];
};

export const toggleDailyQuestWord = async (
  studentId: string,
  wordId: string,
  date: string = getTodayLondonDate()
): Promise<void> => {
  // Check if word is already assigned
  const { data: existing } = await supabase
    .from('vocab_daily_quests')
    .select('id')
    .eq('student_id', studentId)
    .eq('word_id', wordId)
    .eq('quest_date', date)
    .single();
  
  if (existing) {
    // Remove it
    const { error } = await supabase
      .from('vocab_daily_quests')
      .delete()
      .eq('id', existing.id);
    
    if (error) throw error;
  } else {
    // Add it
    const { error } = await supabase
      .from('vocab_daily_quests')
      .insert([{
        student_id: studentId,
        word_id: wordId,
        quest_date: date,
        completed: false
      }]);
    
    if (error) throw error;
  }
};

export const markDailyQuestCompleted = async (
  studentId: string,
  wordId: string,
  date: string = getTodayLondonDate()
): Promise<void> => {
  const { error } = await supabase
    .from('vocab_daily_quests')
    .update({
      completed: true,
      completed_at: new Date().toISOString()
    })
    .eq('student_id', studentId)
    .eq('word_id', wordId)
    .eq('quest_date', date);
  
  if (error) throw error;
};

// ============================================
// PRACTICE RECORDS (student history: which day, which words, right/wrong)
// ============================================

export type PracticeActivityType = 'spelling_snake' | 'spelling_bee' | 'flashcard' | 'quiz';

export interface WordPracticeResult {
  wordId: string;
  word: string;
  correct: boolean;
}

/** Save one practice record per word (e.g. after spelling snake or spelling bee). */
export const savePracticeRecords = async (
  studentId: string,
  activityType: PracticeActivityType,
  wordResults: WordPracticeResult[],
  date: string = getTodayLondonDate()
): Promise<void> => {
  if (wordResults.length === 0) return;
  const rows = wordResults.map(({ wordId, word, correct }) => ({
    student_id: studentId,
    word_id: wordId,
    practice_date: date,
    activity_type: activityType,
    correct,
    details: { word }
  }));
  const { error } = await supabase.from('vocab_practice_records').insert(rows);
  if (error) throw error;
};

/** Get practice history for a student, grouped by date (most recent first). */
export const getStudentPracticeHistoryByDate = async (
  studentId: string,
  limitDays: number = 30
): Promise<{ date: string; records: (VocabPracticeRecord & { word: string })[] }[]> => {
  const { data, error } = await supabase
    .from('vocab_practice_records')
    .select('id, word_id, practice_date, activity_type, correct, details')
    .eq('student_id', studentId)
    .order('practice_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  type Row = VocabPracticeRecord & { details?: { word?: string } };
  const list = (data || []) as Row[];
  const byDate = new Map<string, (VocabPracticeRecord & { word: string })[]>();
  for (const r of list) {
    const date = r.practice_date;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date)!.push({
      ...r,
      word: (r.details && typeof r.details === 'object' && 'word' in r.details && r.details.word) || '?'
    });
  }
  const sortedDates = [...byDate.keys()].sort((a, b) => b.localeCompare(a)).slice(0, limitDays);
  return sortedDates.map(date => ({ date, records: byDate.get(date)! }));
};
