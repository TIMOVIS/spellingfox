
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WordEntry } from '../types';
import { speakText } from '../geminiService';

interface SpellingModalProps {
  wordEntries: WordEntry[];
  onClose: () => void;
  onFinish: (points: number) => void;
}

interface LetterNode {
  id: string;
  char: string;
  x: number;
  y: number;
  isCorrect: boolean;
  isFlaggedWrong?: boolean;
}

const GRID_SIZE = 15;
const INITIAL_SNAKE = [{ x: 7, y: 7 }];
const DISTRACTOR_COUNT = 4;
const TOUCH_THRESHOLD = 25; // Pixels to move before triggering a grid step

const SpellingModal: React.FC<SpellingModalProps> = ({ wordEntries, onClose, onFinish }) => {
  // Queue: words still to spell; game ends when queue is empty (every word done with no mistakes)
  const [queue, setQueue] = useState<WordEntry[]>(() => [...wordEntries]);
  const [hadMistakeOnCurrentWord, setHadMistakeOnCurrentWord] = useState(false);
  const [advanceCounter, setAdvanceCounter] = useState(0);

  const [score, setScore] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [gameState, setGameState] = useState<'preview' | 'playing' | 'feedback' | 'starting'>('starting');
  const [feedback, setFeedback] = useState<{ correct: boolean, word: string } | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  // Snake State
  const [snake, setSnake] = useState(INITIAL_SNAKE);
  const [activeLetters, setActiveLetters] = useState<LetterNode[]>([]);
  const [collectedLetters, setCollectedLetters] = useState<string[]>([]);

  // Touch Tracking
  const lastTouchPos = useRef<{ x: number, y: number } | null>(null);
  const isProcessingLetter = useRef(false);

  const currentWord = queue[0];
  const targetLetters = currentWord ? currentWord.word.toUpperCase().split('') : [];
  const currentTargetChar = targetLetters[collectedLetters.length];

  const handleSpeakWord = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    await speakText(`${currentWord.word}... ${currentWord.word}`);
    setIsSpeaking(false);
  };

  const spawnLetters = useCallback((alreadyCollected: string[], currentSnake: {x: number, y: number}[], wordToSpell: string) => {
    const lettersToSpell = wordToSpell.toUpperCase().split('');
    const nextChar = lettersToSpell[alreadyCollected.length];
    
    // Safety check: if we've collected all letters, don't spawn more
    if (!nextChar) {
      return;
    }
    
    const newLetters: LetterNode[] = [];
    const usedPositions = new Set(currentSnake.map(s => `${s.x},${s.y}`));

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

    const addLetter = (char: string, isCorrect: boolean) => {
      let x, y, posKey;
      do {
        x = Math.floor(Math.random() * GRID_SIZE);
        y = Math.floor(Math.random() * GRID_SIZE);
        posKey = `${x},${y}`;
      } while (usedPositions.has(posKey));
      usedPositions.add(posKey);
      newLetters.push({ 
        id: Math.random().toString(36).substr(2, 9),
        char, 
        x, 
        y, 
        isCorrect 
      });
    };

    // Correct letter
    addLetter(nextChar, true);

    // Distractors
    for (let i = 0; i < DISTRACTOR_COUNT; i++) {
      let randomChar;
      do {
        randomChar = alphabet[Math.floor(Math.random() * alphabet.length)];
      } while (randomChar === nextChar);
      addLetter(randomChar, false);
    }

    setActiveLetters(newLetters);
  }, []);

  const resetLevel = useCallback(() => {
    if (!currentWord) return;
    setSnake(INITIAL_SNAKE);
    setCollectedLetters([]);
    spawnLetters([], INITIAL_SNAKE, currentWord.word);
    setGameState('preview');
  }, [spawnLetters, currentWord]);

  useEffect(() => {
    if (currentWord) resetLevel();
  }, [advanceCounter, resetLevel]);

  const moveSnake = useCallback((dx: number, dy: number) => {
    // Prevent multiple rapid calls from processing the same letter
    if (isProcessingLetter.current) return;
    
    setGameState(gs => {
      if (gs !== 'playing') return gs;
      return gs;
    });

    setSnake(prev => {
      const head = prev[0];
      const newHead = {
        x: (head.x + dx + GRID_SIZE) % GRID_SIZE,
        y: (head.y + dy + GRID_SIZE) % GRID_SIZE
      };

      // Don't allow moving into the neck
      if (prev.length > 1 && newHead.x === prev[1].x && newHead.y === prev[1].y) {
        return prev;
      }

      // Check for letter collision - read from current state
      setActiveLetters(prevActiveLetters => {
        const hitLetter = prevActiveLetters.find(l => l.x === newHead.x && l.y === newHead.y);
        
        if (hitLetter && hitLetter.isCorrect && !isProcessingLetter.current) {
          isProcessingLetter.current = true;
          
          // Remove the collected letter immediately
          const remainingLetters = prevActiveLetters.filter(l => l.id !== hitLetter.id);
          
          // Update snake (grow by one)
          const newSnake = [newHead, ...prev];
          setSnake(newSnake);
          
          // Update collected letters
          setCollectedLetters(prevLetters => {
            const currentTargetLetters = currentWord.word.toUpperCase().split('');
            
            // Safety checks
            if (prevLetters.length >= currentTargetLetters.length) {
              isProcessingLetter.current = false;
              return prevLetters;
            }
            
            // Verify this is the correct next letter
            const expectedNextChar = currentTargetLetters[prevLetters.length];
            if (hitLetter.char !== expectedNextChar) {
              isProcessingLetter.current = false;
              return prevLetters;
            }
            
            const updated = [...prevLetters, hitLetter.char];
            
            // Award 10 points for each correct letter collected
            setScore(s => s + 10);
            
            if (updated.length === currentTargetLetters.length) {
              setGameState('feedback');
              setScore(s => s + 200); // Bonus for completing the word
              setFeedback({ correct: true, word: currentWord.word });
            } else {
              spawnLetters(updated, newSnake, currentWord.word);
            }
            
            isProcessingLetter.current = false;
            return updated;
          });
          
          return remainingLetters;
        } else if (hitLetter && !hitLetter.isCorrect) {
          // Wrong letter! Mark word for retry and flag the letter
          setHadMistakeOnCurrentWord(true);
          setIsShaking(true);
          setScore(s => Math.max(0, s - 10));
          setTimeout(() => setIsShaking(false), 500);

          return prevActiveLetters.map(l => l.id === hitLetter.id ? { ...l, isFlaggedWrong: true } : l);
        }
        
        // No letter hit - standard move
        const newSnake = [newHead, ...prev];
        newSnake.pop();
        setSnake(newSnake);
        return prevActiveLetters;
      });

      return prev;
    });
  }, [currentWord.word, spawnLetters]);

  // Touch Handlers
  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (gameState !== 'playing' || !lastTouchPos.current) return;
    
    const touch = e.touches[0];
    const dx = touch.clientX - lastTouchPos.current.x;
    const dy = touch.clientY - lastTouchPos.current.y;

    if (Math.abs(dx) > TOUCH_THRESHOLD) {
      moveSnake(dx > 0 ? 1 : -1, 0);
      lastTouchPos.current.x = touch.clientX;
    } else if (Math.abs(dy) > TOUCH_THRESHOLD) {
      moveSnake(0, dy > 0 ? 1 : -1);
      lastTouchPos.current.y = touch.clientY;
    }
  };

  const onTouchEnd = () => {
    lastTouchPos.current = null;
  };

  // Keyboard Handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (gameState !== 'playing') return;
      switch (e.key) {
        case 'ArrowUp': case 'w': moveSnake(0, -1); break;
        case 'ArrowDown': case 's': moveSnake(0, 1); break;
        case 'ArrowLeft': case 'a': moveSnake(-1, 0); break;
        case 'ArrowRight': case 'd': moveSnake(1, 0); break;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [gameState, moveSnake]);

  const nextWord = () => {
    setFeedback(null);
    const hadMistake = hadMistakeOnCurrentWord;
    const nextQueue = hadMistake ? [...queue.slice(1), queue[0]] : queue.slice(1);
    setQueue(nextQueue);
    setHadMistakeOnCurrentWord(false);
    setAdvanceCounter(c => c + 1);
    if (nextQueue.length === 0) {
      onFinish(score);
    }
  };

  const startPlaying = () => {
    setGameState('playing');
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
    <div className={`fixed inset-0 bg-amber-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 h-dvh max-h-dvh overflow-hidden transition-transform ${isShaking ? 'animate-bounce' : ''}`}>
      <div className={`bg-white rounded-2xl sm:rounded-[2.5rem] max-w-2xl w-full shadow-2xl overflow-hidden border-4 sm:border-8 border-amber-400 animate-in zoom-in-95 duration-300 flex flex-col max-h-[calc(100dvh-1rem)] ${isShaking ? 'border-red-500' : ''}`}>
        
        <div className={`px-4 sm:px-8 py-2 sm:py-4 flex justify-between items-center transition-colors shrink-0 ${isShaking ? 'bg-red-500 text-white' : 'bg-amber-400 text-amber-950'}`}>
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">{isShaking ? '💥' : '🦊'}</span>
            <span className="font-black uppercase tracking-tight text-sm sm:text-base truncate">Fox's Spelling Quest</span>
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

        <div className="p-3 sm:p-6 bg-amber-50 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-2 sm:mb-4 bg-white p-2 sm:p-4 rounded-2xl sm:rounded-3xl border-2 border-amber-200 shadow-sm shrink-0">
             <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest">Collect Letters In Order</span>
                <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto">
                  <button onClick={handleSpeakWord} className="text-amber-500 hover:scale-110 transition-transform shrink-0">
                    <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
                    </svg>
                  </button>
                  <span className="text-xl sm:text-3xl font-black text-gray-900 tracking-widest font-mono whitespace-nowrap">
                    {targetLetters.map((char, i) => (
                      <span key={i} className={i < collectedLetters.length ? 'text-amber-500' : 'text-gray-200'}>
                        {i < collectedLetters.length ? char : '_'}
                      </span>
                    ))}
                  </span>
                </div>
             </div>
             <div className="text-right shrink-0 ml-2">
                <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase">Quest Points</span>
                <div className="text-2xl sm:text-3xl font-black text-amber-950">{score}</div>
             </div>
          </div>

          <div className="flex-1 min-h-[200px] sm:min-h-[280px] min-w-0 relative">
          <div 
            className={`absolute inset-0 bg-amber-100 rounded-2xl sm:rounded-3xl border-4 border-white overflow-hidden shadow-inner cursor-pointer touch-none ${isShaking ? 'animate-[shake_0.5s_infinite]' : ''}`}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {/* Grid Lines */}
            <div className="absolute inset-0 grid grid-cols-15 grid-rows-15 opacity-10">
              {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, i) => (
                <div key={i} className="border-[0.5px] border-amber-900" />
              ))}
            </div>

            {/* Snake Body */}
            {snake.map((segment, i) => {
              // For body segments (i > 0), show letters in collection order
              // i=1 shows the first collected letter, i=2 shows the second, etc.
              const letterIndex = i - 1;
              const segmentChar = i > 0 && letterIndex >= 0 && letterIndex < collectedLetters.length 
                ? collectedLetters[letterIndex] 
                : null;
              
              return (
                <div 
                  key={i}
                  className={`absolute w-[6.66%] h-[6.66%] rounded-md transition-all duration-200 shadow-sm flex items-center justify-center ${i === 0 ? 'bg-orange-600 z-10' : 'bg-orange-400'}`}
                  style={{ left: `${segment.x * 6.66}%`, top: `${segment.y * 6.66}%` }}
                >
                  {i === 0 ? (
                    <div className="flex justify-around items-start p-[2px] w-full h-full">
                      <div className="w-1 h-1 bg-white rounded-full" />
                      <div className="w-1 h-1 bg-white rounded-full" />
                    </div>
                  ) : (
                    segmentChar && (
                      <span className="text-[10px] font-black text-white pointer-events-none select-none">
                        {segmentChar}
                      </span>
                    )
                  )}
                </div>
              );
            })}

            {/* Letter Garden */}
            {activeLetters.map((l) => (
              <div 
                key={l.id}
                className={`absolute w-[6.66%] h-[6.66%] rounded-xl flex items-center justify-center font-black shadow-md text-sm transition-all duration-300 ${l.isFlaggedWrong ? 'bg-red-500 text-white scale-110' : 'bg-white text-indigo-900 animate-bounce border-2 border-indigo-100'}`}
                style={{ left: `${l.x * 6.66}%`, top: `${l.y * 6.66}%` }}
              >
                {l.char}
              </div>
            ))}

            {/* Memorise State Overlay */}
            {gameState === 'preview' && (
              <div className="absolute inset-0 bg-orange-500/95 flex items-center justify-center text-white z-20 backdrop-blur-md p-4 overflow-auto">
                <div className="text-center animate-in zoom-in duration-300 w-full max-w-full min-w-0 flex flex-col items-center justify-center py-4">
                  <div className="text-5xl sm:text-7xl mb-2 sm:mb-4 shrink-0">🧠</div>
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
                    className="bg-white text-orange-600 px-8 sm:px-12 py-4 sm:py-5 rounded-[2rem] font-black text-xl sm:text-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 mx-auto shrink-0"
                  >
                    I AM READY! 🚀
                  </button>
                  <p className="mt-4 sm:mt-6 text-xs sm:text-sm opacity-60 font-bold uppercase tracking-widest shrink-0">The word will disappear when you click</p>
                </div>
              </div>
            )}

            {/* Gameplay Starting Overlay */}
            {gameState === 'starting' && (
              <div className="absolute inset-0 bg-orange-500/90 flex items-center justify-center text-white z-20 backdrop-blur-sm overflow-auto">
                <div className="text-center animate-in zoom-in duration-300 py-4">
                  <div className="text-5xl sm:text-7xl mb-4">🦊</div>
                  <h3 className="text-3xl sm:text-5xl font-black uppercase tracking-tighter">PREPARING...</h3>
                </div>
              </div>
            )}

            {gameState === 'feedback' && currentWord && (
              <div className="absolute inset-0 bg-emerald-500/95 flex items-center justify-center text-white z-30 p-4 sm:p-8 text-center animate-in fade-in duration-300 backdrop-blur-md overflow-auto">
                <div className="w-full max-w-full py-4">
                  <div className="text-5xl sm:text-8xl mb-3 sm:mb-6">🏆</div>
                  <h3 className="text-2xl sm:text-5xl font-black mb-2 sm:mb-4 uppercase tracking-tight">MASTER SPELLER!</h3>
                  <p className="text-base sm:text-2xl font-bold mb-2 sm:mb-4 italic text-emerald-100 break-all">"{currentWord.word.toUpperCase()}"</p>
                  {hadMistakeOnCurrentWord && (
                    <p className="text-xs sm:text-base font-bold mb-3 sm:mb-6 text-emerald-200">You had a mistake — you&apos;ll try this word again!</p>
                  )}
                  <button 
                    onClick={nextWord}
                    className="w-full bg-white text-emerald-600 py-3 sm:py-6 rounded-2xl sm:rounded-[2rem] font-black text-xl sm:text-3xl shadow-xl hover:scale-105 active:scale-95 transition-all"
                  >
                    {queue.length === 1 && !hadMistakeOnCurrentWord ? 'FINISH QUEST 🏁' : 'NEXT WORD ➡️'}
                  </button>
                </div>
              </div>
            )}
          </div>
          </div>
          
          <div className="mt-2 sm:mt-6 flex justify-between items-center text-[10px] sm:text-xs font-black text-amber-700/60 uppercase tracking-widest px-1 sm:px-2 shrink-0">
             <div className="flex items-center gap-2">
                <div className="flex gap-1">
                   <span className="bg-white px-2 py-1 rounded-lg border shadow-sm text-orange-600">👆</span>
                </div>
                <span>Drag to guide the Fox!</span>
             </div>
             <div className="flex items-center gap-2">
                <span>Avoid wrong letters!</span>
                <span className="text-lg">🛑</span>
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

export default SpellingModal;
