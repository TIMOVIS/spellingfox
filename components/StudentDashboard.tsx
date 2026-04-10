import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { WordEntry } from '../types';
import FlashcardQuest from './FlashcardQuest';
import QuizModal from './QuizModal';
import {
  getStudentPracticeHistoryByDate,
  getTodayLondonDate,
  getStudentAssignments,
  markStudentAssignmentComplete,
} from '../lib/supabaseQueries';
import type { PracticeActivityType } from '../lib/supabaseQueries';
import type { VocabStudentAssignment } from '../lib/supabase';
import { formatWordForDisplay } from '../lib/wordDisplay';
import { getWritingExerciseMeta } from '../lib/writingExerciseTypes';
import { supabase } from '../lib/supabase';

interface StudentDashboardProps {
  studentId: string | null;
  name: string;
  wordBank: WordEntry[];
  dailyWordIds: string[];
  onCompleteExercise: (points: number, options?: { wordResults: import('../lib/supabaseQueries').WordPracticeResult[]; activityType: PracticeActivityType }) => void | Promise<void>;
}

type PracticeDay = { date: string; records: { word_id: string; word: string; activity_type: string; correct: boolean }[] };

const StudentDashboard: React.FC<StudentDashboardProps> = ({ studentId, name, wordBank, dailyWordIds, onCompleteExercise }) => {
  const [viewMode, setViewMode] = useState<'hub' | 'wordList' | 'extraWords'>('hub');
  const [activeFlashcard, setActiveFlashcard] = useState<WordEntry | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizWords, setQuizWords] = useState<string[]>([]);
  /** When quiz is opened from flashcard, keep WordEntry(s) so we can save quiz practice to My practice. */
  const [quizWordEntries, setQuizWordEntries] = useState<WordEntry[] | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<PracticeDay[]>([]);
  const [showPracticeHistory, setShowPracticeHistory] = useState(false);
  const [teacherAssignments, setTeacherAssignments] = useState<VocabStudentAssignment[]>([]);
  const [activeAssignment, setActiveAssignment] = useState<VocabStudentAssignment | null>(null);
  const [markingAssignmentDone, setMarkingAssignmentDone] = useState(false);
  /** Filters on "Learn more words" page */
  const [extraYearFilter, setExtraYearFilter] = useState<string>('all');
  const [extraPatternFilter, setExtraPatternFilter] = useState<string>('all');
  const [extraSearch, setExtraSearch] = useState('');
  const [extraWordsPage, setExtraWordsPage] = useState(1);

  const refreshAssignments = useCallback(() => {
    if (!studentId) return;
    getStudentAssignments(studentId)
      .then(setTeacherAssignments)
      .catch(() => setTeacherAssignments([]));
  }, [studentId]);

  useEffect(() => {
    if (!studentId) return;
    getStudentPracticeHistoryByDate(studentId, 30)
      .then(setPracticeHistory)
      .catch(() => setPracticeHistory([]));
    refreshAssignments();
  }, [studentId, refreshAssignments]);

  // Refetch when opening the panel so latest practice is shown
  useEffect(() => {
    if (showPracticeHistory && studentId) {
      getStudentPracticeHistoryByDate(studentId, 30)
        .then(setPracticeHistory)
        .catch(() => setPracticeHistory([]));
    }
  }, [showPracticeHistory, studentId]);

  useEffect(() => {
    if (!studentId) return;
    const t = setInterval(() => refreshAssignments(), 20_000);
    return () => clearInterval(t);
  }, [studentId, refreshAssignments]);

  useEffect(() => {
    if (!studentId) return;
    const channel = supabase
      .channel(`student-assignments-${studentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'vocab_student_assignments',
          filter: `student_id=eq.${studentId}`,
        },
        () => refreshAssignments()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [studentId, refreshAssignments]);

  const LONDON = 'Europe/London';

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long',
      timeZone: LONDON
    }).format(new Date());
  }, []);

  const greeting = useMemo(() => {
    const hour = parseInt(
      new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: LONDON }).format(new Date()),
      10
    );
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const dailyWords = useMemo(() => {
    return wordBank.filter(w => dailyWordIds.includes(w.id));
  }, [wordBank, dailyWordIds]);

  /** Words not in today's quest – for "Learn more words" (able students). */
  const extraWords = useMemo(() => {
    return wordBank.filter(w => !dailyWordIds.includes(w.id));
  }, [wordBank, dailyWordIds]);

  /** Unique year groups and learning points in extra words (for filter dropdowns). */
  const extraYearGroups = useMemo(() => 
    Array.from(new Set(extraWords.map(w => w.yearGroup))).sort(), 
    [extraWords]
  );
  const extraLearningPoints = useMemo(() => 
    Array.from(new Set(extraWords.map(w => w.learningPoint))).sort(), 
    [extraWords]
  );

  /** Filtered extra words (year, pattern, search). */
  const filteredExtraWords = useMemo(() => {
    return extraWords.filter(w => {
      if (extraYearFilter !== 'all' && w.yearGroup !== extraYearFilter) return false;
      if (extraPatternFilter !== 'all' && w.learningPoint !== extraPatternFilter) return false;
      if (extraSearch.trim()) {
        const q = extraSearch.trim().toLowerCase();
        const matchWord = w.word.toLowerCase().includes(q);
        const matchDef = w.definition?.toLowerCase().includes(q);
        const matchPoint = w.learningPoint?.toLowerCase().includes(q);
        const matchRoot = w.root?.toLowerCase().includes(q);
        if (!matchWord && !matchDef && !matchPoint && !matchRoot) return false;
      }
      return true;
    });
  }, [extraWords, extraYearFilter, extraPatternFilter, extraSearch]);

  const WORDS_PER_PAGE = 30;
  const extraTotalPages = Math.max(1, Math.ceil(filteredExtraWords.length / WORDS_PER_PAGE));
  const paginatedExtraWords = useMemo(() => {
    const start = (extraWordsPage - 1) * WORDS_PER_PAGE;
    return filteredExtraWords.slice(start, start + WORDS_PER_PAGE);
  }, [filteredExtraWords, extraWordsPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setExtraWordsPage(1);
  }, [extraYearFilter, extraPatternFilter, extraSearch]);

  // Daily quest progress: flashcard + quiz per word (2 steps each)
  const todayDate = getTodayLondonDate();
  const todayRecords = useMemo(
    () => practiceHistory.find(d => d.date === todayDate)?.records ?? [],
    [practiceHistory, todayDate]
  );
  const totalSlots = dailyWordIds.length * 2;
  const completedSlots = useMemo(() => {
    if (dailyWordIds.length === 0) return 0;
    let n = 0;
    for (const wid of dailyWordIds) {
      if (todayRecords.some(r => r.word_id === wid && r.activity_type === 'flashcard')) n += 1;
      if (todayRecords.some(r => r.word_id === wid && r.activity_type === 'quiz')) n += 1;
    }
    return n;
  }, [dailyWordIds, todayRecords]);
  const progressPercent = totalSlots === 0 ? 0 : Math.round((completedSlots / totalSlots) * 100);
  const flashcardsDone = dailyWords.length > 0 && dailyWordIds.every(wid => todayRecords.some(r => r.word_id === wid && r.activity_type === 'flashcard'));
  const quizzesDone = dailyWords.length > 0 && dailyWordIds.every(wid => todayRecords.some(r => r.word_id === wid && r.activity_type === 'quiz'));
  const dailyQuestComplete = flashcardsDone && quizzesDone;

  const incompleteTeacherAssignments = useMemo(
    () => teacherAssignments.filter(a => !a.completed_at),
    [teacherAssignments]
  );

  const handleMasterWord = (word: WordEntry) => {
    setActiveFlashcard(word);
  };

  const handleQuizFromFlashcard = (word: WordEntry) => {
    setQuizWords([word.word]);
    setQuizWordEntries([word]);
    setActiveFlashcard(null);
    setShowQuiz(true);
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
      {viewMode === 'hub' ? (
        <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border-8 border-orange-100 flex flex-col">
          {/* Top Date Section */}
          <div className="bg-orange-500 p-10 text-center text-white relative">
            <span className="bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border border-white/30 mb-4 inline-block">
              {formattedDate}
            </span>
            <h1 className="text-4xl font-black tracking-tight mt-2 leading-tight">
              {greeting}, {name}! 🦊
            </h1>
            <p className="text-orange-100 font-bold mt-2 opacity-90">One daily quest: learn today&apos;s words, then try teacher extras.</p>
            
            {/* Background Fox Icon */}
            <div className="absolute -bottom-6 -right-6 text-9xl opacity-10 rotate-12 pointer-events-none select-none">
              🦊
            </div>
          </div>

          <div className="p-10 space-y-8 bg-white">
            {/* Progress Section — linked to the 4 to-dos; details in My practice */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Daily Progress</span>
                <button
                  type="button"
                  onClick={() => setShowPracticeHistory(true)}
                  className="text-sm font-black text-orange-600 hover:text-orange-700 underline underline-offset-2"
                >
                  {progressPercent}% Complete · My practice
                </button>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden p-1 border border-gray-100">
                <div 
                  className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(251,146,60,0.4)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                <span className={flashcardsDone ? 'text-emerald-600' : 'text-gray-400'}>
                  {flashcardsDone ? '✓' : '○'} Flashcards (all words)
                </span>
                <span className={quizzesDone ? 'text-emerald-600' : 'text-gray-400'}>
                  {quizzesDone ? '✓' : '○'} Quizzes (all words)
                </span>
                {dailyQuestComplete && (
                  <span className="text-emerald-600">✓ Daily quest complete</span>
                )}
              </div>
            </div>

            {/* Main actions */}
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => setViewMode('wordList')}
                disabled={dailyWords.length === 0}
                className="group relative bg-indigo-600 hover:bg-indigo-700 text-white p-8 rounded-[2rem] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl border-b-8 border-indigo-900 overflow-hidden disabled:opacity-50 disabled:pointer-events-none disabled:grayscale"
              >
                <div className="relative z-10 flex items-center justify-between">
                  <div className="text-left">
                    <span className="block text-3xl font-black">Daily quest</span>
                    <span className="block text-sm font-bold text-indigo-200 mt-2 max-w-md">
                      Learn each word with flashcards, then take the quiz for every word.
                      {dailyWords.length > 0 && ` (${dailyWords.length} word${dailyWords.length !== 1 ? 's' : ''})`}
                    </span>
                  </div>
                  <span className="text-5xl group-hover:translate-x-2 transition-transform">🎯</span>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform"></div>
              </button>

              {incompleteTeacherAssignments.length > 0 && (
                <div className="rounded-[2rem] border-4 border-sky-100 bg-sky-50/80 p-6 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-sky-800 uppercase tracking-widest">From your teacher</span>
                    <span className="text-xs font-black bg-sky-200 text-sky-900 px-2 py-1 rounded-lg">
                      {incompleteTeacherAssignments.length} to do
                    </span>
                  </div>
                  <p className="text-sm text-sky-900/80 font-medium">
                    Your teacher picked these writing tasks for you. Open one, work on paper, then tap done.
                  </p>
                  <ul className="space-y-2">
                    {incompleteTeacherAssignments.map(a => {
                      const meta = a.exercise_type ? getWritingExerciseMeta(a.exercise_type) : undefined;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => setActiveAssignment(a)}
                            className="w-full text-left bg-white hover:bg-sky-100 border-2 border-sky-200 rounded-2xl px-5 py-4 font-black text-sky-950 shadow-sm transition-colors flex items-center justify-between gap-2"
                          >
                            <span>{meta?.label ?? a.title}</span>
                            <span className="text-xl shrink-0">📋</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {studentId && incompleteTeacherAssignments.length === 0 && teacherAssignments.length > 0 && (
                <p className="text-center text-sm font-bold text-sky-700/80">
                  You&apos;re up to date on teacher exercises. Nice work!
                </p>
              )}

              {extraWords.length > 0 && (
                <button 
                  onClick={() => setViewMode('extraWords')}
                  className="group relative bg-violet-100 hover:bg-violet-200 text-violet-800 p-6 rounded-[2rem] transition-all hover:scale-[1.01] active:scale-[0.99] shadow border-2 border-violet-200 overflow-hidden"
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="text-left">
                      <span className="block text-xl font-black mb-0.5">Learn more words</span>
                      <span className="text-violet-600/80 font-bold text-xs">Explore {extraWords.length} extra word{extraWords.length !== 1 ? 's' : ''} on your own</span>
                    </div>
                    <span className="text-3xl">📚</span>
                  </div>
                </button>
              )}

              {studentId && (
                <button 
                  onClick={() => setShowPracticeHistory(true)}
                  className="group relative bg-gray-100 hover:bg-gray-200 text-gray-700 p-6 rounded-[2rem] transition-all hover:scale-[1.01] active:scale-[0.99] shadow border border-gray-200 overflow-hidden"
                >
                  <div className="relative z-10 flex items-center justify-between">
                    <div className="text-left">
                      <span className="block text-xl font-black mb-0.5">My practice</span>
                      <span className="text-gray-500 font-bold text-xs">See which words you practiced and what was right or wrong</span>
                    </div>
                    <span className="text-3xl">📋</span>
                  </div>
                </button>
              )}
            </div>
          </div>
          
          <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">Curriculum words provided by your teacher</p>
          </div>
        </div>
      ) : viewMode === 'wordList' ? (
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => setViewMode('hub')}
              className="bg-white border-2 border-gray-200 text-gray-500 px-6 py-3 rounded-2xl font-black hover:bg-gray-50 flex items-center gap-2 active:scale-95 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
              </svg>
              BACK TO HUB
            </button>
            <h2 className="text-2xl font-black text-indigo-900 tracking-tight">Today&apos;s daily quest 📝</h2>
          </div>

          <div className="space-y-4">
            {dailyWords.length > 0 ? (
              dailyWords.map((word) => (
                <div key={word.id} className="bg-white p-6 rounded-[2rem] shadow-md border-2 border-indigo-50 flex items-center justify-between group hover:border-indigo-200 transition-all">
                  <div className="flex flex-col">
                    <span className="text-2xl font-black text-gray-900 tracking-tight">{formatWordForDisplay(word.word)}</span>
                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{word.learningPoint}</span>
                  </div>
                  <button 
                    onClick={() => handleMasterWord(word)}
                    className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-black shadow-md hover:bg-indigo-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <span>MASTER</span>
                    <span className="text-xl">🚀</span>
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-20 bg-white rounded-[3rem] border-4 border-dashed border-gray-100">
                <span className="text-6xl block mb-4">🎈</span>
                <p className="text-gray-400 font-black">No words set for today yet!</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Learn more words (extra words not in today's quest) */
        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between mb-8">
            <button 
              onClick={() => setViewMode('hub')}
              className="bg-white border-2 border-gray-200 text-gray-500 px-6 py-3 rounded-2xl font-black hover:bg-gray-50 flex items-center gap-2 active:scale-95 transition-all shadow-sm"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7" />
              </svg>
              BACK TO HUB
            </button>
            <h2 className="text-2xl font-black text-violet-900 tracking-tight">Learn more words 📚</h2>
          </div>

          <p className="text-violet-700/90 font-medium text-sm">Explore words from the curriculum. Filter by year or pattern, or search. Tap <strong>Learn</strong> to see the word, meaning, and examples.</p>

          {/* Filters */}
          <div className="bg-white rounded-2xl border-2 border-violet-100 p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black text-violet-600 uppercase tracking-widest shrink-0">Filters</span>
              {(extraYearFilter !== 'all' || extraPatternFilter !== 'all' || extraSearch.trim()) && (
                <button
                  onClick={() => { setExtraYearFilter('all'); setExtraPatternFilter('all'); setExtraSearch(''); }}
                  className="text-violet-600 hover:text-violet-800 font-bold text-sm"
                >
                  Clear all
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Search words..."
                value={extraSearch}
                onChange={(e) => setExtraSearch(e.target.value)}
                className="bg-gray-50 border-2 border-violet-100 rounded-xl px-4 py-2.5 font-medium text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none text-sm sm:col-span-2"
              />
              <select
                value={extraYearFilter}
                onChange={(e) => setExtraYearFilter(e.target.value)}
                className="bg-gray-50 border-2 border-violet-100 rounded-xl px-4 py-2.5 font-bold text-gray-900 text-sm cursor-pointer focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none"
              >
                <option value="all">All year groups</option>
                {extraYearGroups.map(yg => (
                  <option key={yg} value={yg}>{yg}</option>
                ))}
              </select>
              <select
                value={extraPatternFilter}
                onChange={(e) => setExtraPatternFilter(e.target.value)}
                className="bg-gray-50 border-2 border-violet-100 rounded-xl px-4 py-2.5 font-bold text-gray-900 text-sm cursor-pointer focus:ring-2 focus:ring-violet-400 focus:border-violet-400 outline-none sm:col-span-2"
              >
                <option value="all">All patterns</option>
                {extraLearningPoints.map(lp => (
                  <option key={lp} value={lp}>{lp}</option>
                ))}
              </select>
              <span className="text-xs font-bold text-violet-600 self-center">
                {filteredExtraWords.length} word{filteredExtraWords.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {filteredExtraWords.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-[2rem] border-2 border-dashed border-violet-100">
                <span className="text-5xl block mb-3">🔍</span>
                <p className="text-violet-700 font-black">No words match your filters</p>
                <p className="text-violet-500 text-sm mt-1">Try a different year, pattern, or search.</p>
                <button
                  onClick={() => { setExtraYearFilter('all'); setExtraPatternFilter('all'); setExtraSearch(''); }}
                  className="mt-4 bg-violet-100 text-violet-700 px-5 py-2 rounded-xl font-bold text-sm hover:bg-violet-200 transition-colors"
                >
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                {paginatedExtraWords.map((word) => (
                  <div key={word.id} className="bg-white p-6 rounded-[2rem] shadow-md border-2 border-violet-50 flex items-center justify-between group hover:border-violet-200 transition-all">
                    <div className="flex flex-col min-w-0">
                      <span className="text-2xl font-black text-gray-900 tracking-tight">{formatWordForDisplay(word.word)}</span>
                      <span className="text-[10px] font-black text-violet-500 uppercase tracking-widest">{word.learningPoint}</span>
                    </div>
                    <button 
                      onClick={() => handleMasterWord(word)}
                      className="bg-violet-600 text-white px-8 py-3 rounded-xl font-black shadow-md hover:bg-violet-700 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shrink-0"
                    >
                      <span>LEARN</span>
                      <span className="text-xl">🚀</span>
                    </button>
                  </div>
                ))}
                {extraTotalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 pt-4 pb-2">
                    <button
                      onClick={() => setExtraWordsPage(p => Math.max(1, p - 1))}
                      disabled={extraWordsPage <= 1}
                      className="bg-violet-100 text-violet-700 px-5 py-2.5 rounded-xl font-black text-sm hover:bg-violet-200 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      Previous
                    </button>
                    <span className="text-sm font-bold text-violet-800">
                      Page {extraWordsPage} of {extraTotalPages}
                    </span>
                    <button
                      onClick={() => setExtraWordsPage(p => Math.min(extraTotalPages, p + 1))}
                      disabled={extraWordsPage >= extraTotalPages}
                      className="bg-violet-100 text-violet-700 px-5 py-2.5 rounded-xl font-black text-sm hover:bg-violet-200 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {activeFlashcard && (
        <FlashcardQuest
          word={activeFlashcard}
          onClose={() => setActiveFlashcard(null)}
          onStartQuiz={handleQuizFromFlashcard}
          onWordViewed={(word) => {
            onCompleteExercise(0, {
              wordResults: [{ wordId: word.id, word: word.word, correct: true }],
              activityType: 'flashcard'
            }).then(() => {
              if (studentId) getStudentPracticeHistoryByDate(studentId, 30).then(setPracticeHistory).catch(() => {});
            });
          }}
        />
      )}

      {showQuiz && (
        <QuizModal 
          words={quizWords}
          onClose={() => {
            setShowQuiz(false);
            setQuizWordEntries(null);
          }}
          onFinish={async (pts, hadMistake = false) => {
            const opts = quizWordEntries?.length
              ? { wordResults: quizWordEntries.map(w => ({ wordId: w.id, word: w.word, correct: !hadMistake })), activityType: 'quiz' as const }
              : undefined;
            try {
              await Promise.resolve(onCompleteExercise(pts, opts));
              if (studentId) {
                const history = await getStudentPracticeHistoryByDate(studentId, 30);
                setPracticeHistory(history);
              }
            } catch (e) {
              console.error('Save practice failed:', e);
            }
            setShowQuiz(false);
            setQuizWordEntries(null);
          }}
        />
      )}

      {activeAssignment && (
        <div className="fixed inset-0 bg-sky-950/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full max-h-[88vh] overflow-hidden flex flex-col border-4 border-sky-200 shadow-2xl">
            <div className="p-5 border-b border-sky-100 flex justify-between items-start gap-2 shrink-0">
              <h2 className="text-xl font-black text-sky-950 leading-tight pr-2">
                {activeAssignment.exercise_type
                  ? getWritingExerciseMeta(activeAssignment.exercise_type)?.label ?? activeAssignment.title
                  : activeAssignment.title}
              </h2>
              <button
                type="button"
                onClick={() => setActiveAssignment(null)}
                className="p-2 hover:bg-sky-100 rounded-xl shrink-0"
                aria-label="Close"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 min-h-0 space-y-4">
              <p className="text-sm font-bold text-gray-800 whitespace-pre-wrap">{activeAssignment.student_instructions}</p>
              <div className="bg-sky-50 rounded-2xl p-4 border border-sky-100">
                <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">{activeAssignment.main_content}</p>
              </div>
              {activeAssignment.options && activeAssignment.options.length > 0 && (
                <ol className="list-decimal list-inside space-y-1 text-sm font-bold text-gray-800">
                  {activeAssignment.options.map((o, i) => (
                    <li key={i}>{o}</li>
                  ))}
                </ol>
              )}
            </div>
            <div className="p-5 border-t border-sky-100 shrink-0">
              <button
                type="button"
                disabled={markingAssignmentDone}
                onClick={async () => {
                  setMarkingAssignmentDone(true);
                  try {
                    await markStudentAssignmentComplete(activeAssignment.id);
                    refreshAssignments();
                    setActiveAssignment(null);
                  } catch (e) {
                    console.error('Mark assignment complete failed:', e);
                  } finally {
                    setMarkingAssignmentDone(false);
                  }
                }}
                className="w-full bg-emerald-600 text-white py-3.5 rounded-2xl font-black hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                {markingAssignmentDone ? 'Saving…' : "I've finished this"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Practice history overlay */}
      {showPracticeHistory && (
        <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col border-4 border-amber-200 overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-amber-100 flex justify-between items-center shrink-0">
              <h2 className="text-xl font-black text-amber-950">My practice</h2>
              <button onClick={() => setShowPracticeHistory(false)} className="p-2 hover:bg-amber-100 rounded-xl transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0">
              {practiceHistory.length === 0 ? (
                <p className="text-gray-500 font-bold text-center py-8">No practice recorded yet. Complete your daily quest flashcards and quizzes to see your history here.</p>
              ) : (
                <ul className="space-y-6">
                  {practiceHistory.map(({ date, records }) => {
                    // Group records by word so we show each word once with its activities
                    const byWord = new Map<string, { word: string; attempts: { activity_type: string; correct: boolean }[] }>();
                    for (const r of records) {
                      const key = r.word_id;
                      if (!byWord.has(key)) byWord.set(key, { word: r.word, attempts: [] });
                      byWord.get(key)!.attempts.push({ activity_type: r.activity_type, correct: r.correct });
                    }
                    const words = Array.from(byWord.entries());
                    return (
                      <li key={date}>
                        <div className="text-sm font-black text-amber-600 uppercase tracking-widest mb-3">
                          {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <ul className="space-y-3">
                          {words.map(([wordId, { word, attempts }]) => (
                            <li key={wordId} className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                              <div className="font-bold text-amber-950 mb-1.5">{formatWordForDisplay(word)}</div>
                              <div className="flex flex-wrap gap-2">
                                {attempts.map((a, i) => (
                                  <span
                                    key={`${wordId}-${i}`}
                                    className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                      a.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {a.activity_type === 'spelling_snake'
                                      ? 'Word building'
                                      : a.activity_type === 'spelling_bee'
                                        ? 'Bee'
                                        : a.activity_type === 'disappearing_letters'
                                          ? 'Disappearing letters'
                                          : a.activity_type === 'sentence_ninja'
                                            ? 'Sentence Ninja'
                                            : a.activity_type === 'flashcard'
                                              ? 'Flashcard'
                                              : a.activity_type === 'quiz'
                                                ? 'Quiz'
                                                : a.activity_type}{' '}
                                    {a.correct ? '✓' : '✗'}
                                  </span>
                                ))}
                              </div>
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentDashboard;
