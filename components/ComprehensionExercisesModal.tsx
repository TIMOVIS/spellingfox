import React, { useMemo, useState } from 'react';
import type { WordEntry } from '../types';
import { formatWordForDisplay } from '../lib/wordDisplay';
import {
  generateComprehensionExercises,
  type ComprehensionExerciseConfig,
  type GeneratedComprehensionExercise,
} from '../geminiService';
import {
  assignGeneratedComprehensionExercise,
  insertGeneratedComprehensionExercise,
} from '../lib/supabaseQueries';

const MAX_WORDS = 10;

const YEAR_GROUP_OPTIONS = ['Y3', 'Y4', 'Y5', 'Y6'] as const;
const WORD_DIFFICULTY_OPTIONS = ['easy', 'core', 'stretch'] as const;
const SENTENCE_DIFFICULTY_OPTIONS = [
  'mostly_simple',
  'simple_with_some_complex',
  'mixed',
  'more_complex',
] as const;
const GENRE_OPTIONS = [
  'story_narrative',
  'animal_story',
  'adventure_story',
  'mystery_story',
  'historical_fiction',
  'realistic_fiction',
  'myth_legend',
  'diary_entry',
  'letter',
  'information_report',
  'explanation_text',
  'biography',
  'autobiography',
  'instruction_text',
  'persuasive_text',
  'recount',
  'poem',
  'narrative_poem',
  'rhyming_poem',
  'play_script',
] as const;
const TEXT_STRUCTURE_OPTIONS = [
  'linear_narrative',
  'problem_solution',
  'chronological',
  'cause_effect',
  'compare_contrast',
  'description',
  'description_plus_explanation',
  'question_answer',
  'classification',
  'discussion_balance',
] as const;
const TOPIC_OPTIONS = [
  'animals',
  'nature',
  'weather',
  'space',
  'school',
  'family',
  'friendship',
  'history',
  'ancient_civilisations',
  'science',
  'inventions',
  'geography',
  'travel',
  'sport',
  'food',
  'transport',
  'mystery',
  'survival',
  'environment',
  'sea_ocean',
] as const;
const LANGUAGE_STYLE_OPTIONS = [
  'plain_clear',
  'natural',
  'descriptive',
  'informative',
  'formal',
  'humorous',
  'suspenseful',
  'atmospheric',
  'poetic',
] as const;
const BACKGROUND_KNOWLEDGE_LEVEL_OPTIONS = ['low', 'medium', 'high'] as const;
const QUESTION_DIFFICULTY_OPTIONS = ['support', 'core', 'stretch'] as const;
const QUESTION_TYPE_OPTIONS = [
  'retrieval_basic',
  'retrieval_organised',
  'sequencing',
  'vocab_in_context',
  'inference_feelings',
  'inference_motivation',
  'inference_relationship',
  'cause_effect',
  'evidence_selection',
  'main_idea',
  'summary',
  'prediction',
  'language_effect',
  'atmosphere',
  'character_impression',
  'viewpoint',
  'comparison',
  'nonfiction_structure',
  'author_purpose',
  'theme_message',
  'fact_vs_opinion',
  'true_false_cannot_tell',
] as const;
const VR_QUESTION_TYPE_OPTIONS = [
  'synonym',
  'antonym',
  'closest_meaning',
  'odd_one_out_words',
  'alphabetical_order',
  'code_breaking_words',
  'word_pattern',
  'compound_words',
  'prefix_suffix',
  'cloze_word_choice',
  'dictionary_order',
] as const;
const GRAMMAR_QUESTION_TYPE_OPTIONS = [
  'nouns',
  'verbs',
  'adjectives',
  'adverbs',
  'pronouns',
  'determiners',
  'prepositions',
  'conjunctions',
  'past_tense',
  'present_tense',
  'verb_tense_choice',
  'subject_verb_agreement',
  'expanded_noun_phrases',
] as const;
const SENTENCE_QUESTION_TYPE_OPTIONS = [
  'sentence_combining',
  'sentence_expanding',
  'fronted_adverbial',
  'because_sentence',
  'when_sentence',
  'while_sentence',
  'if_sentence',
  'although_sentence',
  'relative_clause',
  'embedded_detail',
  'reorder_sentence',
  'complete_sentence',
  'sentence_imitation',
  'improve_sentence',
  'short_sentence_for_effect',
  'vary_sentence_opening',
  'show_not_tell_sentence',
  'sentence_unpicking',
] as const;
const SUPPORT_SCAFFOLD_LEVEL_OPTIONS = ['independent', 'light_support', 'guided', 'high_support'] as const;
const WRITING_SKILL_FOCUS_OPTIONS = [
  'vocabulary_building',
  'strong_verbs',
  'adjectives_adverbs',
  'expanded_noun_phrases',
  'speech_writing',
  'speech_punctuation',
  'sentence_combining',
  'sentence_variety',
  'fronted_adverbials',
  'paragraphing',
  'show_not_tell',
  'description',
  'diary_writing',
  'viewpoint_writing',
  'summary_writing',
  'nonfiction_explanation',
  'creative_continuation',
] as const;
const WRITER_CRAFT_FEATURE_OPTIONS = [
  'simile',
  'metaphor',
  'personification',
  'alliteration',
  'onomatopoeia',
  'repetition',
  'rule_of_three',
  'sensory_description',
  'imagery',
  'contrast',
  'short_sentence_for_effect',
  'humour',
  'suspense_building',
  'emotive_language',
  'rhetorical_question',
  'direct_address',
] as const;
const PUNCTUATION_FOCUS_OPTIONS = [
  'capital_letters_full_stops',
  'question_marks_exclamation_marks',
  'commas_in_lists',
  'commas_after_fronted_adverbials',
  'apostrophes_contraction',
  'apostrophes_possession',
  'speech_marks',
  'speech_punctuation',
] as const;
const WORD_COUNT_OPTIONS = ['120_180', '180_250', '250_350', '350_500', '500_700'] as const;

