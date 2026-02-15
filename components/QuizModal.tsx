
import React, { useState, useEffect, useRef } from 'react';
import { generateQuizQuestions } from '../geminiService';

interface Question {
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface QuizModalProps {
  words: string[];
  onClose: () => void;
  onFinish: (points: number) => void;
}

interface Bubble {
  id: number;
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
}

const QuizModal: React.FC<QuizModalProps> = ({ words, onClose, onFinish }) => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<{ correct: boolean, text: string } | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const requestRef = useRef<number>(null);

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const data = await generateQuizQuestions(words);
        setQuestions(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchQuiz();
  }, [words]);

  useEffect(() => {
    if (!loading && questions.length > 0 && !feedback) {
      const current = questions[currentIndex];
      const colors = ['bg-rose-400', 'bg-sky-400', 'bg-emerald-400', 'bg-amber-400'];
      const newBubbles = current.options.map((opt, i) => ({
        id: i,
        text: opt,
        x: 10 + Math.random() * 80,
        y: 20 + Math.random() * 40,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        color: colors[i % colors.length]
      }));
      setBubbles(newBubbles);

      const animate = () => {
        setBubbles(prev => prev.map(b => {
          let nx = b.x + b.vx;
          let ny = b.y + b.vy;
          let nvx = b.vx;
          let nvy = b.vy;

          if (nx < 5 || nx > 95) nvx *= -1;
          if (ny < 5 || ny > 85) nvy *= -1;

          return { ...b, x: nx, y: ny, vx: nvx, vy: nvy };
        }));
        requestRef.current = requestAnimationFrame(animate);
      };
      requestRef.current = requestAnimationFrame(animate);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [loading, currentIndex, feedback]);

  const handlePop = (bubble: Bubble) => {
    if (feedback) return;
    const isCorrect = bubble.text === questions[currentIndex].answer;
    if (isCorrect) setScore(s => s + 100);
    setFeedback({
      correct: isCorrect,
      text: questions[currentIndex].explanation
    });
  };

  const nextQuestion = () => {
    setFeedback(null);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onFinish(score);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-12 text-center max-w-sm w-full shadow-2xl">
          <div className="animate-bounce mb-6 inline-block">
            <span className="text-6xl">🎈</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Inflating Bubbles...</h2>
          <p className="text-gray-500">Preparing your shooting quest!</p>
        </div>
      </div>
    );
  }

  const current = questions[currentIndex];

  return (
    <div className="fixed inset-0 bg-indigo-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2.5rem] max-w-3xl w-full h-[650px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300 border-8 border-indigo-400">
        <div className="bg-indigo-400 px-8 py-4 flex justify-between items-center text-white">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎯</span>
            <span className="font-black uppercase tracking-wider">Bubble Pop Quiz</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="font-bold text-sm bg-white/20 px-3 py-1 rounded-full">Question {currentIndex + 1}/{questions.length}</span>
            <button onClick={onClose} className="hover:rotate-90 transition-transform">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="flex-grow relative bg-sky-50 overflow-hidden">
          {/* Question Header */}
          <div className="absolute top-0 left-0 right-0 p-8 text-center bg-white/60 backdrop-blur-sm border-b border-indigo-100 z-20">
             <h3 className="text-2xl font-black text-gray-800 leading-tight">
              {current.question}
            </h3>
          </div>

          {/* Shooting Gallery */}
          {!feedback && bubbles.map((b) => (
            <button
              key={b.id}
              onClick={() => handlePop(b)}
              className={`absolute transform -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full flex items-center justify-center p-4 text-center font-bold text-white shadow-xl transition-transform hover:scale-110 active:scale-90 select-none ${b.color} border-4 border-white/30`}
              style={{ left: `${b.x}%`, top: `${b.y + 20}%` }}
            >
              <span className="drop-shadow-md text-sm leading-tight">{b.text}</span>
              <div className="absolute top-4 left-6 w-4 h-2 bg-white/40 rounded-full transform -rotate-45"></div>
            </button>
          ))}

          {/* Feedback Modal Overlay */}
          {feedback && (
            <div className="absolute inset-0 bg-white/90 backdrop-blur-md z-30 flex items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
              <div className="text-center max-w-md">
                <div className="text-7xl mb-4">{feedback.correct ? '🌟' : '💡'}</div>
                <h4 className={`text-4xl font-black mb-2 ${feedback.correct ? 'text-emerald-600' : 'text-orange-600'}`}>
                  {feedback.correct ? 'GREAT SHOT!' : 'LEARNING MOMENT'}
                </h4>
                <p className="text-gray-600 text-lg mb-8 font-medium italic">
                  {feedback.text}
                </p>
                <button 
                  onClick={nextQuestion}
                  className="w-full bg-indigo-600 text-white py-5 rounded-[2rem] font-black text-2xl shadow-xl hover:bg-indigo-700 transition-all hover:scale-105 active:scale-95"
                >
                  {currentIndex + 1 === questions.length ? 'CLAIM REWARDS 🍯' : 'NEXT TARGET 🎯'}
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="bg-white p-4 border-t flex justify-center items-center gap-12 font-bold text-indigo-900">
          <div className="flex items-center gap-2">
            <span className="text-yellow-500 text-xl">⭐</span>
            <span>SCORE: {score}</span>
          </div>
          <div className="text-xs text-gray-400 uppercase tracking-widest">Shoot the correct answer bubble!</div>
        </div>
      </div>
    </div>
  );
};

export default QuizModal;
