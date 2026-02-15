
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { WordEntry } from '../types';
import { speakText } from '../geminiService';

interface SpellingBeeModalProps {
  wordEntries: WordEntry[];
  onClose: () => void;
  onFinish: (points: number) => void;
}

// Map common letter pronunciations (en-GB) and frequent misrecognitions to the letter (each key once)
const LETTER_PRONUNCIATIONS: Record<string, string> = {
  a: 'A', aye: 'A', ay: 'A', aah: 'A',
  b: 'B', bee: 'B', be: 'B', bea: 'B',
  c: 'C', see: 'C', cee: 'C', sea: 'C',
  d: 'D', dee: 'D', de: 'D', da: 'D',
  e: 'E', ee: 'E', eh: 'E', ea: 'E',
  f: 'F', eff: 'F', if: 'F',
  g: 'G', gee: 'G', ji: 'G',
  h: 'H', aitch: 'H', haych: 'H',
  i: 'I', eye: 'I',
  j: 'J', jay: 'J', ja: 'J',
  k: 'K', kay: 'K', ok: 'K',
  l: 'L', el: 'L', ell: 'L', al: 'L',
  m: 'M', em: 'M', me: 'M', am: 'M',
  n: 'N', en: 'N', an: 'N', in: 'N',
  o: 'O', oh: 'O', ow: 'O',
  p: 'P', pee: 'P', pea: 'P', pa: 'P',
  q: 'Q', cue: 'Q', queue: 'Q', kew: 'Q',
  r: 'R', ar: 'R', ah: 'R', are: 'R', or: 'R',
  s: 'S', ess: 'S', es: 'S', is: 'S', as: 'S',
  t: 'T', tee: 'T', tea: 'T', the: 'T', ta: 'T',
  u: 'U', you: 'U', yew: 'U', yoo: 'U',
  v: 'V', vee: 'V', ve: 'V',
  w: 'W', double: 'W', doubleyou: 'W', dubya: 'W', doubleu: 'W',
  x: 'X', ex: 'X', ax: 'X',
  y: 'Y', why: 'Y', wye: 'Y', wy: 'Y',
  z: 'Z', zed: 'Z', zee: 'Z', ze: 'Z',
};

function transcriptToLetter(transcript: string): string | null {
  const t = transcript.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  // Single letter A–Z
  if (t.length === 1 && t >= 'a' && t <= 'z') return t.toUpperCase();
  // One word: check pronunciations
  const word = t.replace(/\s/g, '');
  const letter = LETTER_PRONUNCIATIONS[word] || LETTER_PRONUNCIATIONS[t];
  if (letter) return letter;
  // First character if it's a letter
  const first = t[0];
  if (first >= 'a' && first <= 'z') return first.toUpperCase();
  return null;
}

/** From a final result, pick the best letter: prefer one that matches expectedLetter if any alternative does. */
function pickLetterFromResult(
  result: SpeechRecognitionResult,
  expectedLetter: string
): string | null {
  let firstValid: string | null = null;
  for (let i = 0; i < result.length; i++) {
    const transcript = result[i]?.transcript ?? '';
    const letter = transcriptToLetter(transcript);
    if (letter) {
      if (firstValid === null) firstValid = letter;
      if (letter === expectedLetter) return letter;
    }
  }
  return firstValid;
}

