import React, { useMemo, useState, useCallback } from 'react';
import { WordEntry } from '../types';
import type { WordPracticeResult } from '../lib/supabaseQueries';
import { formatWordForDisplay } from '../lib/wordDisplay';

interface SentenceNinjaModalProps {
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

function makeSentenceBlank(example: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  if (re.test(example)) return example.replace(re, '_____');
  return `Choose the best word: "${example}"`;
}

const SentenceNinjaModal: React.FC<SentenceNinjaModalProps> = ({ wordEntries, onClose, onFinish }) => {
  const [phase, setPhase] = useState<'preview' | 'playing' | 'feedback'>('preview');
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [wordResults, setWordResults] = useState<WordPracticeResult[]>([]);
  const [hadMistakeOnCurrentWord, setHadMistakeOnCurrentWord] = useState(false);
  const [feedback, setFeedback] = useState<{ correct: boolean; text: string } | null>(null);

  const questions = useMemo(() => {
    return wordEntries.map(target => {
      const distractors = shuffle(
        wordEntries
          .filter(w => w.id !== target.id)
          .map(w => w.word)
      ).slice(0, 3);
      const options = shuffle([target.word, ...distractors]);
      return {
        target,
        sentence: makeSentenceBlank(target.example, target.word),
        options
      };
    });
  }, [wordEntries]);

  const current = questions[index];

  const handleClose = useCallback(() => {
    onFinish(score, wordResults);
    onClose();
  }, [score, wordResults, onFinish, onClose]);

  const handleOption = (opt: string) => {
    if (!current || feedback) return;
    const isCorrect = opt.toLowerCase() === current.target.word.toLowerCase();
    if (isCorrect) {
      setScore(s => s + 100);
      setFeedback({
        correct: true,
        text: `Great choice. "${formatWordForDisplay(current.target.word)}" fits best here.`
      });
    } else {
      setHadMistakeOnCurrentWord(true);
      setFeedback({
        correct: false,
        text: `Not quite. Hint: ${current.target.definition}`
      });
    }
  };

  const next = () => {
    if (!current) return;
    if (feedback?.correct) {
      const result: WordPracticeResult = {
        wordId: current.target.id,
        word: current.target.word,
        correct: !hadMistakeOnCurrentWord
      };
      const nextResults = [...wordResults, result];
      setWordResults(nextResults);
      setHadMistakeOnCurrentWord(false);
      setFeedback(null);
      if (index + 1 >= questions.length) {
        onFinish(score, nextResults);
        return;
      }
      setIndex(i => i + 1);
      return;
    }
    setFeedback(null);
  };

  if (!current && questions.length === 0) {
    return (
      <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-sm z-[100] flex items-center justify-center">
        <p className="text-white font-bold">No words available.</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4 min-h-dvh overflow-y-auto">
      <div className="bg-white rounded-2xl sm:rounded-[2.5rem] max-w-3xl w-full shadow-2xl overflow-hidden border-4 sm:border-8 border-indigo-400 flex flex-col min-h-0 max-h-[calc(100dvh-1rem)] my-auto">
        <div className="px-4 sm:px-8 py-2 sm:py-4 flex justify-between items-center shrink-0 bg-indigo-400 text-indigo-950">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="text-xl sm:text-2xl shrink-0">🥷</span>
            <span className="font-black uppercase tracking-tight text-sm sm:text-base truncate">Sentence Ninja</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <span className="font-bold bg-white/30 px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs">Points: {score}</span>
            <button onClick={handleClose} className="hover:rotate-90 transition-transform p-1" aria-label="Close">
              <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6 bg-indigo-50 flex-1 min-h-0 overflow-y-auto">
          {phase === 'preview' && (
            <div className="space-y-5">
              <h3 className="text-2xl sm:text-3xl font-black text-indigo-900">Memorise these words and meanings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {wordEntries.map(w => (
                  <div key={w.id} className="bg-white border-2 border-indigo-200 rounded-2xl p-4">
                    <div className="font-black text-lg text-indigo-900">{formatWordForDisplay(w.word)}</div>
                    <div className="text-sm text-gray-700 mt-1">{w.definition}</div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPhase('playing')}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xl shadow-lg hover:bg-indigo-700 transition-all"
              >
                I am ready
              </button>
            </div>
          )}

          {phase === 'playing' && current && (
            <div className="space-y-6">
              <div className="text-xs sm:text-sm font-black uppercase tracking-widest text-indigo-600">
                Sentence {index + 1} of {questions.length}
              </div>
              <div className="bg-white border-2 border-indigo-200 rounded-2xl p-5 sm:p-6 text-lg sm:text-2xl text-gray-900 font-bold">
                {current.sentence}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {current.options.map(opt => (
                  <button
                    key={opt}
                    onClick={() => handleOption(opt)}
                    className="bg-white border-2 border-indigo-300 text-indigo-900 rounded-2xl py-4 px-4 text-lg font-black hover:bg-indigo-100 active:scale-95 transition-all"
                  >
                    {formatWordForDisplay(opt)}
                  </button>
                ))}
              </div>
              {feedback && (
                <div className={`rounded-2xl p-4 border-2 ${feedback.correct ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-orange-50 border-orange-300 text-orange-800'}`}>
                  <div className="font-bold mb-3">{feedback.text}</div>
                  <button
                    onClick={next}
                    className={`px-6 py-3 rounded-xl font-black text-white ${feedback.correct ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-orange-600 hover:bg-orange-700'}`}
                  >
                    {feedback.correct ? (index + 1 === questions.length ? 'Finish' : 'Next sentence') : 'Try again'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SentenceNinjaModal;

