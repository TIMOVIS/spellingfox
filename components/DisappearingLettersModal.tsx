
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordEntry } from '../types';
import { speakText } from '../geminiService';
import type { WordPracticeResult } from '../lib/supabaseQueries';
import { formatWordForDisplay } from '../lib/wordDisplay';

const VOWELS = new Set('AEIOU');

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Order to remove letters: vowels first, then consonants. */
function getRemovalOrder(word: string): number[] {
  const upper = word.toUpperCase();
  const vowelIndices: number[] = [];
  const consonantIndices: number[] = [];
  for (let i = 0; i < upper.length; i++) {
    if (VOWELS.has(upper[i])) vowelIndices.push(i);
    else consonantIndices.push(i);
  }
  return [...vowelIndices, ...consonantIndices];
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CONFUSIONS: Record<string, string[]> = {
  A: ['E', 'O', 'U', 'H'], B: ['D', 'P', 'R', 'H'], C: ['K', 'S', 'G', 'O'], D: ['B', 'P', 'Q', 'T'],
  E: ['A', 'I', 'U'],       F: ['P', 'T', 'H'],     G: ['C', 'J', 'Q'],     H: ['N', 'M', 'A', 'R'],
  I: ['E', 'L', 'J', 'Y'], J: ['I', 'G', 'Y'],     K: ['C', 'X', 'R'],     L: ['I', 'T', 'E'],
  M: ['N', 'W', 'H'],      N: ['M', 'H', 'U', 'R'], O: ['A', 'Q', 'D', 'C'], P: ['B', 'D', 'R', 'Q'],
  Q: ['O', 'G', 'P', 'D'], R: ['P', 'B', 'K', 'N'], S: ['C', 'Z', 'F'],    T: ['F', 'D', 'L', 'I'],
  U: ['V', 'O', 'N', 'A'], V: ['U', 'W', 'Y'],     W: ['M', 'V', 'N'],    X: ['K', 'S', 'Z'],
  Y: ['I', 'V', 'U', 'J'], Z: ['S', 'X', 'N'],
};

function getLetterOptions(correct: string): string[] {
  const used = new Set<string>([correct]);
  const distractors: string[] = [];
  const confusing = CONFUSIONS[correct];
  if (confusing) {
    for (const c of shuffle(confusing)) {
      if (!used.has(c)) { used.add(c); distractors.push(c); }
      if (distractors.length >= 4) break;
    }
  }
  while (distractors.length < 4) {
    const r = ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (!used.has(r)) { used.add(r); distractors.push(r); }
  }
  return shuffle([correct, ...distractors]);
}

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

interface DisappearingLettersModalProps {
  wordEntries: WordEntry[];
  onClose: () => void;
  onFinish: (points: number, wordResults?: WordPracticeResult[]) => void;
}

const FULL_WORD_MS = 2500;

const DisappearingLettersModal: React.FC<DisappearingLettersModalProps> = ({ wordEntries, onClose, onFinish }) => {
  const [queue, setQueue] = useState<WordEntry[]>(() => [...wordEntries]);
  const [currentWord, setCurrentWord] = useState<WordEntry | null>(queue[0] ?? null);
  const [wordResults, setWordResults] = useState<WordPracticeResult[]>([]);
  const [score, setScore] = useState(0);
  const [hadMistakeOnCurrentWord, setHadMistakeOnCurrentWord] = useState(false);

  const [gameState, setGameState] = useState<'full' | 'filling' | 'feedback' | 'starting'>(
    wordEntries.length > 0 ? 'full' : 'starting'
  );
  const [removalOrder, setRemovalOrder] = useState<number[]>([]);
  const [currentRemovalIndex, setCurrentRemovalIndex] = useState(0);
  const [letterOptions, setLetterOptions] = useState<string[]>([]);
  const [wrongLetter, setWrongLetter] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const letters = currentWord ? currentWord.word.toUpperCase().split('') : [];
  const hiddenIndex = removalOrder[currentRemovalIndex] ?? -1;

  const speakCurrentWord = useCallback(async () => {
    if (!currentWord) return;
    await speakText(`${currentWord.word}... ${currentWord.word}`);
  }, [currentWord]);

  useEffect(() => {
    if (!currentWord || gameState !== 'full') return;
    speakCurrentWord();
    timerRef.current = setTimeout(() => {
      const order = getRemovalOrder(currentWord.word);
      setRemovalOrder(order);
      setCurrentRemovalIndex(0);
      if (order.length === 0) {
        setScore(s => s + 200);
        setGameState('feedback');
      } else {
        setGameState('filling');
        const idx = order[0];
        setLetterOptions(getLetterOptions(letters[idx]));
      }
    }, FULL_WORD_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [currentWord?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLetterTap = useCallback(
    (letter: string) => {
      if (gameState !== 'filling' || wrongLetter !== null || hiddenIndex < 0) return;
      const expected = letters[hiddenIndex];
      const correct = letter === expected;
      if (correct) {
        playSuccessSound();
        setScore(s => s + 10);
        if (currentRemovalIndex + 1 >= removalOrder.length) {
          setScore(s => s + 200);
          setGameState('feedback');
        } else {
          setCurrentRemovalIndex(prev => {
            const next = prev + 1;
            const nextHidden = removalOrder[next];
            setLetterOptions(getLetterOptions(letters[nextHidden]));
            return next;
          });
        }
      } else {
        setHadMistakeOnCurrentWord(true);
        setScore(s => Math.max(0, s - 10));
        setWrongLetter(letter);
        setIsShaking(true);
      }
    },
    [gameState, wrongLetter, hiddenIndex, letters, currentRemovalIndex, removalOrder]
  );

  useEffect(() => {
    if (wrongLetter === null) return;
    const t = setTimeout(() => {
      setWrongLetter(null);
      setIsShaking(false);
    }, 1200);
    return () => clearTimeout(t);
  }, [wrongLetter]);

  const nextWord = useCallback(() => {
    if (!currentWord) return;
    const result: WordPracticeResult = {
      wordId: currentWord.id,
      word: currentWord.word,
      correct: !hadMistakeOnCurrentWord
    };
    const nextResults = [...wordResults, result];
    setWordResults(nextResults);
    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    setHadMistakeOnCurrentWord(false);
    if (nextQueue.length === 0) {
      onFinish(score, nextResults);
      return;
    }
    setCurrentWord(nextQueue[0]);
    setGameState('full');
    setRemovalOrder([]);
    setCurrentRemovalIndex(0);
    setWrongLetter(null);
  }, [currentWord, hadMistakeOnCurrentWord, wordResults, queue, score, onFinish]);

  const handleClose = useCallback(() => {
    onFinish(score, wordResults);
    onClose();
  }, [score, wordResults, onFinish, onClose]);

  if (!currentWord && queue.length === 0) {
    return (
      <div className="fixed inset-0 bg-teal-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
        <p className="text-white font-bold">Completing…</p>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className={`fixed inset-0 bg-teal-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 min-h-dvh overflow-y-auto ${isShaking ? 'animate-bounce' : ''}`}>
      <div className={`bg-white rounded-2xl sm:rounded-[2.5rem] max-w-2xl w-full shadow-2xl overflow-hidden border-4 sm:border-8 border-teal-400 flex flex-col min-h-0 max-h-[calc(100dvh-1rem)] my-auto ${isShaking ? 'border-red-500' : ''}`}>
        <div className={`px-4 sm:px-8 py-2 sm:py-4 flex justify-between items-center shrink-0 ${isShaking ? 'bg-red-500 text-white' : 'bg-teal-400 text-teal-950'}`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">✨</span>
            <span className="font-black uppercase tracking-tight text-sm sm:text-base truncate">Disappearing letters</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="font-bold bg-white/30 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs">Words left: {queue.length}</span>
            <button onClick={handleClose} className="hover:rotate-90 transition-transform p-1" aria-label="Close">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-3 sm:p-6 bg-teal-50 flex-1 min-h-0 flex flex-col overflow-y-auto">
          <div className="flex justify-between items-center mb-2 sm:mb-4 bg-white p-2 sm:p-4 rounded-2xl border-2 border-teal-200 shadow-sm shrink-0">
            <div className="text-right shrink-0 ml-2">
              <span className="text-[9px] sm:text-[10px] font-black text-teal-600 uppercase">Points</span>
              <div className="text-2xl sm:text-3xl font-black text-teal-950">{score}</div>
            </div>
          </div>

          <div className="flex-1 min-h-[200px] sm:min-h-[280px] flex flex-col items-center justify-center">
            {gameState === 'full' && (
              <div className="text-center w-full">
                <p className="text-[10px] sm:text-xs font-black text-teal-600 uppercase tracking-widest mb-3">Memorise the word</p>
                <div className="font-black tracking-[0.2em] text-3xl sm:text-5xl text-teal-900">
                  {formatWordForDisplay(currentWord.word)}
                </div>
              </div>
            )}

            {gameState === 'filling' && (
              <div className="w-full max-w-md mx-auto space-y-6">
                <p className="text-center text-sm sm:text-base font-bold text-teal-800">
                  Tap the missing letter in the word, then choose the correct letter tile below to fill the gap.
                </p>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                  {letters.map((letter, i) => {
                    const isHidden = i === hiddenIndex;
                    const showWrong = wrongLetter !== null && isHidden;
                    return (
                      <span
                        key={i}
                        className={`inline-flex items-center justify-center min-w-[2rem] sm:min-w-[2.5rem] h-12 sm:h-14 rounded-xl font-black text-xl sm:text-2xl border-2 ${
                          showWrong
                            ? 'border-red-500 bg-red-100 text-red-600 animate-pulse'
                            : isHidden
                              ? 'border-dashed border-teal-300 bg-teal-100 text-transparent'
                              : 'border-teal-300 bg-white text-teal-900'
                        }`}
                      >
                        {showWrong ? wrongLetter : isHidden ? '?' : letter}
                      </span>
                    );
                  })}
                </div>
                <div className="pt-2">
                  <p className="text-center text-[11px] sm:text-xs font-bold text-teal-700 uppercase tracking-widest mb-2">
                    Pick one letter tile to go into the empty box
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                    {letterOptions.map((letter) => (
                      <button
                        key={letter}
                        onClick={() => handleLetterTap(letter)}
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl font-black text-xl sm:text-2xl bg-yellow-100 border-2 border-yellow-400 text-teal-900 shadow-md hover:bg-yellow-200 hover:scale-105 active:scale-95 transition-all"
                      >
                        {letter}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {gameState === 'feedback' && (
              <div className="text-center w-full py-6">
                <div className="text-5xl sm:text-7xl mb-4">🏆</div>
                <h3 className="text-2xl sm:text-4xl font-black text-teal-800 mb-2">Well done!</h3>
                <p className="text-xl sm:text-2xl font-bold text-teal-700 mb-6 italic">&ldquo;{formatWordForDisplay(currentWord.word)}&rdquo;</p>
                {hadMistakeOnCurrentWord && (
                  <p className="text-sm text-teal-600 font-bold mb-4">You had a mistake — keep practising!</p>
                )}
                <button
                  onClick={nextWord}
                  className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-xl shadow-lg hover:bg-teal-700 hover:scale-105 active:scale-95 transition-all"
                >
                  {queue.length === 1 ? 'Finish' : 'Next word'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisappearingLettersModal;
