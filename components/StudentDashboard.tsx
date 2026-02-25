import React, { useState, useMemo, useEffect } from 'react';
import { WordEntry } from '../types';
import SpellingModal from './SpellingModal';
import SpellingBeeModal from './SpellingBeeModal';
import FlashcardQuest from './FlashcardQuest';
import QuizModal from './QuizModal';
import { getStudentPracticeHistoryByDate, getTodayLondonDate } from '../lib/supabaseQueries';
import type { PracticeActivityType } from '../lib/supabaseQueries';

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
  const [showSpelling, setShowSpelling] = useState(false);
  const [showSpellingBee, setShowSpellingBee] = useState(false);
  const [activeFlashcard, setActiveFlashcard] = useState<WordEntry | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizWords, setQuizWords] = useState<string[]>([]);
  const [practiceHistory, setPracticeHistory] = useState<PracticeDay[]>([]);
  const [showPracticeHistory, setShowPracticeHistory] = useState(false);
  /** Words to use in Spelling modal (daily quest or single word from flashcard/extra). */
  const [wordsForSpelling, setWordsForSpelling] = useState<WordEntry[]>([]);
  /** When set, Spelling Bee uses these words (e.g. single word from flashcard); otherwise dailyWords. */
  const [spellingBeeWordEntries, setSpellingBeeWordEntries] = useState<WordEntry[] | null>(null);
  /** Filters on "Learn more words" page */
  const [extraYearFilter, setExtraYearFilter] = useState<string>('all');
  const [extraPatternFilter, setExtraPatternFilter] = useState<string>('all');
  const [extraSearch, setExtraSearch] = useState('');
  const [extraWordsPage, setExtraWordsPage] = useState(1);

  useEffect(() => {
    if (!studentId) return;
    getStudentPracticeHistoryByDate(studentId, 30)
      .then(setPracticeHistory)
      .catch(() => setPracticeHistory([]));
  }, [studentId]);

  // Refetch when opening the panel so latest practice is shown
  useEffect(() => {
    if (showPracticeHistory && studentId) {
      getStudentPracticeHistoryByDate(studentId, 30)
        .then(setPracticeHistory)
        .catch(() => setPracticeHistory([]));
    }
  }, [showPracticeHistory, studentId]);

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

  // Daily progress = (word × to-do) slots: each word has 3 slots (Daily Quest, Snake, Bee); progress = completed slots / total slots
  const todayDate = getTodayLondonDate();
  const todayRecords = useMemo(
    () => practiceHistory.find(d => d.date === todayDate)?.records ?? [],
    [practiceHistory, todayDate]
  );
  const totalSlots = dailyWordIds.length * 3; // 3 activities per word
  const completedSlots = useMemo(() => {
    if (dailyWordIds.length === 0) return 0;
    let n = 0;
    for (const wid of dailyWordIds) {
      if (todayRecords.some(r => r.word_id === wid && r.activity_type === 'flashcard')) n += 1;
      if (todayRecords.some(r => r.word_id === wid && r.activity_type === 'spelling_snake')) n += 1;
      if (todayRecords.some(r => r.word_id === wid && r.activity_type === 'spelling_bee')) n += 1;
    }
    return n;
  }, [dailyWordIds, todayRecords]);
  const progressPercent = totalSlots === 0 ? 0 : Math.round((completedSlots / totalSlots) * 100);
  // To-do “fully done” when every daily word has that activity (for checkmarks)
  const dailyQuestDone = dailyWords.length > 0 && dailyWordIds.every(wid => todayRecords.some(r => r.word_id === wid && r.activity_type === 'flashcard'));
  const spellingSnakeDone = dailyWords.length > 0 && dailyWordIds.every(wid => todayRecords.some(r => r.word_id === wid && r.activity_type === 'spelling_snake'));
  const spellingBeeDone = dailyWords.length > 0 && dailyWordIds.every(wid => todayRecords.some(r => r.word_id === wid && r.activity_type === 'spelling_bee')); 

  const handleStartSpellingOnly = () => {
    if (dailyWords.length > 0) {
      setWordsForSpelling(dailyWords);
      setShowSpelling(true);
    }
  };

  const handleMasterWord = (word: WordEntry) => {
    setActiveFlashcard(word);
  };

  const handleQuizFromFlashcard = (word: WordEntry) => {
    setQuizWords([word.word]);
    setActiveFlashcard(null);
    setShowQuiz(true);
  };

  const handleSpellingFromFlashcard = (word: WordEntry) => {
    setWordsForSpelling([word]);
    setActiveFlashcard(null);
    setShowSpelling(true);
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
            <p className="text-orange-100 font-bold mt-2 opacity-90">Ready for your 5-minute quest?</p>
            
            {/* Background Fox Icon */}
            <div className="absolute -bottom-6 -right-6 text-9xl opacity-10 rotate-12 pointer-events-none select-none">
              🦊
            </div>
          </div>

          <div className="p-10 space-y-8 bg-white">
            {/* Progress Section — linked to the 3 to-dos; details in My practice */}
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
                <span className={dailyQuestDone ? 'text-emerald-600' : 'text-gray-400'}>
                  {dailyQuestDone ? '✓' : '○'} Daily Quest
                </span>
                <span className={spellingSnakeDone ? 'text-emerald-600' : 'text-gray-400'}>
                  {spellingSnakeDone ? '✓' : '○'} Snake
                </span>
                <span className={spellingBeeDone ? 'text-emerald-600' : 'text-gray-400'}>
                  {spellingBeeDone ? '✓' : '○'} Bee
                </span>
              </div>
            </div>

            {/* Main Buttons */}
            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => setViewMode('wordList')}
                className="group relative bg-indigo-600 hover:bg-indigo-700 text-white p-8 rounded-[2rem] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-xl border-b-8 border-indigo-900 overflow-hidden"
              >
                <div className="relative z-10 flex items-center justify-between">
                  <div className="text-left">
                    <span className="block text-3xl font-black">To do 1: Daily Quest</span>
                  </div>
                  <span className="text-5xl group-hover:translate-x-2 transition-transform">🎯</span>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 group-hover:scale-150 transition-transform"></div>
              </button>

              <button 
                onClick={handleStartSpellingOnly}
                className="group relative bg-orange-100 hover:bg-orange-200 text-orange-700 p-8 rounded-[2rem] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg border-2 border-orange-200 overflow-hidden"
              >
                <div className="relative z-10 flex items-center justify-between">
                  <div className="text-left">
                    <span className="block text-3xl font-black">To do 2: Word building</span>
                  </div>
                  <span className="text-5xl group-hover:rotate-12 transition-transform">🧩</span>
                </div>
              </button>

              <button 
                onClick={() => dailyWords.length > 0 && setShowSpellingBee(true)}
                disabled={dailyWords.length === 0}
                className="group relative bg-amber-100 hover:bg-amber-200 text-amber-800 p-8 rounded-[2rem] transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg border-2 border-amber-200 overflow-hidden disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="relative z-10 flex items-center justify-between">
                  <div className="text-left">
                    <span className="block text-3xl font-black">To do 3: Spelling Bee</span>
                  </div>
                  <span className="text-5xl group-hover:scale-110 transition-transform">🐝</span>
                </div>
              </button>

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
            <h2 className="text-2xl font-black text-indigo-900 tracking-tight">Today's List 📝</h2>
          </div>

          <div className="space-y-4">
            {dailyWords.length > 0 ? (
              dailyWords.map((word) => (
                <div key={word.id} className="bg-white p-6 rounded-[2rem] shadow-md border-2 border-indigo-50 flex items-center justify-between group hover:border-indigo-200 transition-all">
                  <div className="flex flex-col">
                    <span className="text-2xl font-black text-gray-900 tracking-tight">{word.word}</span>
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
                      <span className="text-2xl font-black text-gray-900 tracking-tight">{word.word}</span>
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
      {showSpelling && (
        <SpellingModal 
          wordEntries={wordsForSpelling.length > 0 ? wordsForSpelling : dailyWords}
          onClose={() => setShowSpelling(false)}
          onFinish={(pts, wordResults) => {
            const opts = wordResults?.length ? { wordResults, activityType: 'spelling_snake' as const } : undefined;
            Promise.resolve(onCompleteExercise(pts, opts)).then(() => {
              if (studentId) getStudentPracticeHistoryByDate(studentId, 30).then(setPracticeHistory).catch(() => {});
            });
            setShowSpelling(false);
          }}
        />
      )}

      {showSpellingBee && (
        <SpellingBeeModal 
          wordEntries={spellingBeeWordEntries ?? dailyWords}
          onClose={() => {
            setShowSpellingBee(false);
            setSpellingBeeWordEntries(null);
          }}
          onFinish={(pts, wordResults) => {
            const opts = wordResults?.length ? { wordResults, activityType: 'spelling_bee' as const } : undefined;
            Promise.resolve(onCompleteExercise(pts, opts)).then(() => {
              if (studentId) getStudentPracticeHistoryByDate(studentId, 30).then(setPracticeHistory).catch(() => {});
            });
            setShowSpellingBee(false);
            setSpellingBeeWordEntries(null);
          }}
        />
      )}

      {activeFlashcard && (
        <FlashcardQuest
          word={activeFlashcard}
          onClose={() => setActiveFlashcard(null)}
          onStartQuiz={handleQuizFromFlashcard}
          onStartSpelling={handleSpellingFromFlashcard}
          onStartSpellingBee={(word) => {
            setSpellingBeeWordEntries([word]);
            setActiveFlashcard(null);
            setShowSpellingBee(true);
          }}
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
          onClose={() => setShowQuiz(false)}
          onFinish={(pts) => {
            onCompleteExercise(pts);
            setShowQuiz(false);
          }}
        />
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
                <p className="text-gray-500 font-bold text-center py-8">No practice recorded yet. Complete Spelling Snake or Spelling Bee to see your history here.</p>
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
                              <div className="font-bold text-amber-950 mb-1.5">{word}</div>
                              <div className="flex flex-wrap gap-2">
                                {attempts.map((a, i) => (
                                  <span
                                    key={`${wordId}-${i}`}
                                    className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                      a.correct ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                                    }`}
                                  >
                                    {a.activity_type === 'spelling_snake' ? 'Snake' : a.activity_type === 'spelling_bee' ? 'Bee' : a.activity_type === 'flashcard' ? 'Flashcard' : a.activity_type}{' '}
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
