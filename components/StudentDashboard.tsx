
import React, { useState, useMemo } from 'react';
import { WordEntry } from '../types';
import SpellingModal from './SpellingModal';
import SpellingBeeModal from './SpellingBeeModal';
import FlashcardQuest from './FlashcardQuest';
import QuizModal from './QuizModal';

interface StudentDashboardProps {
  name: string;
  wordBank: WordEntry[];
  dailyWordIds: string[];
  onCompleteExercise: (points: number) => void;
}

const StudentDashboard: React.FC<StudentDashboardProps> = ({ name, wordBank, dailyWordIds, onCompleteExercise }) => {
  const [viewMode, setViewMode] = useState<'hub' | 'wordList'>('hub');
  const [showSpelling, setShowSpelling] = useState(false);
  const [showSpellingBee, setShowSpellingBee] = useState(false);
  const [activeFlashcard, setActiveFlashcard] = useState<WordEntry | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizWords, setQuizWords] = useState<string[]>([]);

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

  // Mock progress based on current session points for visual feedback
  const progressPercent = Math.min(100, (dailyWords.length > 0 ? 60 : 0)); 

  const handleStartSpellingOnly = () => {
    if (dailyWords.length > 0) {
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
                    <span className="block text-3xl font-black mb-1">Daily Quest</span>
                    <span className="text-indigo-200 font-bold">Learn & Master {dailyWords.length} Words</span>
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
                    <span className="block text-3xl font-black mb-1">Spelling Only</span>
                    <span className="text-orange-600/70 font-bold uppercase tracking-widest text-xs">Jump straight to the game</span>
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
                    <span className="block text-3xl font-black mb-1">Spelling Bee</span>
                    <span className="text-amber-600/70 font-bold uppercase tracking-widest text-xs">Say the letters out loud</span>
                  </div>
                  <span className="text-5xl group-hover:scale-110 transition-transform">🐝</span>
                </div>
              </button>
            </div>
          </div>
          
          <div className="bg-gray-50 p-6 text-center border-t border-gray-100">
            <p className="text-gray-400 text-[10px] font-black uppercase tracking-[0.2em]">Curriculum words provided by your teacher</p>
          </div>
        </div>
      ) : (
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
      )}

      {/* Modals */}
      {showSpelling && (
        <SpellingModal 
          wordEntries={dailyWords}
          onClose={() => setShowSpelling(false)}
          onFinish={(pts) => {
            onCompleteExercise(pts);
            setShowSpelling(false);
          }}
        />
      )}

      {showSpellingBee && (
        <SpellingBeeModal 
          wordEntries={dailyWords}
          onClose={() => setShowSpellingBee(false)}
          onFinish={(pts) => {
            onCompleteExercise(pts);
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
    </div>
  );
};

export default StudentDashboard;
