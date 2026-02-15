
import React, { useState, useEffect } from 'react';
import { WordEntry } from '../types';
import { speakTextWithBrowser } from '../geminiService';

interface FlashcardQuestProps {
  word: WordEntry;
  onClose: () => void;
  onStartQuiz: (word: WordEntry) => void;
  onStartSpelling: (word: WordEntry) => void;
}

type Step = 'word' | 'meaning' | 'example' | 'synonyms' | 'antonyms';

const FlashcardQuest: React.FC<FlashcardQuestProps> = ({ word, onClose, onStartQuiz, onStartSpelling }) => {
  const [step, setStep] = useState<Step>('word');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeLetterIndex, setActiveLetterIndex] = useState<number>(-1);

  const steps: Step[] = ['word', 'meaning', 'example', 'synonyms', 'antonyms'];
  const currentStepIndex = steps.indexOf(step);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setStep(steps[currentStepIndex + 1]);
    }
  };

  const handlePrev = () => {
    if (currentStepIndex > 0) {
      setStep(steps[currentStepIndex - 1]);
    }
  };

  /**
   * Triggers the enhanced "Spelling Bee" audio for Step 1.
   */
  const handleSpeakSpelling = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    
    const letters = word.word.toUpperCase().split('');
    const spellingString = letters.join('... ');
    const fullPrompt = `${word.word}... ${spellingString}... ${word.word}`;
    
    let timer: any;
    const startSpellingVisuals = () => {
      let i = 0;
      timer = setInterval(() => {
        if (i < letters.length) {
          setActiveLetterIndex(i);
          i++;
        } else {
          setActiveLetterIndex(-1);
          clearInterval(timer);
        }
      }, 700);
    };

    setTimeout(startSpellingVisuals, 1000);
    await speakTextWithBrowser(fullPrompt);
    
    clearInterval(timer);
    setActiveLetterIndex(-1);
    setIsSpeaking(false);
  };

  /**
   * Triggers audio for the word's definition in Step 2.
   */
  const handleSpeakMeaning = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    const fullPrompt = `The meaning of ${word.word} is: ${word.definition}`;
    await speakTextWithBrowser(fullPrompt);
    setIsSpeaking(false);
  };

  /**
   * Triggers audio for the example sentence in Step 3.
   */
  const handleSpeakExample = async () => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    const fullPrompt = `Here is an example sentence: ${word.example}`;
    await speakTextWithBrowser(fullPrompt);
    setIsSpeaking(false);
  };

  // Auto-play sound on step changes (short delay so it stays within browser "user gesture" for autoplay)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (step === 'word') {
        handleSpeakSpelling();
      } else if (step === 'meaning') {
        handleSpeakMeaning();
      } else if (step === 'example') {
        handleSpeakExample();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [step]);

  const renderContent = () => {
    switch (step) {
      case 'word':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in zoom-in-95 duration-300">
            <div className="flex flex-wrap justify-center gap-1 md:gap-2">
              {word.word.split('').map((char, idx) => (
                <span 
                  key={idx} 
                  className={`text-5xl md:text-7xl font-black transition-all duration-300 transform rounded-xl px-1 md:px-2 ${
                    activeLetterIndex === idx 
                    ? 'text-orange-500 scale-125 bg-orange-50 shadow-lg' 
                    : 'text-indigo-900'
                  }`}
                >
                  {char}
                </span>
              ))}
            </div>
            
            <button 
              onClick={handleSpeakSpelling}
              disabled={isSpeaking}
              className={`p-6 rounded-full transition-all group relative ${
                isSpeaking && step === 'word'
                ? 'bg-orange-500 text-white animate-pulse' 
                : 'bg-indigo-100 text-indigo-600 hover:scale-110 hover:bg-orange-100 hover:text-orange-600 shadow-xl'
              }`}
            >
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-indigo-900 text-white text-[10px] font-bold px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-widest whitespace-nowrap">
                Hear it Spelled!
              </div>
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
              </svg>
            </button>
            
            <div className="text-center">
              <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-1">Step 1: Spelling & Sound</p>
              <p className="text-orange-600 font-black text-sm uppercase animate-pulse">
                {isSpeaking && step === 'word' ? "Listen to the Fox's Spelling Quest..." : "Tap the Fox to Listen!"}
              </p>
            </div>
          </div>
        );
      case 'meaning':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-in slide-in-from-right-8 duration-300">
            <div className="bg-indigo-50 p-4 rounded-3xl mb-4 relative">
              <span className="text-4xl">💡</span>
              {isSpeaking && step === 'meaning' && (
                <div className="absolute inset-0 border-4 border-indigo-400 rounded-3xl animate-ping opacity-20"></div>
              )}
            </div>
            <h3 className="text-3xl font-bold text-gray-800 leading-tight px-4 max-w-xl mx-auto">
              {word.definition}
            </h3>
            
            <button 
              onClick={handleSpeakMeaning}
              disabled={isSpeaking}
              className={`p-4 rounded-2xl transition-all group flex items-center gap-3 ${
                isSpeaking && step === 'meaning'
                ? 'bg-indigo-600 text-white animate-pulse' 
                : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 shadow-md'
              }`}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
              </svg>
              <span className="font-bold text-sm uppercase tracking-wide">
                {isSpeaking && step === 'meaning' ? "Reading definition..." : "Listen to Meaning"}
              </span>
            </button>

            <p className="text-indigo-400 font-bold uppercase tracking-widest text-sm">Step 2: The Meaning</p>
          </div>
        );
      case 'example':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-in slide-in-from-right-8 duration-300">
            <div className="bg-amber-50 p-4 rounded-3xl mb-4 relative">
              <span className="text-4xl">📖</span>
              {isSpeaking && step === 'example' && (
                <div className="absolute inset-0 border-4 border-amber-400 rounded-3xl animate-ping opacity-20"></div>
              )}
            </div>
            <p className="text-2xl italic text-amber-900 leading-relaxed px-8 font-serif max-w-2xl mx-auto">
              "{word.example}"
            </p>

            <button 
              onClick={handleSpeakExample}
              disabled={isSpeaking}
              className={`p-4 rounded-2xl transition-all group flex items-center gap-3 ${
                isSpeaking && step === 'example'
                ? 'bg-amber-600 text-white animate-pulse' 
                : 'bg-amber-50 text-amber-600 hover:bg-amber-100 shadow-md'
              }`}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217z" />
              </svg>
              <span className="font-bold text-sm uppercase tracking-wide">
                {isSpeaking && step === 'example' ? "Reading example..." : "Listen to Sentence"}
              </span>
            </button>

            <p className="text-amber-500 font-bold uppercase tracking-widest text-sm">Step 3: Literary Context</p>
          </div>
        );
      case 'synonyms':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-in slide-in-from-right-8 duration-300">
            <div className="bg-emerald-50 p-4 rounded-3xl mb-4">
              <span className="text-4xl">👯</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {word.synonyms.map(s => (
                <span key={s} className="bg-emerald-100 text-emerald-800 px-6 py-3 rounded-2xl text-2xl font-bold shadow-sm border border-emerald-200">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-emerald-500 font-bold uppercase tracking-widest text-sm">Step 4: Synonyms (Same meaning)</p>
          </div>
        );
      case 'antonyms':
        return (
          <div className="flex flex-col items-center justify-center h-full space-y-6 text-center animate-in slide-in-from-right-8 duration-300">
            <div className="bg-rose-50 p-4 rounded-3xl mb-2">
              <span className="text-4xl">↔️</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {word.antonyms.map(a => (
                <span key={a} className="bg-rose-100 text-rose-800 px-6 py-3 rounded-2xl text-2xl font-bold shadow-sm border border-rose-200">
                  {a}
                </span>
              ))}
            </div>
            <p className="text-rose-500 font-bold uppercase tracking-widest text-sm mb-4">Step 5: Antonyms (Opposite meaning)</p>
            
            <div className="flex flex-col gap-4 w-full max-w-md">
              <button 
                onClick={() => onStartQuiz(word)}
                className="bg-indigo-600 text-white px-8 py-4 rounded-[1.5rem] font-black text-xl shadow-lg hover:bg-indigo-700 hover:scale-105 transition-all flex items-center justify-center gap-3"
              >
                <span>🎯</span> TAKE A QUIZ
              </button>
              <button 
                onClick={() => onStartSpelling(word)}
                className="bg-orange-500 text-white px-8 py-4 rounded-[1.5rem] font-black text-xl shadow-lg hover:bg-orange-600 hover:scale-105 transition-all flex items-center justify-center gap-3"
              >
                <span>🐍</span> SPELLING SNAKE
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-indigo-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-[3rem] max-w-3xl w-full h-[600px] shadow-2xl overflow-hidden flex flex-col relative border-8 border-white">
        
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-gray-100 flex">
          {steps.map((_, i) => (
            <div 
              key={i} 
              className={`flex-1 transition-all duration-500 ${i <= currentStepIndex ? 'bg-orange-500' : 'bg-transparent'}`}
            />
          ))}
        </div>

        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-gray-400 hover:text-gray-600 transition-colors z-20"
        >
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex-grow p-8 md:p-12 overflow-hidden relative">
           {renderContent()}
        </div>

        <div className="p-8 bg-gray-50 flex justify-between items-center border-t border-gray-100">
          <button 
            onClick={handlePrev}
            disabled={currentStepIndex === 0}
            className={`flex items-center gap-2 font-bold px-6 py-2 rounded-xl transition-all ${currentStepIndex === 0 ? 'text-gray-300' : 'text-indigo-600 hover:bg-indigo-100'}`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
            PREVIOUS
          </button>

          <div className="flex gap-2">
            {steps.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full ${i === currentStepIndex ? 'bg-orange-500 w-6' : 'bg-gray-200'} transition-all`} />
            ))}
          </div>

          <button 
            onClick={handleNext}
            disabled={currentStepIndex === steps.length - 1}
            className={`flex items-center gap-2 font-bold px-6 py-2 rounded-xl transition-all ${currentStepIndex === steps.length - 1 ? 'text-gray-300' : 'text-indigo-600 hover:bg-indigo-100'}`}
          >
            NEXT
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default FlashcardQuest;
