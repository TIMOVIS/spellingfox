
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordEntry } from '../types';
import { speakText } from '../geminiService';
import type { WordPracticeResult } from '../lib/supabaseQueries';

interface SpellingBeeModalProps {
  wordEntries: WordEntry[];
  onClose: () => void;
  onFinish: (points: number, wordResults?: WordPracticeResult[]) => void;
}

const SpellingBeeModal: React.FC<SpellingBeeModalProps> = ({ wordEntries, onClose, onFinish }) => {
  const [queue, setQueue] = useState<WordEntry[]>(() => [...wordEntries]);
  const [hadMistakeOnCurrentWord, setHadMistakeOnCurrentWord] = useState(false);
  const [advanceCounter, setAdvanceCounter] = useState(0);

  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'preview' | 'typing' | 'feedback' | 'starting'>(
    wordEntries.length > 0 ? 'preview' : 'starting'
  );
  /** Each slot: the letter the student typed and whether it was correct (green) or wrong (red). */
  const [typedLetters, setTypedLetters] = useState<Array<{ letter: string; correct: boolean }>>([]);
  const [isShaking, setIsShaking] = useState(false);
  /** Accumulated results for each completed word (for practice history). */
  const [wordResults, setWordResults] = useState<WordPracticeResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const currentWord = queue[0];
  const targetLetters = currentWord ? currentWord.word.toUpperCase().split('') : [];
  const nextLetterIndex = typedLetters.length;

  const handleSpeakWord = useCallback(async () => {
    if (!currentWord) return;
    await speakText(`${currentWord.word}... ${currentWord.word}`);
  }, [currentWord]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement> | KeyboardEvent) => {
      if (gameState !== 'typing' || !currentWord) return;
      if (typedLetters.length >= targetLetters.length) return;

      const key = e.key?.toUpperCase();
      if (key.length !== 1 || key < 'A' || key > 'Z') return;

      e.preventDefault();

      const expected = targetLetters[typedLetters.length];
      const correct = key === expected;

      setTypedLetters(prev => {
        const next = [...prev, { letter: key, correct }];
        if (next.length === targetLetters.length) {
          setGameState('feedback');
          if (next.every(t => t.correct)) setScore(s => s + 200);
        }
        return next;
      });
      if (correct) {
        setScore(s => s + 10);
      } else {
        setHadMistakeOnCurrentWord(true);
        setIsShaking(true);
        setScore(s => Math.max(0, s - 10));
        setTimeout(() => setIsShaking(false), 500);
      }
    },
    [gameState, currentWord, targetLetters, typedLetters.length]
  );

  const resetLevel = useCallback(() => {
    if (!currentWord) return;
    setTypedLetters([]);
    setGameState('preview');
  }, [currentWord]);

  useEffect(() => {
    if (currentWord) resetLevel();
  }, [advanceCounter, resetLevel]);

  // Focus the hidden input when in typing state (so mobile keyboard appears)
  useEffect(() => {
    if (gameState === 'typing') {
      inputRef.current?.focus();
    }
  }, [gameState]);

  // Global keydown when modal is in typing state (desktop: works even if hidden input loses focus)
  useEffect(() => {
    if (gameState !== 'typing') return;
    const handler = (e: KeyboardEvent) => {
      if (e.target === inputRef.current) return; // already handled by input onKeyDown
      handleKeyDown(e);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [gameState, handleKeyDown]);

  const nextWord = () => {
    const hadMistake = hadMistakeOnCurrentWord;
    const completedWord = currentWord;
    const result: WordPracticeResult = {
      wordId: completedWord.id,
      word: completedWord.word,
      correct: !hadMistake
    };
    const nextResults = [...wordResults, result];
    setWordResults(nextResults);
    const nextQueue = hadMistake ? [...queue.slice(1), queue[0]] : queue.slice(1);
    setQueue(nextQueue);
    setHadMistakeOnCurrentWord(false);
    setAdvanceCounter(c => c + 1);
    if (nextQueue.length === 0) {
      onFinish(score, nextResults);
    }
  };

  const startPlaying = () => {
    setGameState('typing');
    handleSpeakWord();
  };

  if (!currentWord) {
    return (
      <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
        <p className="text-white font-bold">Completing…</p>
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 bg-amber-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 min-h-dvh overflow-y-auto transition-transform ${isShaking ? 'animate-bounce' : ''}`}>
      <div className={`bg-white rounded-2xl sm:rounded-[2.5rem] max-w-2xl w-full shadow-2xl overflow-hidden border-4 sm:border-8 border-amber-400 animate-in zoom-in-95 duration-300 flex flex-col min-h-0 max-h-[calc(100dvh-1rem)] my-auto ${isShaking ? 'border-red-500' : ''}`}>

        <div className={`px-4 sm:px-8 py-2 sm:py-4 flex justify-between items-center transition-colors shrink-0 ${isShaking ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'}`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">{isShaking ? '💥' : '🐝'}</span>
            <span className="font-black uppercase tracking-tight text-sm sm:text-base truncate">Spelling Bee</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="font-bold bg-white/30 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs">Words left: {queue.length}</span>
            <button onClick={onClose} className="hover:rotate-90 transition-transform p-1">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 bg-amber-50 flex-1 min-h-0 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-center mb-2 sm:mb-4 bg-white p-2 sm:p-4 rounded-2xl sm:rounded-3xl border-2 border-amber-200 shadow-sm shrink-0">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest">What you typed — green = correct, red = wrong</span>
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto flex-wrap">
                {targetLetters.map((_, i) => (
                  <span
                    key={i}
                    className={`text-xl sm:text-3xl font-black tracking-widest font-mono px-1 ${
                      i >= typedLetters.length ? 'text-gray-300' : typedLetters[i].correct ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {i < typedLetters.length ? typedLetters[i].letter : ' _ '}
                  </span>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase">Points</span>
              <div className="text-2xl sm:text-3xl font-black text-amber-950">{score}</div>
            </div>
          </div>

          <div className="flex-1 min-h-[200px] sm:min-h-[280px] min-w-0 relative flex flex-col">
            <div className={`absolute inset-0 bg-amber-100 rounded-2xl sm:rounded-3xl border-4 border-white overflow-hidden flex flex-col ${isShaking ? 'animate-[shake_0.5s_infinite]' : ''}`}>

              {gameState === 'preview' && (
                <div className="absolute inset-0 bg-amber-500/95 flex items-center justify-center text-white z-20 backdrop-blur-md p-4 overflow-auto">
                  <div className="text-center animate-in zoom-in duration-300 w-full max-w-full min-w-0 flex flex-col items-center justify-center py-4">
                    <div className="text-5xl sm:text-7xl mb-2 sm:mb-4 shrink-0">🐝</div>
                    <h3 className="text-xl sm:text-2xl font-black uppercase tracking-widest mb-2 opacity-80 shrink-0">Memorise the Word!</h3>
                    <div
                      className={`font-black mb-4 sm:mb-8 tracking-[0.15em] bg-white/20 p-3 sm:p-4 rounded-3xl border-4 border-white/30 drop-shadow-lg w-full max-w-full overflow-hidden flex items-center justify-center min-h-[3.5rem] sm:min-h-[4.5rem] ${
                        currentWord.word.length > 14 ? 'text-lg sm:text-xl' :
                        currentWord.word.length > 12 ? 'text-xl sm:text-2xl' :
                        currentWord.word.length > 10 ? 'text-2xl sm:text-3xl' :
                        currentWord.word.length > 8 ? 'text-3xl sm:text-4xl' :
                        currentWord.word.length > 6 ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-6xl'
                      }`}
                    >
                      <span className="break-all leading-tight">{currentWord.word.toUpperCase()}</span>
                    </div>
                    <button
                      onClick={startPlaying}
                      className="bg-white text-amber-600 px-8 sm:px-12 py-4 sm:py-5 rounded-[2rem] font-black text-xl sm:text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 mx-auto shrink-0"
                    >
                      TYPE THE LETTERS ⌨️
                    </button>
                    <p className="mt-4 sm:mt-6 text-xs sm:text-sm opacity-60 font-bold uppercase tracking-widest shrink-0">Type one letter at a time</p>
                  </div>
                </div>
              )}

              {gameState === 'starting' && (
                <div className="absolute inset-0 bg-amber-500/90 flex items-center justify-center text-white z-20 backdrop-blur-sm overflow-auto">
                  <div className="text-center animate-in zoom-in duration-300 py-4">
                    <div className="text-5xl sm:text-7xl mb-4">🐝</div>
                    <h3 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">PREPARING...</h3>
                  </div>
                </div>
              )}

              {gameState === 'typing' && (
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 z-20 overflow-auto cursor-text"
                  onClick={() => inputRef.current?.focus()}
                >
                  <input
                    ref={inputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    className="absolute opacity-0 w-0 h-0 pointer-events-none"
                    aria-label="Type the next letter"
                    onKeyDown={handleKeyDown}
                  />
                  <div className="text-5xl sm:text-8xl mb-3 sm:mb-4">⌨️</div>
                  <h3 className="text-lg sm:text-2xl font-black text-amber-900 mb-1 text-center">
                    Type one letter at a time
                  </h3>
                  <p className="text-sm sm:text-base text-amber-700 font-bold mb-2 text-center max-w-sm">
                    Tap here to focus, then type the next letter on your keyboard.
                  </p>
                  <p className="text-xs text-amber-600 font-bold">
                    Letter {nextLetterIndex + 1} of {targetLetters.length}
                  </p>
                </div>
              )}

              {gameState === 'feedback' && (
                <div className="absolute inset-0 bg-emerald-500/95 flex items-center justify-center text-white z-30 p-4 sm:p-8 text-center animate-in fade-in duration-300 backdrop-blur-md overflow-auto">
                  <div className="w-full max-w-full py-4">
                    <div className="text-5xl sm:text-8xl mb-3 sm:mb-6">🏆</div>
                    <h3 className="text-2xl sm:text-5xl font-black mb-2 sm:mb-4 uppercase tracking-tight">WELL DONE!</h3>
                    <p className="text-base sm:text-2xl font-bold mb-2 sm:mb-4 italic text-emerald-100 break-all">&ldquo;{currentWord.word.toUpperCase()}&rdquo;</p>
                    {hadMistakeOnCurrentWord && (
                      <p className="text-xs sm:text-base font-bold mb-3 sm:mb-6 text-emerald-200">You had a mistake — you&apos;ll try this word again!</p>
                    )}
                    <button
                      onClick={nextWord}
                      className="w-full bg-white text-emerald-600 py-3 sm:py-6 rounded-2xl sm:rounded-[2rem] font-black text-xl sm:text-3xl shadow-xl hover:scale-105 active:scale-95 transition-all"
                    >
                      {queue.length === 1 && !hadMistakeOnCurrentWord ? 'FINISH 🏁' : 'NEXT WORD ➡️'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-2 sm:mt-6 flex justify-between items-center text-[10px] sm:text-xs font-black text-amber-700/60 uppercase tracking-widest px-1 sm:px-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="bg-white px-2 py-1 rounded-lg border shadow-sm text-amber-600">⌨️</span>
              <span>Type each letter one at a time</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          10% { transform: translate(-1px, -2px) rotate(-1deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          30% { transform: translate(3px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(3px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(1px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
      `}</style>
    </div>
  );
};

export default SpellingBeeModal;
