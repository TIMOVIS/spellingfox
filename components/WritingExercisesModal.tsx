import React, { useState, useCallback } from 'react';
import type { WordEntry } from '../types';
import { WRITING_EXERCISE_TYPES, getWritingExerciseMeta } from '../lib/writingExerciseTypes';
import { generateWritingExercises, type GeneratedWritingExerciseItem } from '../geminiService';
import { formatWordForDisplay } from '../lib/wordDisplay';
import { insertStudentAssignments } from '../lib/supabaseQueries';

const MAX_WORDS = 12;

interface WritingExercisesModalProps {
  open: boolean;
  onClose: () => void;
  selectedWords: WordEntry[];
  /** When set, teacher can send generated exercises to this student’s dashboard. */
  assignStudentId?: string;
  assignStudentName?: string;
  onAssigned?: () => void;
}

const WritingExercisesModal: React.FC<WritingExercisesModalProps> = ({
  open,
  onClose,
  selectedWords,
  assignStudentId,
  assignStudentName,
  onAssigned,
}) => {
  const [typeIds, setTypeIds] = useState<Set<string>>(() => new Set(WRITING_EXERCISE_TYPES.map(t => t.id)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<GeneratedWritingExerciseItem[] | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  const toggleType = useCallback((id: string) => {
    setTypeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllTypes = () => setTypeIds(new Set(WRITING_EXERCISE_TYPES.map(t => t.id)));
  const clearAllTypes = () => setTypeIds(new Set());

  const handleGenerate = async () => {
    const words = selectedWords.slice(0, MAX_WORDS);
    const ids = [...typeIds];
    if (words.length === 0) {
      setError('Select at least one word in the word bank table.');
      return;
    }
    if (ids.length === 0) {
      setError('Choose at least one exercise type.');
      return;
    }
    setLoading(true);
    setError(null);
    setItems(null);
    try {
      const result = await generateWritingExercises(words, ids);
      setItems(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to generate exercises.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAssignToStudent = async () => {
    if (!assignStudentId || !items?.length) return;
    setAssigning(true);
    setAssignMessage(null);
    try {
      await insertStudentAssignments(
        assignStudentId,
        items.map((item, i) => ({
          exercise_type: item.exerciseType,
          title: item.title?.trim() || getWritingExerciseMeta(item.exerciseType)?.label || 'Writing exercise',
          student_instructions: item.studentInstructions,
          main_content: item.mainContent,
          options: item.options?.length ? item.options : [],
          sort_order: i,
        }))
      );
      setAssignMessage(`Assigned ${items.length} exercise${items.length !== 1 ? 's' : ''} to ${assignStudentName || 'student'}.`);
      onAssigned?.();
    } catch (e: unknown) {
      setAssignMessage(e instanceof Error ? e.message : 'Could not assign exercises.');
    } finally {
      setAssigning(false);
    }
  };

  const handleClose = () => {
    if (!loading && !assigning) {
      setItems(null);
      setError(null);
      setAssignMessage(null);
      onClose();
    }
  };

  if (!open) return null;

  const wordsForGen = selectedWords.slice(0, MAX_WORDS);
  const truncated = selectedWords.length > MAX_WORDS;

  return (
    <div className="writing-ex-modal-root fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 print:static print:inset-auto print:min-h-0 print:bg-white print:p-0">
      <style>{`
        @media print {
          .writing-ex-modal-root { background: white !important; }
          .writing-ex-modal-root .no-print { display: none !important; }
        }
      `}</style>
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden flex flex-col print:shadow-none print:max-w-none print:max-h-none print:rounded-none print:overflow-visible">
        <div className="no-print shrink-0 border-b px-6 py-4 flex items-center justify-between gap-3 bg-gradient-to-r from-emerald-50 to-teal-50">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Writing exercises</h2>
            <p className="text-xs text-gray-600 font-medium mt-0.5">
              From selected vocabulary · British English · printable
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-800 p-2 rounded-xl hover:bg-white/80 disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 print:overflow-visible">
          {!items && (
            <>
              <div className="no-print rounded-2xl border-2 border-gray-100 bg-gray-50/80 p-4">
                <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Target words</p>
                {selectedWords.length === 0 ? (
                  <p className="text-sm text-amber-800 font-bold">No words selected. Close and tick words in the directory.</p>
                ) : (
                  <>
                    <ul className="flex flex-wrap gap-2">
                      {wordsForGen.map(w => (
                        <li
                          key={w.id}
                          className="bg-white border border-gray-200 px-3 py-1 rounded-full text-sm font-black text-gray-800"
                        >
                          {formatWordForDisplay(w.word)}
                        </li>
                      ))}
                    </ul>
                    {truncated && (
                      <p className="text-xs text-amber-700 font-bold mt-2">
                        Only the first {MAX_WORDS} selected words are sent to the AI.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="no-print">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Exercise types</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllTypes}
                      className="text-xs font-bold text-emerald-700 hover:underline"
                    >
                      All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      type="button"
                      onClick={clearAllTypes}
                      className="text-xs font-bold text-gray-500 hover:underline"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border-2 border-gray-100 rounded-2xl p-3">
                  {WRITING_EXERCISE_TYPES.map(t => (
                    <label
                      key={t.id}
                      className="flex items-start gap-2 text-sm cursor-pointer text-gray-800 hover:bg-emerald-50/50 rounded-lg p-1.5"
                    >
                      <input
                        type="checkbox"
                        checked={typeIds.has(t.id)}
                        onChange={() => toggleType(t.id)}
                        className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="font-bold">{t.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="no-print rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-bold px-4 py-3">
                  {error}
                </div>
              )}

              <div className="no-print flex flex-wrap gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={loading || selectedWords.length === 0 || typeIds.size === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-2xl font-black shadow-md transition-all disabled:cursor-not-allowed"
                >
                  {loading ? 'Generating…' : 'Generate with AI'}
                </button>
              </div>
            </>
          )}

          {items && items.length > 0 && (
            <div className="print-exercise-sheet space-y-8 print:space-y-6">
              <div className="no-print flex flex-wrap gap-2 border-b pb-4">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="bg-gray-900 text-white px-5 py-2.5 rounded-xl font-black text-sm hover:bg-gray-800"
                >
                  Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setItems(null)}
                  className="bg-white border-2 border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-black text-sm hover:bg-gray-50"
                >
                  Back to options
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-gray-500 font-bold px-4 py-2.5 text-sm hover:text-gray-800"
                >
                  Close
                </button>
                {assignStudentId && (
                  <button
                    type="button"
                    onClick={handleAssignToStudent}
                    disabled={assigning}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-black text-sm shadow-sm"
                  >
                    {assigning ? 'Assigning…' : `Assign to ${assignStudentName || 'student'}`}
                  </button>
                )}
              </div>
              {assignMessage && (
                <p className="no-print text-sm font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2 mt-2">
                  {assignMessage}
                </p>
              )}

              <header className="border-b-2 border-gray-200 pb-4 print:border-gray-400">
                <h1 className="text-2xl font-black text-gray-900 print:text-black">Writing worksheet</h1>
                <p className="text-sm text-gray-600 mt-1 print:text-gray-800">
                  Words: {wordsForGen.map(w => formatWordForDisplay(w.word)).join(', ')}
                </p>
              </header>

              {items.map((item, idx) => {
                const meta = getWritingExerciseMeta(item.exerciseType);
                return (
                  <article
                    key={`${item.exerciseType}-${idx}`}
                    className="break-inside-avoid border-2 border-gray-100 rounded-2xl p-5 print:border-gray-300 print:rounded-none"
                  >
                    <h3 className="text-lg font-black text-emerald-900 print:text-black">
                      {idx + 1}. {meta?.label ?? item.title}
                    </h3>
                    {item.title && meta && item.title !== meta.label && (
                      <p className="text-xs font-bold text-gray-500 mt-0.5">{item.title}</p>
                    )}
                    <p className="text-sm font-bold text-gray-800 mt-3 whitespace-pre-wrap">{item.studentInstructions}</p>
                    <div className="mt-4 bg-gray-50 rounded-xl p-4 border border-gray-100 print:bg-white print:border-gray-200">
                      <p className="text-sm text-gray-900 whitespace-pre-wrap font-medium leading-relaxed">{item.mainContent}</p>
                    </div>
                    {item.options && item.options.length > 0 && (
                      <ol className="mt-3 list-decimal list-inside space-y-1 text-sm font-bold text-gray-800">
                        {item.options.map((opt, i) => (
                          <li key={i}>{opt}</li>
                        ))}
                      </ol>
                    )}
                    <div className="no-print mt-4 pt-4 border-t border-dashed border-gray-200 text-sm space-y-1">
                      <p>
                        <span className="font-black text-emerald-800">Answer key: </span>
                        <span className="text-gray-800">{item.answerKey}</span>
                      </p>
                      {item.teacherNotes?.trim() && (
                        <p>
                          <span className="font-black text-gray-600">Teacher note: </span>
                          <span className="text-gray-700">{item.teacherNotes}</span>
                        </p>
                      )}
                    </div>
                  </article>
                );
              })}

              <footer className="no-print text-center text-xs text-gray-400 pt-4 border-t">
                Printing hides buttons and answer keys — pupil-friendly sheet. Keep this window open to see keys on screen.
              </footer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WritingExercisesModal;
