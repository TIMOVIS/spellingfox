import React, { useState, useMemo, useEffect } from 'react';
import { WordEntry } from '../types';
import SpellingModal from './SpellingModal';
import SpellingBeeModal from './SpellingBeeModal';
import FlashcardQuest from './FlashcardQuest';
import QuizModal from './QuizModal';
import { getStudentPracticeHistoryByDate } from '../lib/supabaseQueries';
import type { PracticeActivityType } from '../lib/supabaseQueries';

interface StudentDashboardProps {
  studentId: string | null;
  name: string;
  wordBank: WordEntry[];
  dailyWordIds: string[];
  onCompleteExercise: (points: number, options?: { wordResults: import('../lib/supabaseQueries').WordPracticeResult[]; activityType: PracticeActivityType }) => void;
}

type PracticeDay = { date: string; records: { word: string; activity_type: string; correct: boolean }[] };

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

  // Mock progress based on current session points for visual feedback
  const progressPercent = Math.min(100, (dailyWords.length > 0 ? 60 : 0)); 

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
            {/* Progress Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-end">
                <span className="text-sm font-black text-gray-400 uppercase tracking-widest">Daily Progress</span>
                <span className="text-sm font-black text-orange-600">60% Complete</span>
              </div>
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden p-1 border border-gray-100">
                <div 
                  className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(251,146,60,0.4)]"
                  style={{ width: `${progressPercent}%` }}
                />
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
                    <span className="block text-3xl font-black">To do 2: Spelling Snake</span>
                  </div>
                  <span className="text-5xl group-hover:rotate-12 transition-transform">🐍</span>
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

          <p className="text-violet-700/90 font-medium text-sm">Explore these words from the curriculum on your own. Tap <strong>Learn</strong> to see the word, meaning, and examples.</p>

          <div className="space-y-4">
            {extraWords.map((word) => (
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
          </div>
        </div>
      )}

      {/* Modals */}
      {showSpelling && (
        <SpellingModal 
          wordEntries={wordsForSpelling.length > 0 ? wordsForSpelling : dailyWords}
          onClose={() => setShowSpelling(false)}
          onFinish={(pts, wordResults) => {
            onCompleteExercise(pts, wordResults?.length ? { wordResults, activityType: 'spelling_snake' } : undefined);
            setShowSpelling(false);
          }}
        />
      )}

      {showSpellingBee && (
        <SpellingBeeModal 
          wordEntries={dailyWords}
          onClose={() => setShowSpellingBee(false)}
          onFinish={(pts, wordResults) => {
            onCompleteExercise(pts, wordResults?.length ? { wordResults, activityType: 'spelling_bee' } : undefined);
            setShowSpellingBee(false);
          }}
        />
      )}

      {activeFlashcard && (
        <FlashcardQuest 
          word={activeFlashcard}
          onClose={() => setActiveFlashcard(null)}
          onStartQuiz={handleQuizFromFlashcard}
          onStartSpelling={handleSpellingFromFlashcard}
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
                  {practiceHistory.map(({ date, records }) => (
                    <li key={date}>
                      <div className="text-sm font-black text-amber-600 uppercase tracking-widest mb-2">
                        {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <ul className="space-y-1.5">
                        {records.map((r, i) => (
                          <li key={`${date}-${i}`} className="flex items-center gap-2 text-gray-900">
                            <span className={r.correct ? 'text-emerald-500' : 'text-red-500'}>{r.correct ? '✓' : '✗'}</span>
                            <span className="font-bold">{r.word}</span>
                            <span className="text-xs text-gray-400">
                              {r.activity_type === 'spelling_snake' ? 'Snake' : r.activity_type === 'spelling_bee' ? 'Bee' : r.activity_type}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
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
