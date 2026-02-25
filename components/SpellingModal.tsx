
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { WordEntry } from '../types';
import { speakText } from '../geminiService';
import type { WordPracticeResult } from '../lib/supabaseQueries';

interface SpellingModalProps {
  wordEntries: WordEntry[];
  onClose: () => void;
  onFinish: (points: number, wordResults?: WordPracticeResult[]) => void;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Play a short success "snap" sound (optional, no-op if audio fails). */
function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523, ctx.currentTime);
    osc.frequency.setValueAtTime(784, ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch (_) {}
}

const SpellingModal: React.FC<SpellingModalProps> = ({ wordEntries, onClose, onFinish }) => {
  const [queue, setQueue] = useState<WordEntry[]>(() => [...wordEntries]);
  const [hadMistakeOnCurrentWord, setHadMistakeOnCurrentWord] = useState(false);
  const [advanceCounter, setAdvanceCounter] = useState(0);

  const [score, setScore] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gameState, setGameState] = useState<'preview' | 'playing' | 'feedback' | 'starting'>('starting');
  const [feedback, setFeedback] = useState<{ correct: boolean; word: string } | null>(null);

  /** For current word: letters placed in slot order; correct: false means show red and re-queue word. */
  const [placedLetters, setPlacedLetters] = useState<Array<{ letter: string; correct: boolean }>>([]);
  /** Scrambled letter tiles (one per letter of the word). Tapping removes on correct. */
  const [tiles, setTiles] = useState<Array<{ id: string; letter: string }>>([]);
  const [wordResults, setWordResults] = useState<WordPracticeResult[]>([]);

  const currentWord = queue[0];
  const targetLetters = useMemo(
    () => (currentWord ? currentWord.word.toUpperCase().split('') : []),
    [currentWord]
  );
  const currentSlotIndex = placedLetters.length;
  const wordComplete = targetLetters.length > 0 && placedLetters.length >= targetLetters.length;
  const showWrongAndAdvance = placedLetters.length > 0 && placedLetters[placedLetters.length - 1]?.correct === false;

  const resetLevel = useCallback(() => {
    if (!currentWord) return;
    const letters = currentWord.word.toUpperCase().split('');
    setPlacedLetters([]);
    setTiles(shuffle(letters).map((letter, i) => ({ id: `tile-${i}-${letter}-${Math.random().toString(36).slice(2)}`, letter })));
    setHadMistakeOnCurrentWord(false);
    setGameState('preview');
  }, [currentWord]);

  useEffect(() => {
    if (currentWord) resetLevel();
  }, [advanceCounter, resetLevel]);

  const advanceToNextWord = useCallback(() => {
    if (!currentWord) return;
    const result: WordPracticeResult = {
      wordId: currentWord.id,
      word: currentWord.word,
      correct: !hadMistakeOnCurrentWord
    };
    const nextResults = [...wordResults, result];
    setWordResults(nextResults);
    const nextQueue = hadMistakeOnCurrentWord ? [...queue.slice(1), queue[0]] : queue.slice(1);
    setQueue(nextQueue);
    setHadMistakeOnCurrentWord(false);
    setFeedback(null);
    setAdvanceCounter(c => c + 1);
    if (nextQueue.length === 0) {
      onFinish(score, nextResults);
    } else {
      setGameState('starting');
    }
  }, [currentWord, hadMistakeOnCurrentWord, wordResults, queue, score, onFinish]);

  // After showing wrong letter in red, advance to next word
  useEffect(() => {
    if (!showWrongAndAdvance) return;
    const t = setTimeout(advanceToNextWord, 1400);
    return () => clearTimeout(t);
  }, [showWrongAndAdvance, advanceToNextWord]);

  const handleTileTap = useCallback(
    (tileId: string, letter: string) => {
      if (gameState !== 'playing' || currentSlotIndex >= targetLetters.length || showWrongAndAdvance) return;
      const expected = targetLetters[currentSlotIndex];
      const correct = letter === expected;

      if (correct) {
        playSuccessSound();
        setPlacedLetters(prev => [...prev, { letter, correct: true }]);
        setTiles(prev => prev.filter(t => t.id !== tileId));
        setScore(s => s + 10);
        if (currentSlotIndex + 1 >= targetLetters.length) {
          setScore(s => s + 200);
          setGameState('feedback');
          setFeedback({ correct: true, word: currentWord!.word });
        }
      } else {
        setPlacedLetters(prev => [...prev, { letter, correct: false }]);
        setHadMistakeOnCurrentWord(true);
        setScore(s => Math.max(0, s - 10));
      }
    },
    [gameState, currentSlotIndex, targetLetters, currentWord, showWrongAndAdvance]
  );

  const handleSpeakWord = useCallback(async () => {
    if (!currentWord || isSpeaking) return;
    setIsSpeaking(true);
    await speakText(`${currentWord.word}... ${currentWord.word}`);
    setIsSpeaking(false);
  }, [currentWord, isSpeaking]);

  const startPlaying = useCallback(() => {
    setGameState('playing');
    handleSpeakWord();
  }, [handleSpeakWord]);

  const nextWord = useCallback(() => {
    setFeedback(null);
    advanceToNextWord();
  }, [advanceToNextWord]);

  if (!currentWord) {
    return (
      <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
        <p className="text-white font-bold">Completing…</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-amber-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 min-h-dvh overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[2.5rem] max-w-2xl w-full shadow-2xl overflow-hidden border-4 sm:border-8 border-amber-400 flex flex-col min-h-0 max-h-[calc(100dvh-1rem)] my-auto">

        <div className="px-4 sm:px-8 py-2 sm:py-4 flex justify-between items-center shrink-0 bg-amber-400 text-amber-950">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">🦊</span>
            <span className="font-black uppercase tracking-tight text-sm sm:text-base truncate">Word building</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="font-bold bg-white/30 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs">Words left: {queue.length}</span>
            <button onClick={onClose} className="hover:rotate-90 transition-transform p-1" aria-label="Close">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 bg-amber-50 flex-1 min-h-0 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-center mb-2 sm:mb-4 bg-white p-2 sm:p-4 rounded-2xl border-2 border-amber-200 shadow-sm shrink-0">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest">Tap letters in order</span>
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <button onClick={handleSpeakWord} disabled={isSpeaking} className="text-amber-500 hover:scale-110 transition-transform shrink-0 disabled:opacity-60" aria-label="Hear word">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
                  </svg>
                </button>
                <div className="flex flex-wrap gap-1 sm:gap-2 items-center">
                  {targetLetters.map((_, i) => (
                    <span
                      key={i}
                      className={`
                        inline-flex items-center justify-center min-w-[2rem] sm:min-w-[2.75rem] h-10 sm:h-12 text-xl sm:text-2xl font-black rounded-xl border-2 transition-all duration-200
                        ${i < placedLetters.length
                          ? placedLetters[i].correct
                            ? 'bg-emerald-100 border-emerald-400 text-emerald-800 scale-100'
                            : 'bg-red-100 border-red-400 text-red-600 animate-[shake_0.4s_ease-in-out]'
                          : 'bg-amber-50 border-amber-200 text-gray-300'
                        }
                      `}
                    >
                      {i < placedLetters.length ? placedLetters[i].letter : '?'}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="text-right shrink-0 ml-2">
              <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase">Points</span>
              <div className="text-2xl sm:text-3xl font-black text-amber-950">{score}</div>
            </div>
          </div>

          {/* Game area: preview or playing (slots are above; tiles below) */}
          <div className="flex-1 min-h-[200px] flex flex-col gap-4">
            {gameState === 'preview' && (
              <div className="flex-1 flex flex-col items-center justify-center bg-amber-100 rounded-2xl border-4 border-amber-200 p-6">
                <div className="text-5xl sm:text-6xl mb-4">🧠</div>
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-widest mb-2 text-amber-900">Memorise the word</h3>
                <p className="text-3xl sm:text-5xl font-black tracking-widest text-amber-950 mb-6 break-all text-center">{currentWord.word.toUpperCase()}</p>
                <button
                  onClick={startPlaying}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-lg active:scale-95 transition-all"
                >
                  Tap the letters in order
                </button>
              </div>
            )}

            {gameState === 'starting' && (
              <div className="flex-1 flex items-center justify-center bg-amber-100 rounded-2xl border-4 border-amber-200">
                <p className="text-amber-700 font-black text-lg">Next word…</p>
              </div>
            )}

            {gameState === 'playing' && (
              <div className="flex-1 flex flex-col">
                <p className="text-xs font-black text-amber-600 uppercase tracking-widest mb-2">Tap the correct letter for each slot</p>
                <div className="flex-1 flex flex-wrap gap-3 content-start justify-center items-center">
                  {tiles.map(({ id, letter }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handleTileTap(id, letter)}
                      className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-white border-4 border-amber-300 text-2xl sm:text-4xl font-black text-amber-900 shadow-lg hover:scale-105 active:scale-95 hover:border-amber-500 hover:bg-amber-50 transition-all"
                    >
                      {letter}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {gameState === 'feedback' && feedback && (
              <div className="flex-1 flex flex-col items-center justify-center bg-emerald-500/95 rounded-2xl border-4 border-emerald-300 p-6 text-white">
                <div className="text-5xl sm:text-8xl mb-4">🏆</div>
                <h3 className="text-2xl sm:text-4xl font-black uppercase tracking-tight mb-2">Well done!</h3>
                <p className="text-xl sm:text-2xl font-bold mb-6 italic text-emerald-100">"{feedback.word.toUpperCase()}"</p>
                <button
                  onClick={nextWord}
                  className="bg-white text-emerald-600 py-4 px-8 rounded-2xl font-black text-xl shadow-xl hover:scale-105 active:scale-95"
                >
                  {queue.length === 1 ? 'Finish' : 'Next word'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
};

export default SpellingModal;