type MultiSelectProps = {
  label: string;
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
};

const MultiSelectDropdown: React.FC<MultiSelectProps> = ({ label, options, selected, onChange }) => {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((x) => x !== value));
      return;
    }
    onChange([...selected, value]);
  };

  return (
    <details className="bg-white border-2 border-gray-200 rounded-2xl p-3">
      <summary className="list-none cursor-pointer flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-gray-500 uppercase tracking-wider">{label}</p>
          <p className="text-sm font-bold text-gray-800 mt-1">
            {selected.length > 0 ? `${selected.length} selected` : 'Choose one or more'}
          </p>
        </div>
        <span className="text-gray-500 text-xs font-black">Dropdown</span>
      </summary>
      <div className="mt-3 max-h-44 overflow-y-auto grid grid-cols-1 gap-1.5 pr-1">
        {options.map((opt) => (
          <label
            key={opt}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-800 hover:bg-indigo-50 cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt)}
              onChange={() => toggle(opt)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {opt}
          </label>
        ))}
      </div>
    </details>
  );
};

interface ComprehensionExercisesModalProps {
  open: boolean;
  onClose: () => void;
  selectedWords: WordEntry[];
  studentId?: string;
  studentName?: string;
}

const ComprehensionExercisesModal: React.FC<ComprehensionExercisesModalProps> = ({
  open,
  onClose,
  selectedWords,
  studentId,
  studentName,
}) => {
  const [yearGroup, setYearGroup] = useState<string[]>([]);
  const [wordDifficultyLevel, setWordDifficultyLevel] = useState<string[]>([]);
  const [sentenceDifficultyLevel, setSentenceDifficultyLevel] = useState<string[]>([]);
  const [genre, setGenre] = useState<string[]>([]);
  const [textStructure, setTextStructure] = useState<string[]>([]);
  const [topic, setTopic] = useState<string[]>([]);
  const [languageStyle, setLanguageStyle] = useState<string[]>([]);
  const [backgroundKnowledgeLevel, setBackgroundKnowledgeLevel] = useState<string[]>([]);
  const [questionDifficultyLevel, setQuestionDifficultyLevel] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState<string[]>([]);
  const [questionTypeCounts, setQuestionTypeCounts] = useState<Record<string, number>>({});
  const [supportScaffoldLevel, setSupportScaffoldLevel] = useState<string[]>([]);
  const [writingSkillFocus, setWritingSkillFocus] = useState<string[]>([]);
  const [writerCraftFeature, setWriterCraftFeature] = useState<string[]>([]);
  const [grammarQuestionType, setGrammarQuestionType] = useState<string[]>([]);
  const [sentenceQuestionType, setSentenceQuestionType] = useState<string[]>([]);
  const [punctuationFocus, setPunctuationFocus] = useState<string[]>([]);
  const [vrQuestionType, setVrQuestionType] = useState<string[]>([]);
  const [wordCount, setWordCount] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GeneratedComprehensionExercise | null>(null);
  const [pendingExerciseId, setPendingExerciseId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [assignMessage, setAssignMessage] = useState<string | null>(null);

  const wordsForGeneration = useMemo(() => selectedWords.slice(0, MAX_WORDS), [selectedWords]);
  const hasAllSelections = [
    yearGroup,
    wordDifficultyLevel,
    sentenceDifficultyLevel,
    genre,
    textStructure,
    topic,
    languageStyle,
    backgroundKnowledgeLevel,
    questionDifficultyLevel,
    questionType,
    supportScaffoldLevel,
    writingSkillFocus,
    writerCraftFeature,
    grammarQuestionType,
    sentenceQuestionType,
    punctuationFocus,
    vrQuestionType,
    wordCount,
  ].every((arr) => arr.length > 0);

  if (!open) return null;

  const isUuid = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  const handleGenerate = async () => {
    if (wordsForGeneration.length === 0) {
      setError('Select at least one word in the word bank first.');
      return;
    }
    if (!hasAllSelections) {
      setError('Please choose at least one item from every dropdown before generating.');
      return;
    }

    const config: ComprehensionExerciseConfig = {
      yearGroup,
      wordDifficultyLevel,
      sentenceDifficultyLevel,
      genre,
      textStructure,
      topic,
      languageStyle,
      backgroundKnowledgeLevel,
      questionDifficultyLevel,
      questionType,
      questionTypeCounts: Object.fromEntries(
        questionType.map((id) => [id, Math.max(1, Math.min(20, Math.floor(questionTypeCounts[id] ?? 1)))] )
      ),
      supportScaffoldLevel,
      writingSkillFocus,
      writerCraftFeature,
      grammarQuestionType,
      sentenceQuestionType,
      punctuationFocus,
      vrQuestionType,
      wordCount,
    };

    setLoading(true);
    setError(null);
    setAssignMessage(null);
    setPendingExerciseId(null);
    setResult(null);
    try {
      const generated = await generateComprehensionExercises(wordsForGeneration, config);
      setResult(generated);
      if (studentId && !studentId.startsWith('temp-')) {
        const sourceWordIds = wordsForGeneration.map((w) => w.id).filter((id) => isUuid(id));
        const row = await insertGeneratedComprehensionExercise(studentId, {
          title: generated.title,
          teacherInstructions: generated.teacherInstructions,
          passage: generated.passage,
          questions: generated.questions as Array<Record<string, unknown>>,
          generatorConfig: config as unknown as Record<string, unknown>,
          sourceWordIds,
        });
        setPendingExerciseId(row.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate comprehension exercise.');
    } finally {
      setLoading(false);
    }
  };

  const setQuestionTypeCount = (id: string, raw: number) => {
    const n = Number.isFinite(raw) ? Math.floor(raw) : 1;
    const safe = Math.max(1, Math.min(20, n));
    setQuestionTypeCounts((prev) => ({ ...prev, [id]: safe }));
  };

  const handlePrint = () => {
    window.print();
  };

  const handleAssign = async () => {
    if (!pendingExerciseId) return;
    setAssigning(true);
    setAssignMessage(null);
    try {
      await assignGeneratedComprehensionExercise(pendingExerciseId);
      setAssignMessage(`Assigned to ${studentName || 'student'}.`);
      setPendingExerciseId(null);
    } catch (e) {
      setAssignMessage(e instanceof Error ? e.message : 'Could not assign comprehension exercise.');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="comprehension-ex-modal-root fixed inset-0 z-[60] bg-black/50 p-4 flex items-center justify-center print:static print:inset-auto print:min-h-0 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { margin: 12mm; }
          body * { visibility: hidden; }
          .print-exercise-sheet, .print-exercise-sheet * { visibility: visible; }
          .print-exercise-sheet .no-print { display: none !important; visibility: hidden !important; }
          .print-exercise-sheet { position: absolute; left: 0; top: 0; width: 100%; background: white; margin: 0; padding: 0; }
          .comprehension-ex-modal-root { position: static !important; inset: auto !important; display: block !important; background: white !important; padding: 0 !important; }
        }
      `}</style>
      <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] overflow-hidden flex flex-col print:shadow-none print:max-w-none print:max-h-none print:rounded-none print:overflow-visible">
        <div className="no-print border-b px-6 py-4 flex items-center justify-between bg-gradient-to-r from-sky-50 to-indigo-50">
          <div>
            <h2 className="text-xl font-black text-gray-900 tracking-tight">Comprehension exercises</h2>
            <p className="text-xs font-medium text-gray-600 mt-0.5">
              Configure all dropdown options, then generate a text plus comprehension questions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-gray-500 hover:text-gray-800 p-2 rounded-xl hover:bg-white/80 disabled:opacity-60"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 print:overflow-visible">
          <div className="no-print rounded-2xl border-2 border-gray-100 bg-gray-50/80 p-4">
            <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Target words</p>
            {wordsForGeneration.length === 0 ? (
              <p className="text-sm text-amber-800 font-bold">No words selected.</p>
            ) : (
              <>
                <ul className="flex flex-wrap gap-2">
                  {wordsForGeneration.map((w) => (
                    <li key={w.id} className="bg-white border border-gray-200 px-3 py-1 rounded-full text-sm font-black text-gray-800">
                      {formatWordForDisplay(w.word)}
                    </li>
                  ))}
                </ul>
                {selectedWords.length > MAX_WORDS && (
                  <p className="text-xs text-amber-700 font-bold mt-2">Only first {MAX_WORDS} words are used.</p>
                )}
              </>
            )}
          </div>

          {!result && (
            <div className="no-print space-y-5">
              <section className="rounded-2xl border border-indigo-100 bg-indigo-50/30 p-4">
                <h3 className="text-sm font-black text-indigo-900 uppercase tracking-wider mb-3">
                  Core text-generation controls
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MultiSelectDropdown label="Year group" options={YEAR_GROUP_OPTIONS} selected={yearGroup} onChange={setYearGroup} />
                  <MultiSelectDropdown
                    label="Word difficulty level"
                    options={WORD_DIFFICULTY_OPTIONS}
                    selected={wordDifficultyLevel}
                    onChange={setWordDifficultyLevel}
                  />
                  <MultiSelectDropdown
                    label="Sentence difficulty level"
                    options={SENTENCE_DIFFICULTY_OPTIONS}
                    selected={sentenceDifficultyLevel}
                    onChange={setSentenceDifficultyLevel}
                  />
                  <MultiSelectDropdown label="Genre" options={GENRE_OPTIONS} selected={genre} onChange={setGenre} />
                  <MultiSelectDropdown
                    label="Text structure"
                    options={TEXT_STRUCTURE_OPTIONS}
                    selected={textStructure}
                    onChange={setTextStructure}
                  />
                  <MultiSelectDropdown label="Topic" options={TOPIC_OPTIONS} selected={topic} onChange={setTopic} />
                  <MultiSelectDropdown
                    label="Language style"
                    options={LANGUAGE_STYLE_OPTIONS}
                    selected={languageStyle}
                    onChange={setLanguageStyle}
                  />
                  <MultiSelectDropdown
                    label="Background knowledge level"
                    options={BACKGROUND_KNOWLEDGE_LEVEL_OPTIONS}
                    selected={backgroundKnowledgeLevel}
                    onChange={setBackgroundKnowledgeLevel}
                  />
                  <MultiSelectDropdown label="Word count" options={WORD_COUNT_OPTIONS} selected={wordCount} onChange={setWordCount} />
                </div>
              </section>

              <section className="rounded-2xl border border-teal-100 bg-teal-50/30 p-4">
                <h3 className="text-sm font-black text-teal-900 uppercase tracking-wider mb-3">
                  Comprehension controls
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MultiSelectDropdown
                    label="Question difficulty level"
                    options={QUESTION_DIFFICULTY_OPTIONS}
                    selected={questionDifficultyLevel}
                    onChange={setQuestionDifficultyLevel}
                  />
                  <MultiSelectDropdown
                    label="Question type"
                    options={QUESTION_TYPE_OPTIONS}
                    selected={questionType}
                    onChange={setQuestionType}
                  />
                  {questionType.length > 0 && (
                    <div className="bg-white border-2 border-gray-200 rounded-2xl p-3 md:col-span-2">
                      <p className="text-xs font-black text-gray-500 uppercase tracking-wider mb-2">
                        Question counts per selected type
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                        {questionType.map((id) => (
                          <div key={id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-indigo-50">
                            <span className="text-sm font-bold text-gray-800 truncate">{id}</span>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={questionTypeCounts[id] ?? 1}
                              onChange={(e) => setQuestionTypeCount(id, Number(e.target.value))}
                              className="w-16 rounded-lg border border-gray-300 px-2 py-1 text-xs font-black text-center"
                              aria-label={`${id} question count`}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <MultiSelectDropdown
                    label="Support / scaffold level"
                    options={SUPPORT_SCAFFOLD_LEVEL_OPTIONS}
                    selected={supportScaffoldLevel}
                    onChange={setSupportScaffoldLevel}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-amber-100 bg-amber-50/30 p-4">
                <h3 className="text-sm font-black text-amber-900 uppercase tracking-wider mb-3">
                  Follow-up exercise controls
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <MultiSelectDropdown
                    label="Writing skill focus"
                    options={WRITING_SKILL_FOCUS_OPTIONS}
                    selected={writingSkillFocus}
                    onChange={setWritingSkillFocus}
                  />
                  <MultiSelectDropdown
                    label="Writer’s craft feature"
                    options={WRITER_CRAFT_FEATURE_OPTIONS}
                    selected={writerCraftFeature}
                    onChange={setWriterCraftFeature}
                  />
                  <MultiSelectDropdown
                    label="Grammar question type"
                    options={GRAMMAR_QUESTION_TYPE_OPTIONS}
                    selected={grammarQuestionType}
                    onChange={setGrammarQuestionType}
                  />
                  <MultiSelectDropdown
                    label="Sentence question type"
                    options={SENTENCE_QUESTION_TYPE_OPTIONS}
                    selected={sentenceQuestionType}
                    onChange={setSentenceQuestionType}
                  />
                  <MultiSelectDropdown
                    label="Punctuation focus"
                    options={PUNCTUATION_FOCUS_OPTIONS}
                    selected={punctuationFocus}
                    onChange={setPunctuationFocus}
                  />
                  <MultiSelectDropdown
                    label="VR question type"
                    options={VR_QUESTION_TYPE_OPTIONS}
                    selected={vrQuestionType}
                    onChange={setVrQuestionType}
                  />
                </div>
              </section>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-bold px-4 py-3">{error}</div>
          )}

          {!result ? (
            <div className="no-print flex flex-wrap gap-3 pt-1">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading || !hasAllSelections || wordsForGeneration.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-6 py-3 rounded-2xl font-black shadow-md transition-all disabled:cursor-not-allowed"
              >
                {loading ? 'Generating…' : 'Generate comprehension exercise'}
              </button>
            </div>
          ) : (
            <div className="print-exercise-sheet space-y-6">
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
                  onClick={() => setResult(null)}
                  className="bg-white border-2 border-gray-200 text-gray-700 px-5 py-2.5 rounded-xl font-black text-sm hover:bg-gray-50"
                >
                  Back to options
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="text-gray-500 font-bold px-4 py-2.5 text-sm hover:text-gray-800"
                >
                  Close
                </button>
                {studentId && !studentId.startsWith('temp-') && (
                  <button
                    type="button"
                    onClick={handleAssign}
                    disabled={assigning || !pendingExerciseId}
                    className="bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white px-5 py-2.5 rounded-xl font-black text-sm shadow-sm"
                  >
                    {assigning ? 'Assigning…' : `Assign to ${studentName || 'student'}`}
                  </button>
                )}
              </div>
              {assignMessage && (
                <p className="no-print text-sm font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2">
                  {assignMessage}
                </p>
              )}

              <article className="border-2 border-gray-100 rounded-2xl p-5">
                <h3 className="text-xl font-black text-gray-900">{result.title}</h3>
                <p className="text-sm text-gray-600 font-semibold mt-2">{result.teacherInstructions}</p>
                <div className="mt-4 bg-slate-50 rounded-xl border border-slate-100 p-4">
                  <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">{result.passage}</p>
                </div>
              </article>

              <section className="space-y-3">
                <h4 className="text-lg font-black text-gray-900">Questions</h4>
                {result.questions.map((q, idx) => (
                  <article key={`${q.question}-${idx}`} className="border rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-wider font-black text-indigo-600">
                      {q.questionType} · {q.difficulty}
                    </p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{idx + 1}. {q.question}</p>
                    {q.options.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {q.options.map((opt, i) => (
                          <li key={i} className="text-sm text-gray-800 font-medium">{String.fromCharCode(65 + i)}. {opt}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-sm text-emerald-700 font-bold">Answer: {q.answer}</p>
                    <p className="text-sm text-gray-600">{q.explanation}</p>
                  </article>
                ))}
              </section>

              <section className="border-t pt-4">
                <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-2">
                  Source words used for generation
                </h4>
                <div className="flex flex-wrap gap-2">
                  {wordsForGeneration.map((w) => (
                    <span
                      key={`source-${w.id}`}
                      className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full text-sm font-black text-indigo-800"
                    >
                      {formatWordForDisplay(w.word)}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComprehensionExercisesModal;