const SpellingBeeModal: React.FC<SpellingBeeModalProps> = ({ wordEntries, onClose, onFinish }) => {
  const [queue, setQueue] = useState<WordEntry[]>(() => [...wordEntries]);
  const [hadMistakeOnCurrentWord, setHadMistakeOnCurrentWord] = useState(false);
  const [advanceCounter, setAdvanceCounter] = useState(0);

  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'preview' | 'speaking' | 'feedback' | 'starting'>(
    wordEntries.length > 0 ? 'preview' : 'starting'
  );
  /** Each slot: the letter the student said and whether it was correct (green) or wrong (red). */
  const [spokenLetters, setSpokenLetters] = useState<Array<{ letter: string; correct: boolean }>>([]);
  const [isListening, setIsListening] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  /** Shown when recognition ended without capturing a letter (so user knows they can try again). */
  const [showDidntCatch, setShowDidntCatch] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isProcessingRef = useRef(false);
  const capturedThisSessionRef = useRef(false);
  const stateRef = useRef({ targetLetters: [] as string[], spokenLength: 0 });

  const currentWord = queue[0];
  const targetLetters = currentWord ? currentWord.word.toUpperCase().split('') : [];
  stateRef.current = { targetLetters, spokenLength: spokenLetters.length };
  const nextLetterIndex = spokenLetters.length;

  const handleSpeakWord = useCallback(async () => {
    if (!currentWord) return;
    await speakText(`${currentWord.word}... ${currentWord.word}`);
  }, [currentWord]);

  const startListening = useCallback(() => {
    const SpeechRecognitionAPI = typeof window !== 'undefined' &&
      (window.SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition);
    if (!SpeechRecognitionAPI) {
      console.warn('Speech recognition not supported');
      return;
    }
    setShowDidntCatch(false);
    capturedThisSessionRef.current = false;

    const recognition = new SpeechRecognitionAPI();
    // Continuous = keeps listening until we hear something (avoids cutting off after a short pause)
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-GB';
    recognition.maxAlternatives = 5;

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      if (capturedThisSessionRef.current) return;
      const results = e.results;
      const { targetLetters: tLetters, spokenLength: len } = stateRef.current;
      const expected = tLetters[len];
      if (!expected) return;
      // Try the latest final result first; if no letter, try previous final results (engine sometimes sends empty last)
      let letter: string | null = null;
      for (let i = results.length - 1; i >= 0; i--) {
        const r = results[i];
        if (r.isFinal) {
          letter = pickLetterFromResult(r, expected);
          if (letter) break;
        }
      }
      if (!letter || isProcessingRef.current) return;
      isProcessingRef.current = true;
      capturedThisSessionRef.current = true;
      try {
        recognitionRef.current?.stop();
      } catch (_) {}
      const correct = letter === expected;
      setSpokenLetters(prev => {
        const next = [...prev, { letter, correct }];
        if (next.length === tLetters.length) {
          setGameState('feedback');
          setScore(s => s + 10 * next.length + 200);
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
      setIsListening(false);
      setTimeout(() => { isProcessingRef.current = false; }, 100);
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null; // Force fresh instance next time after error
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
      if (!capturedThisSessionRef.current) {
        setShowDidntCatch(true);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const resetLevel = useCallback(() => {
    if (!currentWord) return;
    setSpokenLetters([]);
    setShowDidntCatch(false);
    setGameState('preview');
    stopListening();
  }, [currentWord, stopListening]);

  useEffect(() => {
    if (currentWord) resetLevel();
  }, [advanceCounter, resetLevel]);

  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  const nextWord = () => {
    stopListening();
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
    setGameState('speaking');
    handleSpeakWord();
    setTimeout(() => startListening(), 600);
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

        <div className="p-3 sm:p-6 bg-amber-50 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-2 sm:mb-4 bg-white p-2 sm:p-4 rounded-2xl sm:rounded-3xl border-2 border-amber-200 shadow-sm shrink-0">
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[9px] sm:text-[10px] font-black text-amber-600 uppercase tracking-widest">What you said — green = correct, red = wrong</span>
              <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto flex-wrap">
                {targetLetters.map((_, i) => (
                  <span
                    key={i}
                    className={`text-xl sm:text-3xl font-black tracking-widest font-mono px-1 ${
                      i >= spokenLetters.length ? 'text-gray-300' : spokenLetters[i].correct ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {i < spokenLetters.length ? spokenLetters[i].letter : ' _ '}
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
                      SAY THE LETTERS 🎤
                    </button>
                    <p className="mt-4 sm:mt-6 text-xs sm:text-sm opacity-60 font-bold uppercase tracking-widest shrink-0">Say each letter out loud</p>
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

              {gameState === 'speaking' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 sm:p-6 z-20 overflow-auto">
                  <div className="text-5xl sm:text-8xl mb-3 sm:mb-4">{isListening ? '🎤' : '🐝'}</div>
                  <h3 className="text-lg sm:text-2xl font-black text-amber-900 mb-1 text-center">
                    {isListening ? 'Say one letter now' : 'Stopped listening'}
                  </h3>
                  <p className="text-sm sm:text-base text-amber-700 font-bold mb-2 text-center max-w-sm">
                    {isListening
                      ? 'Say the letter clearly. The app will keep listening until it hears you — no rush.'
                      : 'Tap the button below when you\'re ready for the app to listen again.'}
                  </p>
                  {showDidntCatch && (
                    <p className="text-sm font-bold text-amber-800 bg-amber-200/80 px-4 py-2 rounded-xl mb-3">
                      Didn&apos;t catch that. Tap Next letter to try again.
                    </p>
                  )}
                  <p className="text-xs text-amber-600 font-bold mb-4">
                    Letter {nextLetterIndex + 1} of {targetLetters.length}
                  </p>
                  <button
                    onClick={isListening ? stopListening : startListening}
                    className={`px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-black text-base sm:text-lg shadow-xl transition-all ${isListening ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
                  >
                    {isListening ? 'Stop' : 'Next letter'}
                  </button>
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
              <span className="bg-white px-2 py-1 rounded-lg border shadow-sm text-amber-600">🎤</span>
              <span>Say each letter clearly</span>
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
