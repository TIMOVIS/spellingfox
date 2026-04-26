
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { WordEntry, YearGroup } from '../types';

const STUDENT_YEAR_GROUPS: YearGroup[] = ['Year 3', 'Year 4', 'Year 5', 'Year 6'];
const STUDENT_LEVEL_BANDS = ['Working towards', 'Expected', 'Greater depth'] as const;

type TutorStudentProfile = {
  yearGroup: YearGroup | null;
  comprehensionLevel: string | null;
  writingLevel: string | null;
  interests: string | null;
};
import { generateWordExplanation, extractVocabularyFromFile, generateDailySpellingList } from '../geminiService';
import { getAllWords, addWord as addWordToSupabase, toggleDailyQuestWord, updateWord as updateWordInSupabase, deleteWord as deleteWordFromSupabase, getStudentDailyQuestDates, getStudentDailyQuests, getStudentProgress, getStudentPracticeHistoryByDate, getStudentAssignments, assignWordsToDailyQuest, getTodayLondonDate } from '../lib/supabaseQueries';
import { formatWordForDisplay } from '../lib/wordDisplay';
import { VocabWord, VocabStudentAssignment } from '../lib/supabase';
import { getWritingExerciseMeta } from '../lib/writingExerciseTypes';
import { vocabWordToWordEntry } from '../lib/vocabWordEntry';
import {
  GRAMMAR_TAGS,
  WRITING_TAGS,
  SEMANTIC_TAGS,
  PART_OF_SPEECH_VALUES,
  humanizeCurriculumLabel,
  normalizePartOfSpeechForSave,
  normalizeTagArrayForSave,
  tagsPresentInWordBank,
} from '../lib/vocabTaxonomy';
import WritingExercisesModal from './WritingExercisesModal';

function firstNonEmptyString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

/** Add part_of_speech / grammar / writing / semantic from AI enrich when those fields are empty on the word. */
function applyAiCurriculumToWordUpdates(aiData: Record<string, unknown>, w: WordEntry, updates: Partial<VocabWord>) {
  const pos = normalizePartOfSpeechForSave(firstNonEmptyString(aiData.partOfSpeech, aiData.part_of_speech));
  if (!w.partOfSpeech?.trim() && pos) {
    updates.part_of_speech = pos;
  }

  const grammarRaw = aiData.grammarTags ?? aiData.grammar_tags;
  const grammarNorm = normalizeTagArrayForSave(
    Array.isArray(grammarRaw) ? grammarRaw.filter((x): x is string => typeof x === 'string') : [],
    GRAMMAR_TAGS
  );
  if (!w.grammar?.length && grammarNorm.length) {
    updates.grammar = grammarNorm;
  }

  const writingRaw = aiData.writingTags ?? aiData.writing_tags;
  const writingNorm = normalizeTagArrayForSave(
    Array.isArray(writingRaw) ? writingRaw.filter((x): x is string => typeof x === 'string') : [],
    WRITING_TAGS
  );
  if (!w.writing?.length && writingNorm.length) {
    updates.writing = writingNorm;
  }

  const semanticRaw = aiData.semanticTags ?? aiData.semantic_tags;
  const semanticNorm = normalizeTagArrayForSave(
    Array.isArray(semanticRaw) ? semanticRaw.filter((x): x is string => typeof x === 'string') : [],
    SEMANTIC_TAGS
  );
  if (!w.semantic?.length && semanticNorm.length) {
    updates.semantic = semanticNorm;
  }
}

function londonCalendarDateKey(iso: string | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

/** JSONB sometimes arrives already parsed or as a string depending on client version. */
function normalizeAssignmentStudentResponse(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw) as unknown;
      return typeof o === 'object' && o !== null ? (o as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return null;
}

/** Parsed online submission for display in Past writing exercises. */
function parseStudentWritingResponse(a: VocabStudentAssignment): {
  choiceLetter?: string;
  choiceText?: string;
  freeText?: string;
} {
  const r = normalizeAssignmentStudentResponse(a.student_response);
  return shapeResponseForDisplay(a, r);
}

function shapeResponseForDisplay(
  a: VocabStudentAssignment,
  r: Record<string, unknown> | null
): { choiceLetter?: string; choiceText?: string; freeText?: string } {
  const out: { choiceLetter?: string; choiceText?: string; freeText?: string } = {};
  if (!r) return out;
  const idx =
    typeof r.selectedOptionIndex === 'number' && Number.isFinite(r.selectedOptionIndex)
      ? r.selectedOptionIndex
      : null;
  const opts = a.options || [];
  if (idx != null && idx >= 0 && opts[idx]) {
    out.choiceLetter = String.fromCharCode(65 + idx);
    out.choiceText = opts[idx];
  }
  if (typeof r.text === 'string' && r.text.trim()) {
    out.freeText = r.text.trim();
  }
  return out;
}

/** Autosaved partial work (same shape as submitted response). */
function parseStudentWritingDraft(a: VocabStudentAssignment): {
  choiceLetter?: string;
  choiceText?: string;
  freeText?: string;
} {
  const r = normalizeAssignmentStudentResponse(a.student_draft);
  return shapeResponseForDisplay(a, r);
}

function compareAssignmentOrder(a: VocabStudentAssignment, b: VocabStudentAssignment): number {
  const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (so !== 0) return so;
  const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
  const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
  return ta - tb;
}

/** All rows on a calendar day, grouped into teacher “packs” (batch_id) or legacy singles. */
function groupPastWritingRowsByBatch(rows: VocabStudentAssignment[]): VocabStudentAssignment[][] {
  if (rows.length === 0) return [];
  const keyOf = (a: VocabStudentAssignment) =>
    (a.batch_id && String(a.batch_id).trim()) || `solo:${a.id}`;
  const map = new Map<string, VocabStudentAssignment[]>();
  for (const a of rows) {
    const k = keyOf(a);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(a);
  }
  for (const list of map.values()) {
    list.sort(compareAssignmentOrder);
  }
  return [...map.values()].sort((a, b) => {
    const ta = a[0]?.created_at ? new Date(a[0].created_at).getTime() : 0;
    const tb = b[0]?.created_at ? new Date(b[0].created_at).getTime() : 0;
    return ta - tb;
  });
}

function isWritingPack(group: VocabStudentAssignment[]): boolean {
  if (group.length > 1) return true;
  const bid = group[0]?.batch_id;
  return !!(bid && String(bid).trim());
}

function onlineAnswerPresent(p: { choiceText?: string; freeText?: string }): boolean {
  return !!(p.choiceText || p.freeText);
}

interface TutorDashboardProps {
  studentName: string;
  studentId: string;
  wordBank: WordEntry[];
  dailyWordIds: string[];
  allStudents: { id: string; name: string }[];
  studentProfile: TutorStudentProfile;
  onSaveStudentProfile: (studentId: string, profile: TutorStudentProfile) => Promise<void>;
  onBulkAssignDailyQuest: (studentIds: string[], wordIds: string[]) => Promise<void>;
  /** Replace the full daily quest word-id list (used for bulk select on page). */
  onReplaceDailyQuest: (wordIds: string[]) => Promise<void>;
  onUpdateWords: (newWords: WordEntry[]) => void;
  onToggleDaily: (id: string) => void;
  onRefetchDailyQuest?: () => Promise<void>;
  /** Word IDs ticked for "Writing exercises" (persisted in App state per student). */
  writingExerciseWordIds: string[];
  onWritingExerciseWordIdsChange: (ids: string[]) => void;
  onBack: () => void;
}

const TutorDashboard: React.FC<TutorDashboardProps> = ({
  studentName,
  studentId,
  wordBank,
  dailyWordIds,
  allStudents,
  studentProfile,
  onSaveStudentProfile,
  onBulkAssignDailyQuest,
  onReplaceDailyQuest,
  onUpdateWords,
  onToggleDaily,
  onRefetchDailyQuest,
  writingExerciseWordIds,
  onWritingExerciseWordIdsChange,
  onBack,
}) => {
  const [newWord, setNewWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkAssignSelectedIds, setBulkAssignSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [generatingDaily, setGeneratingDaily] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addToDailyByDefault, setAddToDailyByDefault] = useState(true);
  const [recommendedDaily, setRecommendedDaily] = useState<WordEntry[] | null>(null);
  const [loadingWords, setLoadingWords] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Filter states
  const [filterYearGroup, setFilterYearGroup] = useState<string>('all');
  const [filterLearningPoint, setFilterLearningPoint] = useState<string>('all');
  const [filterWordFamily, setFilterWordFamily] = useState<string>('all');
  const [filterGrammar, setFilterGrammar] = useState<string>('all');
  const [filterWriting, setFilterWriting] = useState<string>('all');
  const [filterSemantic, setFilterSemantic] = useState<string>('all');
  const [filterPinnedOnly, setFilterPinnedOnly] = useState<boolean>(false);
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [wordBankPage, setWordBankPage] = useState(1);
  const [writingExercisesOpen, setWritingExercisesOpen] = useState(false);
  const [dailyBulkReplacing, setDailyBulkReplacing] = useState(false);
  const [editingWord, setEditingWord] = useState<WordEntry | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<WordEntry>>({});
  // Past daily quests
  const [pastQuestDates, setPastQuestDates] = useState<string[]>([]);
  const [selectedPastDate, setSelectedPastDate] = useState<string | null>(null);
  const [pastQuestDetail, setPastQuestDetail] = useState<Array<{ word: VocabWord; completed?: boolean }>>([]);
  const [loadingPastQuests, setLoadingPastQuests] = useState(false);
  const [pastQuestsOpen, setPastQuestsOpen] = useState(false);
  const [reassigningPastQuest, setReassigningPastQuest] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [enrichingWordId, setEnrichingWordId] = useState<string | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // Student progress (points, streak, practice history)
  const [studentProgress, setStudentProgress] = useState<{ points: number; streak: number } | null>(null);
  const [practiceHistory, setPracticeHistory] = useState<Array<{ date: string; records: Array<{ word: string; activity_type: string; correct: boolean }> }>>([]);
  const [progressSectionOpen, setProgressSectionOpen] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(false);
  const [pastWritingAssignments, setPastWritingAssignments] = useState<VocabStudentAssignment[]>([]);
  const [pastWritingLoading, setPastWritingLoading] = useState(false);
  const [pastWritingOpen, setPastWritingOpen] = useState(false);
  const [selectedPastWritingDate, setSelectedPastWritingDate] = useState<string | null>(null);

  const [profileYear, setProfileYear] = useState<string>('');
  const [profileComprehension, setProfileComprehension] = useState('');
  const [profileWriting, setProfileWriting] = useState('');
  const [profileInterests, setProfileInterests] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSavedAt, setProfileSavedAt] = useState<number | null>(null);

  const pastWritingDates = useMemo(() => {
    const keys = new Set<string>();
    for (const a of pastWritingAssignments) {
      const k = londonCalendarDateKey(a.created_at);
      if (k) keys.add(k);
    }
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [pastWritingAssignments]);

  const selectedPastWritingRows = useMemo(() => {
    if (!selectedPastWritingDate) return [];
    return pastWritingAssignments
      .filter(a => londonCalendarDateKey(a.created_at) === selectedPastWritingDate)
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      });
  }, [pastWritingAssignments, selectedPastWritingDate]);

  const selectedPastWritingBatches = useMemo(
    () => groupPastWritingRowsByBatch(selectedPastWritingRows),
    [selectedPastWritingRows]
  );

  const refreshPastWritingAssignments = useCallback(() => {
    if (!studentId || studentId.startsWith('temp-')) {
      setPastWritingAssignments([]);
      return;
    }
    getStudentAssignments(studentId)
      .then(setPastWritingAssignments)
      .catch(() => setPastWritingAssignments([]));
  }, [studentId]);

  // Load words from Supabase on mount
  useEffect(() => {
    const loadWords = async () => {
      try {
        setLoadingWords(true);
        const vocabWords = await getAllWords();
        const wordEntries = vocabWords.map(vocabWordToWordEntry);
        onUpdateWords(wordEntries);
      } catch (err: any) {
        console.error('Failed to load words from Supabase:', err);
        setError('Failed to load words from database. Please refresh the page.');
      } finally {
        setLoadingWords(false);
      }
    };

    loadWords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  useEffect(() => {
    setSelectedPastDate(null);
    setPastQuestDetail([]);
    setSelectedPastWritingDate(null);
  }, [studentId]);

  useEffect(() => {
    if (!studentId || studentId.startsWith('temp-')) {
      setPastWritingAssignments([]);
      setPastWritingLoading(false);
      return;
    }
    let cancelled = false;
    setPastWritingLoading(true);
    getStudentAssignments(studentId)
      .then(rows => {
        if (!cancelled) setPastWritingAssignments(rows);
      })
      .catch(() => {
        if (!cancelled) setPastWritingAssignments([]);
      })
      .finally(() => {
        if (!cancelled) setPastWritingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  // Load student progress (points, streak) and practice history when section is opened or student changes
  useEffect(() => {
    if (!studentId) return;
    if (!progressSectionOpen) {
      setStudentProgress(null);
      setPracticeHistory([]);
      return;
    }
    let cancelled = false;
    setLoadingProgress(true);
    Promise.all([
      getStudentProgress(studentId),
      getStudentPracticeHistoryByDate(studentId, 30)
    ])
      .then(([progress, history]) => {
        if (!cancelled) {
          setStudentProgress(progress ? { points: progress.points, streak: progress.streak } : null);
          setPracticeHistory(history);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStudentProgress(null);
          setPracticeHistory([]);
        }
      })
      .finally(() => { if (!cancelled) setLoadingProgress(false); });
    return () => { cancelled = true; };
  }, [studentId, progressSectionOpen]);

  // Load past quest dates when section is opened
  useEffect(() => {
    if (!pastQuestsOpen || !studentId) return;
    let cancelled = false;
    setLoadingPastQuests(true);
    getStudentDailyQuestDates(studentId)
      .then(dates => { if (!cancelled) setPastQuestDates(dates); })
      .catch(() => { if (!cancelled) setPastQuestDates([]); })
      .finally(() => { if (!cancelled) setLoadingPastQuests(false); });
    return () => { cancelled = true; };
  }, [pastQuestsOpen, studentId]);

  // Load quest detail when a past date is selected
  useEffect(() => {
    if (!selectedPastDate || !studentId) {
      setPastQuestDetail([]);
      return;
    }
    let cancelled = false;
    setLoadingPastQuests(true);
    getStudentDailyQuests(studentId, selectedPastDate)
      .then(rows => {
        if (!cancelled) setPastQuestDetail(rows.map((r: { word: VocabWord; completed: boolean }) => ({ word: r.word, completed: r.completed })));
      })
      .catch(() => { if (!cancelled) setPastQuestDetail([]); })
      .finally(() => { if (!cancelled) setLoadingPastQuests(false); });
    return () => { cancelled = true; };
  }, [selectedPastDate, studentId]);

  const formatPastDate = (d: string) => {
    try {
      const [y, m, day] = d.split('-').map(Number);
      const date = new Date(y, m - 1, day);
      return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
    } catch {
      return d;
    }
  };

  const handleAddWord = async () => {
    if (!newWord.trim()) {
      setError('Please enter a word to add.');
      return;
    }
    setLoading(true);
    setError(null);
    console.log('Adding word:', newWord);
    try {
      const aiData = await generateWordExplanation(newWord);
      const fullWord: WordEntry = {
        id: Date.now().toString(),
        word: aiData.word || newWord,
        definition: aiData.definition || 'No definition found.',
        root: aiData.root || 'N/A',
        origin: aiData.origin || 'Unknown',
        synonyms: aiData.synonyms || [],
        antonyms: aiData.antonyms || [],
        example: aiData.example || 'Example sentence goes here.',
        yearGroup: (aiData.yearGroup as YearGroup) || 'Year 5',
        learningPoint: aiData.learningPoint || 'Vocabulary'
      };
      
      // Add to Supabase with etymology, morphology, and letter strings
      try {
        const addedWord = await addWordToSupabase({
          word: fullWord.word,
          definition: fullWord.definition,
          root: fullWord.root,
          origin: fullWord.origin,
          synonyms: fullWord.synonyms,
          antonyms: fullWord.antonyms,
          example: fullWord.example,
          year_group: fullWord.yearGroup,
          learning_point: fullWord.learningPoint,
          letter_strings: (aiData as any).letterStrings || [],
          etymology: (aiData as any).etymology || null,
          morphology: (aiData as any).morphology || null
        });

        // Reload words from Supabase so word bank includes the new word
        const vocabWords = await getAllWords();
        const wordEntries = vocabWords.map(vocabWordToWordEntry);
        onUpdateWords(wordEntries);

        // Pin to daily quest using the ID from the insert response (reliable)
        if (addToDailyByDefault && addedWord?.id) {
          try {
            await toggleDailyQuestWord(studentId, addedWord.id);
            onToggleDaily(addedWord.id);
            await onRefetchDailyQuest?.();
          } catch (error) {
            console.error('Failed to add word to daily quest in Supabase:', error);
            onToggleDaily(addedWord.id);
          }
        }
        
        setNewWord('');
        setError(null); // Clear any previous errors
      } catch (supabaseErr: any) {
        console.error('Failed to save word to Supabase:', supabaseErr);
        const errorMsg = supabaseErr?.message || 'Failed to save word to database';
        setError(`Database error: ${errorMsg}. The word was generated but not saved.`);
        // Still add to local state even if Supabase fails
        onUpdateWords([fullWord, ...wordBank]);
        if (addToDailyByDefault) {
          onToggleDaily(fullWord.id);
        }
        setNewWord('');
      }
    } catch (err: any) {
      console.error('Failed to generate word:', err);
      const errorMsg = err?.message || 'Unknown error';
      if (errorMsg.includes('API_KEY') || errorMsg.includes('api key') || errorMsg.includes('API key')) {
        setError("API key error. Please check your GEMINI_API_KEY in .env.local and restart the dev server.");
      } else {
        setError(`Failed to generate word data: ${errorMsg}. Please check your API key and try again.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateAIRecommendation = async () => {
    setGeneratingDaily(true);
    setError(null);
    try {
      const words = await generateDailySpellingList();
      setRecommendedDaily(words);
    } catch (err) {
      setError("Could not generate recommendations.");
    } finally {
      setGeneratingDaily(false);
    }
  };

  const acceptRecommendation = () => {
    if (!recommendedDaily) return;
    const newWordBank = [...recommendedDaily, ...wordBank];
    onUpdateWords(newWordBank);
    recommendedDaily.forEach(w => onToggleDaily(w.id));
    setRecommendedDaily(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'text/plain'];
    if (!validTypes.includes(file.type)) {
      setError(`File type "${file.type}" is not supported. Please use PDF, PNG, JPG, or text files.`);
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("File is too large. Please use a file smaller than 10MB.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const reader = new FileReader();
      reader.onerror = () => {
        setError("Failed to read the file. Please try again.");
        setUploading(false);
      };
      
      reader.onload = async (event) => {
        try {
          const base64WithHeader = event.target?.result as string;
          if (!base64WithHeader) {
            throw new Error("File read failed - no data received");
          }
          
          const base64 = base64WithHeader.split(',')[1];
          if (!base64) {
            throw new Error("Failed to extract base64 data from file");
          }

          const extractedWords = await extractVocabularyFromFile(base64, file.type);
          if (extractedWords && extractedWords.length > 0) {
            // Words already in the word bank (case-insensitive) are skipped
            const existingWords = new Set(wordBank.map(w => w.word.trim().toLowerCase()));
            const addedWordIds: string[] = [];
            let skipped = 0;
            try {
              for (const word of extractedWords) {
                const key = word.word.trim().toLowerCase();
                if (existingWords.has(key)) {
                  skipped++;
                  continue;
                }
                try {
                  const addedWord = await addWordToSupabase({
                    word: word.word,
                    definition: word.definition,
                    root: word.root,
                    origin: word.origin,
                    synonyms: word.synonyms || [],
                    antonyms: word.antonyms || [],
                    example: word.example,
                    year_group: word.yearGroup,
                    learning_point: word.learningPoint,
                    letter_strings: (word as any).letterStrings || [],
                    etymology: (word as any).etymology || null,
                    morphology: (word as any).morphology || null
                  });
                  addedWordIds.push(addedWord.id);
                  existingWords.add(key);
                } catch (insertErr: any) {
                  if (insertErr?.code === '23505' || insertErr?.message?.includes('unique') || insertErr?.message?.includes('duplicate')) {
                    skipped++;
                    existingWords.add(key);
                  } else {
                    throw insertErr;
                  }
                }
              }
              const vocabWords = await getAllWords();
              const wordEntries = vocabWords.map(vocabWordToWordEntry);
              onUpdateWords(wordEntries);
              if (addToDailyByDefault && addedWordIds.length > 0) {
                try {
                  for (const wordId of addedWordIds) {
                    await toggleDailyQuestWord(studentId, wordId);
                    onToggleDaily(wordId);
                  }
                  await onRefetchDailyQuest?.();
                } catch (dailyQuestErr) {
                  console.error('Failed to add words to daily quest:', dailyQuestErr);
                }
              }
              setError(null);
              if (addedWordIds.length > 0 || skipped > 0) {
                setSuccessMessage(
                  addedWordIds.length > 0
                    ? skipped > 0
                      ? `Added ${addedWordIds.length} word(s). ${skipped} already in word bank and skipped.`
                      : `Added ${addedWordIds.length} word(s).`
                    : `All ${extractedWords.length} word(s) were already in the word bank; nothing added.`
                );
              }
            } catch (supabaseErr: any) {
              console.error('Failed to save words to Supabase:', supabaseErr);
              setError(`Failed to save words: ${supabaseErr?.message || 'Unknown error'}. ${addedWordIds.length} may have been added.`);
            }
          } else {
            setError("No words were extracted from the file. Please try a different file or ensure it contains readable text.");
          }
        } catch (err: any) {
          console.error("File extraction error:", err);
          const errorMessage = err?.message || err?.toString() || "Unknown error";
          if (errorMessage.includes("API_KEY") || errorMessage.includes("api key") || errorMessage.includes("authentication") || errorMessage.includes("API key")) {
            setError("API key error. Please check your GEMINI_API_KEY in .env.local and restart the dev server.");
          } else if (errorMessage.includes("mimeType") || errorMessage.includes("format") || errorMessage.includes("unsupported")) {
            setError("File format not supported by the API. Please try a PDF, PNG, JPG, or text file.");
          } else if (errorMessage.includes("No response") || errorMessage.includes("parse")) {
            setError("The file could not be processed. Please ensure it contains readable text and try again.");
          } else {
            setError(`Failed to extract words: ${errorMessage}. Please ensure the file contains readable text and your API key is valid.`);
          }
        } finally {
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      
      reader.readAsDataURL(file);
    } catch (err: any) {
      console.error("File upload error:", err);
      setError(`Error reading file: ${err?.message || "Unknown error"}`);
      setUploading(false);
    }
  };

  const removeWord = async (id: string) => {
    try {
      await deleteWordFromSupabase(id);
      // Reload words from Supabase
      const vocabWords = await getAllWords();
      const wordEntries = vocabWords.map(vocabWordToWordEntry);
      onUpdateWords(wordEntries);
    } catch (error) {
      console.error('Failed to delete word from Supabase:', error);
      // Still remove from local state
      onUpdateWords(wordBank.filter(w => w.id !== id));
      setError('Failed to delete word from database. It was removed from the view but may still exist in the database.');
    }
  };

  const startEditing = (word: WordEntry) => {
    setEditingWord(word);
    setEditFormData({
      word: word.word,
      definition: word.definition,
      root: word.root || '',
      origin: word.origin || '',
      partOfSpeech: word.partOfSpeech || '',
      grammar: [...(word.grammar || [])],
      writing: [...(word.writing || [])],
      semantic: [...(word.semantic || [])],
      synonyms: word.synonyms || [],
      antonyms: word.antonyms || [],
      example: word.example,
      yearGroup: word.yearGroup,
      learningPoint: word.learningPoint
    });
  };

  const cancelEditing = () => {
    setEditingWord(null);
    setEditFormData({});
  };

  const handleEditFieldChange = (field: keyof WordEntry, value: any) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleCurriculumTag = (field: 'grammar' | 'writing' | 'semantic', tag: string) => {
    setEditFormData(prev => {
      const cur = [...(prev[field] as string[] | undefined) || []];
      const i = cur.indexOf(tag);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(tag);
      return { ...prev, [field]: cur };
    });
  };

  const handleEditArrayFieldChange = (field: 'synonyms' | 'antonyms', index: number, value: string) => {
    setEditFormData(prev => {
      const array = [...(prev[field] || [])];
      array[index] = value;
      return { ...prev, [field]: array };
    });
  };

  const addArrayItem = (field: 'synonyms' | 'antonyms') => {
    setEditFormData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), '']
    }));
  };

  const removeArrayItem = (field: 'synonyms' | 'antonyms', index: number) => {
    setEditFormData(prev => {
      const array = [...(prev[field] || [])];
      array.splice(index, 1);
      return { ...prev, [field]: array };
    });
  };

  const saveEdit = async () => {
    if (!editingWord) return;
    
    setSavingEdit(true);
    setError(null);
    
    try {
      await updateWordInSupabase(editingWord.id, {
        word: editFormData.word || '',
        definition: editFormData.definition || '',
        root: editFormData.root || '',
        origin: editFormData.origin || '',
        part_of_speech: normalizePartOfSpeechForSave(editFormData.partOfSpeech),
        grammar: normalizeTagArrayForSave(editFormData.grammar as string[] | undefined, GRAMMAR_TAGS),
        writing: normalizeTagArrayForSave(editFormData.writing as string[] | undefined, WRITING_TAGS),
        semantic: normalizeTagArrayForSave(editFormData.semantic as string[] | undefined, SEMANTIC_TAGS),
        synonyms: editFormData.synonyms || [],
        antonyms: editFormData.antonyms || [],
        example: editFormData.example || '',
        year_group: editFormData.yearGroup || 'Year 5',
        learning_point: editFormData.learningPoint || ''
      });
      
      // Reload words from Supabase
      const vocabWords = await getAllWords();
      const wordEntries = vocabWords.map(vocabWordToWordEntry);
      onUpdateWords(wordEntries);
      
      setEditingWord(null);
      setEditFormData({});
    } catch (error: any) {
      console.error('Failed to update word in Supabase:', error);
      setError(`Failed to save changes: ${error?.message || 'Unknown error'}`);
    } finally {
      setSavingEdit(false);
    }
  };

  /** True if word has missing core content or missing curriculum metadata. */
  const needsEnriching = (w: WordEntry) => {
    const missingDefinition = !w.definition?.trim();
    const placeholderExample = /example (sentence )?to be (updated|provided) by (the )?teacher/i;
    const emptyExample = !w.example?.trim() || placeholderExample.test(w.example);
    const emptySynonyms = !w.synonyms?.length;
    const emptyAntonyms = !w.antonyms?.length;
    const missingPartOfSpeech = !w.partOfSpeech?.trim();
    const emptyGrammar = !w.grammar?.length;
    const emptyWriting = !w.writing?.length;
    const emptySemantic = !w.semantic?.length;
    return (
      missingDefinition ||
      emptyExample ||
      emptySynonyms ||
      emptyAntonyms ||
      missingPartOfSpeech ||
      emptyGrammar ||
      emptyWriting ||
      emptySemantic
    );
  };

  const handleEnrichWord = async (w: WordEntry) => {
    setEnrichingWordId(w.id);
    setError(null);
    try {
      const aiData = await generateWordExplanation(w.word);
      const updates: Partial<VocabWord> = {};
      if (aiData.definition?.trim() && !w.definition?.trim()) {
        updates.definition = aiData.definition.trim();
      }
      if (aiData.example?.trim()) updates.example = aiData.example;
      if (aiData.synonyms?.length) updates.synonyms = aiData.synonyms;
      if (aiData.antonyms?.length) updates.antonyms = aiData.antonyms;
      if (aiData.yearGroup) updates.year_group = aiData.yearGroup;
      if (aiData.learningPoint?.trim()) updates.learning_point = aiData.learningPoint;
      if (aiData.letterStrings?.length) updates.letter_strings = aiData.letterStrings;
      if (aiData.root?.trim()) updates.root = aiData.root;
      if (aiData.origin?.trim()) updates.origin = aiData.origin;
      applyAiCurriculumToWordUpdates(aiData as unknown as Record<string, unknown>, w, updates);
      if (Object.keys(updates).length === 0) return;
      await updateWordInSupabase(w.id, updates);
      const vocabWords = await getAllWords();
      const wordEntries = vocabWords.map(vocabWordToWordEntry);
      onUpdateWords(wordEntries);
    } catch (err: any) {
      console.error('Enrich word failed:', err);
      setError(`Failed to enrich "${w.word}": ${err?.message || 'Unknown error'}`);
    } finally {
      setEnrichingWordId(null);
    }
  };

  const handleEnrichAll = async () => {
    const toEnrich = wordBank.filter(needsEnriching);
    if (toEnrich.length === 0) {
      setError('No words need enriching. Core content and curriculum fields are already filled.');
      return;
    }
    setEnrichingAll(true);
    setError(null);
    let done = 0;
    for (const w of toEnrich) {
      setEnrichingWordId(w.id);
      try {
        const aiData = await generateWordExplanation(w.word);
        const updates: Partial<VocabWord> = {};
        if (aiData.definition?.trim() && !w.definition?.trim()) {
          updates.definition = aiData.definition.trim();
        }
        if (aiData.example?.trim()) updates.example = aiData.example;
        if (aiData.synonyms?.length) updates.synonyms = aiData.synonyms;
        if (aiData.antonyms?.length) updates.antonyms = aiData.antonyms;
        if (aiData.yearGroup) updates.year_group = aiData.yearGroup;
        if (aiData.learningPoint?.trim()) updates.learning_point = aiData.learningPoint;
        if (aiData.letterStrings?.length) updates.letter_strings = aiData.letterStrings;
        if (aiData.root?.trim()) updates.root = aiData.root;
        if (aiData.origin?.trim()) updates.origin = aiData.origin;
        applyAiCurriculumToWordUpdates(aiData as unknown as Record<string, unknown>, w, updates);
        if (Object.keys(updates).length > 0) {
          await updateWordInSupabase(w.id, updates);
        }
        done++;
        const vocabWords = await getAllWords();
        const wordEntries = vocabWords.map(vocabWordToWordEntry);
        onUpdateWords(wordEntries);
      } catch (err: any) {
        console.error('Enrich word failed:', w.word, err);
        setError(`Stopped after ${done}/${toEnrich.length}. Failed on "${w.word}": ${err?.message || 'Unknown error'}`);
        break;
      }
    }
    setEnrichingWordId(null);
    setEnrichingAll(false);
    if (done === toEnrich.length) {
      setError(null);
    }
  };

  // Get unique values for filters
  const uniqueYearGroups = Array.from(new Set(wordBank.map(w => w.yearGroup))).sort();
  const uniqueLearningPoints = Array.from(new Set(wordBank.map(w => w.learningPoint))).sort();
  const uniqueWordFamilies = Array.from(
    new Set(wordBank.map(w => w.wordFamily).filter((wf): wf is string => !!wf && wf.trim().length > 0))
  ).sort();
  const uniqueGrammars = tagsPresentInWordBank(wordBank, 'grammar', GRAMMAR_TAGS);
  const uniqueWritings = tagsPresentInWordBank(wordBank, 'writing', WRITING_TAGS);
  const uniqueSemantics = tagsPresentInWordBank(wordBank, 'semantic', SEMANTIC_TAGS);

  // Filter words based on selected criteria
  const filteredWords = wordBank.filter(word => {
    // Pinned-only filter
    if (filterPinnedOnly && !dailyWordIds.includes(word.id)) {
      return false;
    }
    // Year group filter
    if (filterYearGroup !== 'all' && word.yearGroup !== filterYearGroup) {
      return false;
    }
    
    // Learning point filter (includes prefix/suffix)
    if (filterLearningPoint !== 'all' && word.learningPoint !== filterLearningPoint) {
      return false;
    }

    // Word family filter
    if (filterWordFamily !== 'all' && word.wordFamily !== filterWordFamily) {
      return false;
    }

    if (filterGrammar !== 'all' && !word.grammar?.includes(filterGrammar)) {
      return false;
    }
    if (filterWriting !== 'all' && !word.writing?.includes(filterWriting)) {
      return false;
    }
    if (filterSemantic !== 'all' && !word.semantic?.includes(filterSemantic)) {
      return false;
    }
    
    // Search filter (searches word, definition, learning point, root, word family, tags)
    if (filterSearch.trim()) {
      const searchLower = filterSearch.toLowerCase();
      const matchesWord = word.word.toLowerCase().includes(searchLower);
      const matchesDefinition = word.definition.toLowerCase().includes(searchLower);
      const matchesLearningPoint = word.learningPoint.toLowerCase().includes(searchLower);
      const matchesRoot = word.root?.toLowerCase().includes(searchLower);
      const matchesWordFamily = word.wordFamily?.toLowerCase().includes(searchLower);
      const matchesPos = word.partOfSpeech?.toLowerCase().includes(searchLower);
      const grammarBlob = (word.grammar || []).join(' ').toLowerCase();
      const writingBlob = (word.writing || []).join(' ').toLowerCase();
      const semanticBlob = (word.semantic || []).join(' ').toLowerCase();
      const matchesGrammar = grammarBlob.includes(searchLower);
      const matchesWriting = writingBlob.includes(searchLower);
      const matchesSemantic = semanticBlob.includes(searchLower);
      
      if (
        !matchesWord &&
        !matchesDefinition &&
        !matchesLearningPoint &&
        !matchesRoot &&
        !matchesWordFamily &&
        !matchesPos &&
        !matchesGrammar &&
        !matchesWriting &&
        !matchesSemantic
      ) {
        return false;
      }
    }
    
    return true;
  });

  const clearFilters = () => {
    setFilterYearGroup('all');
    setFilterLearningPoint('all');
    setFilterWordFamily('all');
    setFilterGrammar('all');
    setFilterWriting('all');
    setFilterSemantic('all');
    setFilterPinnedOnly(false);
    setFilterSearch('');
  };

  const WORDS_PER_PAGE = 30;
  const wordBankTotalPages = Math.max(1, Math.ceil(filteredWords.length / WORDS_PER_PAGE));
  const paginatedWords = filteredWords.slice(
    (wordBankPage - 1) * WORDS_PER_PAGE,
    (wordBankPage - 1) * WORDS_PER_PAGE + WORDS_PER_PAGE
  );

  const toggleExerciseWordSelection = (id: string) => {
    const next = new Set(writingExerciseWordIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onWritingExerciseWordIdsChange([...next]);
  };

  const toggleSelectAllExerciseWordsOnPage = () => {
    const pageIds = paginatedWords.map(w => w.id);
    const next = new Set(writingExerciseWordIds);
    const allOn = pageIds.length > 0 && pageIds.every(id => next.has(id));
    if (allOn) pageIds.forEach(id => next.delete(id));
    else pageIds.forEach(id => next.add(id));
    onWritingExerciseWordIdsChange([...next]);
  };

  const selectedWordsForExercises = wordBank.filter(w => writingExerciseWordIds.includes(w.id));
  const allPageExerciseSelected =
    paginatedWords.length > 0 && paginatedWords.every(w => writingExerciseWordIds.includes(w.id));
  const allPageDailySelected =
    paginatedWords.length > 0 && paginatedWords.every(w => dailyWordIds.includes(w.id));

  const toggleSelectAllDailyOnPage = async () => {
    if (paginatedWords.length === 0) return;
    const pageIds = paginatedWords.map(w => w.id);
    const next = new Set(dailyWordIds);
    const allOn = pageIds.every(id => next.has(id));
    if (allOn) pageIds.forEach(id => next.delete(id));
    else pageIds.forEach(id => next.add(id));
    setDailyBulkReplacing(true);
    try {
      await onReplaceDailyQuest([...next]);
    } finally {
      setDailyBulkReplacing(false);
    }
  };

  // Reset to page 1 when filters change
  useEffect(() => {
    setWordBankPage(1);
  }, [filterYearGroup, filterLearningPoint, filterWordFamily, filterGrammar, filterWriting, filterSemantic, filterPinnedOnly, filterSearch]);

  useEffect(() => {
    setProfileYear(studentProfile.yearGroup || '');
    setProfileComprehension(studentProfile.comprehensionLevel || '');
    setProfileWriting(studentProfile.writingLevel || '');
    setProfileInterests(studentProfile.interests || '');
    setProfileError(null);
    setProfileSavedAt(null);
  }, [
    studentId,
    studentProfile.yearGroup,
    studentProfile.comprehensionLevel,
    studentProfile.writingLevel,
    studentProfile.interests,
  ]);

  const handleSaveStudentProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSavedAt(null);
    try {
      const y = profileYear.trim();
      const yearGroup: YearGroup | null =
        y && STUDENT_YEAR_GROUPS.includes(y as YearGroup) ? (y as YearGroup) : null;
      await onSaveStudentProfile(studentId, {
        yearGroup,
        comprehensionLevel: profileComprehension.trim() || null,
        writingLevel: profileWriting.trim() || null,
        interests: profileInterests.trim() || null,
      });
      setProfileSavedAt(Date.now());
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setProfileSaving(false);
    }
  };

  const levelSelectOptions = useMemo(() => {
    const bands = [...STUDENT_LEVEL_BANDS] as string[];
    const isBand = (x: string) => bands.includes(x);
    const extras = new Set<string>();
    for (const v of [
      studentProfile.comprehensionLevel,
      studentProfile.writingLevel,
      profileComprehension,
      profileWriting,
    ]) {
      const t = v?.trim();
      if (t && !isBand(t)) extras.add(t);
    }
    return [...bands, ...[...extras].sort((a, b) => a.localeCompare(b))];
  }, [studentProfile.comprehensionLevel, studentProfile.writingLevel, profileComprehension, profileWriting]);

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-4 mb-2">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-lg"
              title="Back to student selection"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-4xl font-black text-gray-900 tracking-tight">Curriculum Manager</h1>
              <p className="text-gray-600 font-medium mt-1">Managing curriculum for <span className="font-black text-indigo-600">{studentName}</span></p>
            </div>
          </div>
        </div>
        <button 
          onClick={handleGenerateAIRecommendation}
          disabled={generatingDaily}
          className="bg-gradient-to-r from-orange-400 to-amber-500 text-white px-6 py-4 rounded-2xl font-black shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center gap-2 group border-b-4 border-amber-600"
        >
          {generatingDaily ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Conjuring Words...</span>
            </div>
          ) : (
            <>
              <span className="text-2xl group-hover:rotate-12 transition-transform">✨</span>
              <span>MAGIC AI DAILY QUEST</span>
            </>
          )}
        </button>
      </header>

      <section className="bg-white rounded-3xl shadow-lg border border-indigo-100 p-6 md:p-8">
        <h2 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-2 mb-1">
          <span className="text-indigo-500">👤</span> Student profile
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Year group and levels help you tune lists and tasks; interests can guide personalised examples later.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Year group</label>
            <select
              value={profileYear}
              onChange={(e) => setProfileYear(e.target.value)}
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">Not set</option>
              {STUDENT_YEAR_GROUPS.map((yg) => (
                <option key={yg} value={yg}>
                  {yg}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Interests</label>
            <input
              type="text"
              value={profileInterests}
              onChange={(e) => setProfileInterests(e.target.value)}
              placeholder="e.g. football, space, Minecraft"
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Comprehension level</label>
            <select
              value={profileComprehension}
              onChange={(e) => setProfileComprehension(e.target.value)}
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">Not set</option>
              {levelSelectOptions.map((opt) => (
                <option key={`c-${opt}`} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black text-gray-500 uppercase tracking-wider mb-2">Writing level</label>
            <select
              value={profileWriting}
              onChange={(e) => setProfileWriting(e.target.value)}
              className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-4 py-3 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">Not set</option>
              {levelSelectOptions.map((opt) => (
                <option key={`w-${opt}`} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveStudentProfile}
            disabled={profileSaving || studentId.startsWith('temp-')}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black shadow-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all active:scale-95"
          >
            {profileSaving ? 'Saving…' : 'Save profile'}
          </button>
          {profileSavedAt != null && (
            <span className="text-sm font-bold text-emerald-600">Saved</span>
          )}
          {studentId.startsWith('temp-') && (
            <span className="text-sm font-bold text-amber-700">Connect Supabase to persist this student.</span>
          )}
          {profileError && <span className="text-sm font-bold text-red-600">{profileError}</span>}
        </div>
      </section>

      {/* AI Recommendation Preview */}
      {recommendedDaily && (
        <div className="bg-amber-50 border-4 border-amber-400 rounded-[2.5rem] p-8 shadow-xl animate-in zoom-in-95 duration-300 relative overflow-hidden">
          <div className="relative z-10">
            <h2 className="text-2xl font-black text-amber-950 mb-2 flex items-center gap-2">
              <span>🎯</span> AI Recommended List
            </h2>
            <p className="text-amber-800/70 font-bold mb-6">Master these words to cover the "{recommendedDaily[0]?.learningPoint}" pattern.</p>
            
            <div className="flex flex-wrap gap-3 mb-8">
              {recommendedDaily.map(w => (
                <div key={w.id} className="bg-white border-2 border-amber-200 px-5 py-3 rounded-2xl flex flex-col items-center">
                  <span className="text-lg font-black text-gray-900">{formatWordForDisplay(w.word)}</span>
                  <span className="text-[10px] uppercase font-bold text-amber-600">{w.yearGroup}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-4">
              <button 
                onClick={acceptRecommendation}
                className="bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black shadow-lg hover:bg-emerald-600 transition-all active:scale-95"
              >
                Accept & Pin to Daily Quest 📌
              </button>
              <button 
                onClick={() => setRecommendedDaily(null)}
                className="bg-white text-gray-500 px-8 py-4 rounded-2xl font-bold border-2 border-gray-200 hover:bg-gray-50 transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
          <div className="absolute top-0 right-0 p-10 text-9xl opacity-5 pointer-events-none transform rotate-12">✨</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Manual Add Word Card */}
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <span className="text-indigo-500">✍️</span> Quick Add
          </h2>
          <p className="text-xs text-gray-500 mb-6 italic">AI detects curriculum level and spelling patterns automatically.</p>
          
          <div className="space-y-6 mt-auto">
            <div className="flex items-center justify-between bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
              <span className="text-sm font-black text-indigo-900 uppercase tracking-tight">Add to Daily Quest automatically?</span>
              <button 
                onClick={() => setAddToDailyByDefault(!addToDailyByDefault)}
                className={`w-14 h-8 rounded-full p-1 transition-all flex items-center ${addToDailyByDefault ? 'bg-orange-500 justify-end' : 'bg-gray-300 justify-start'}`}
              >
                <div className="w-6 h-6 bg-white rounded-full shadow-sm"></div>
              </button>
            </div>

            <div className="flex gap-2">
              <input 
                type="text" 
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddWord()}
                placeholder="Type a word..."
                className="flex-grow bg-gray-50 border-2 border-gray-100 rounded-2xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-lg text-gray-900"
              />
              <button 
                onClick={handleAddWord}
                disabled={loading || !newWord.trim()}
                className="bg-indigo-600 text-white px-8 rounded-2xl font-black hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md active:scale-95 flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Adding...</span>
                  </>
                ) : (
                  'ADD'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* File Scan Card */}
        <div className="bg-white p-8 rounded-3xl shadow-lg border border-gray-100 flex flex-col">
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <span className="text-emerald-500">📂</span> Extract from Reading
          </h2>
          <p className="text-xs text-gray-500 mb-6 italic">Upload a story passage to find vocabulary words.</p>
          <div className="mt-auto">
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".pdf,.png,.jpg,.jpeg,.txt"
              className="hidden" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-emerald-200 bg-emerald-50/50 text-emerald-700 px-8 py-6 rounded-2xl font-bold hover:bg-emerald-50 hover:border-emerald-300 transition-all flex flex-col items-center justify-center gap-1 group"
            >
              {uploading ? (
                <div className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Scanning...</span>
                </div>
              ) : (
                <>
                  <span className="text-3xl group-hover:scale-110 transition-transform mb-1">📤</span>
                  <span>Select File</span>
                  <span className="text-[10px] text-emerald-500/70 font-normal">PDF, Image or Text</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-6 py-4 rounded-2xl text-sm flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
          <span className="text-lg">⚠️</span> {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-6 py-4 rounded-2xl text-sm flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <span className="flex items-center gap-3"><span className="text-lg">✓</span> {successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-800 font-bold" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* Student progress (points, streak, practice history) */}
      <div className="bg-indigo-50 border-2 border-indigo-200 rounded-[2rem] overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setProgressSectionOpen(prev => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-indigo-100 transition-colors"
        >
          <h3 className="font-black text-indigo-900 uppercase text-xs tracking-widest flex items-center gap-2">
            <span className="text-lg">📊</span> Student progress
          </h3>
          <span className="text-indigo-500 font-bold text-sm">{progressSectionOpen ? '▼' : '▶'}</span>
        </button>
        {progressSectionOpen && (
          <div className="px-6 pb-6 pt-0 border-t border-indigo-200">
            {loadingProgress ? (
              <p className="text-indigo-600 text-sm py-4">Loading…</p>
            ) : (
              <div className="space-y-6 pt-4">
                {studentProgress != null && (
                  <div className="flex flex-wrap gap-6">
                    <div className="bg-white border-2 border-indigo-200 rounded-2xl px-6 py-4 shadow-sm">
                      <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Quest points</span>
                      <div className="text-3xl font-black text-indigo-900">{studentProgress.points}</div>
                    </div>
                    <div className="bg-white border-2 border-amber-200 rounded-2xl px-6 py-4 shadow-sm">
                      <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Streak</span>
                      <div className="text-3xl font-black text-amber-900">{studentProgress.streak} day{studentProgress.streak !== 1 ? 's' : ''}</div>
                    </div>
                  </div>
                )}
                <div>
                  <h4 className="text-sm font-black text-indigo-800 uppercase tracking-widest mb-3">Practice history (Sentence Ninja, Word building, Disappearing letters & Bee)</h4>
                  {practiceHistory.length === 0 ? (
                    <p className="text-indigo-600/80 text-sm">No practice recorded yet. The student will see their history under &quot;My practice&quot; after completing activities.</p>
                  ) : (
                    <ul className="space-y-4">
                      {practiceHistory.map(({ date, records }) => (
                        <li key={date} className="bg-white rounded-xl border-2 border-indigo-100 p-4">
                          <div className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-2">
                            {new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                          </div>
                          <ul className="space-y-1.5">
                            {records.map((r, i) => (
                              <li key={`${date}-${i}`} className="flex items-center gap-2 text-gray-900 text-sm">
                                <span className={r.correct ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>{r.correct ? '✓' : '✗'}</span>
                                <span className="font-bold">{formatWordForDisplay(r.word)}</span>
                                <span className="text-xs text-gray-400">
                                  {r.activity_type === 'spelling_snake' ? 'Word building' : r.activity_type === 'spelling_bee' ? 'Bee' : r.activity_type === 'disappearing_letters' ? 'Disappearing letters' : r.activity_type === 'sentence_ninja' ? 'Sentence Ninja' : r.activity_type}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Today's Daily Quest – words the student will see */}
      {dailyWordIds.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-[2rem] p-6 shadow-sm">
          <h3 className="font-black text-amber-900 uppercase text-xs tracking-widest flex items-center gap-2 mb-3">
            <span className="text-lg">⭐</span> Today&apos;s Daily Quest
            <span className="bg-amber-200 text-amber-900 px-2.5 py-0.5 rounded-full text-[10px] font-black">
              {dailyWordIds.length} word{dailyWordIds.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-amber-800/80 text-sm font-medium mb-3">
            Words {studentName} will see in their daily list. Tap a word here to unpin it from today&apos;s quest.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {wordBank
              .filter(w => dailyWordIds.includes(w.id))
              .map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onToggleDaily(w.id)}
                  className="inline-flex items-center gap-2 bg-white border-2 border-amber-300 text-amber-900 px-4 py-2 rounded-xl text-sm font-black shadow-sm hover:bg-amber-100 hover:border-amber-400 active:scale-95 transition-all"
                >
                  <span>{formatWordForDisplay(w.word)}</span>
                  <span className="text-[10px] uppercase tracking-widest text-amber-500">Unpin</span>
                </button>
              ))}
          </div>
          {allStudents.filter(s => s.id !== studentId).length > 0 && (
            <button
              type="button"
              onClick={() => { setBulkAssignSelectedIds(new Set()); setShowBulkAssignModal(true); }}
              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-black text-sm shadow-sm transition-colors"
            >
              Assign this daily quest to other students
            </button>
          )}
        </div>
      )}

      {/* Writing exercise words – same pattern as Today’s Daily Quest (teal = writing checkboxes) */}
      {writingExerciseWordIds.length > 0 && (
        <div className="bg-teal-50 border-2 border-teal-200 rounded-[2rem] p-6 shadow-sm">
          <h3 className="font-black text-teal-900 uppercase text-xs tracking-widest flex items-center gap-2 mb-3">
            <span className="text-lg">📝</span> Writing exercise words
            <span className="bg-teal-200 text-teal-900 px-2.5 py-0.5 rounded-full text-[10px] font-black">
              {writingExerciseWordIds.length} word{writingExerciseWordIds.length !== 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-teal-800/80 text-sm font-medium mb-3">
            Words {studentName} has ticked for <span className="font-black">Writing exercises</span> (teal checkboxes
            below). Tap a word to unpin it from this list.
          </p>
          <div className="flex flex-wrap gap-2 mb-4">
            {wordBank
              .filter(w => writingExerciseWordIds.includes(w.id))
              .map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => onWritingExerciseWordIdsChange(writingExerciseWordIds.filter(id => id !== w.id))}
                  className="inline-flex items-center gap-2 bg-white border-2 border-teal-300 text-teal-900 px-4 py-2 rounded-xl text-sm font-black shadow-sm hover:bg-teal-100 hover:border-teal-400 active:scale-95 transition-all"
                >
                  <span>{formatWordForDisplay(w.word)}</span>
                  <span className="text-[10px] uppercase tracking-widest text-teal-600">Unpin</span>
                </button>
              ))}
          </div>
          {writingExerciseWordIds.some(id => !wordBank.some(w => w.id === id)) && (
            <p className="text-xs font-bold text-teal-900/90 mb-3">
              Some pinned IDs are not in the word bank anymore (removed words). Use &quot;Clear all&quot; to reset the
              list.
            </p>
          )}
          <button
            type="button"
            onClick={() => onWritingExerciseWordIdsChange([])}
            className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl font-black text-sm shadow-sm transition-colors"
          >
            Clear all writing words
          </button>
        </div>
      )}

      {/* Bulk assign daily quest modal */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="text-xl font-black text-gray-900">Assign daily quest to students</h3>
              <p className="text-sm text-gray-600 mt-1">Select students to receive the same {dailyWordIds.length} word{dailyWordIds.length !== 1 ? 's' : ''} as {studentName}.</p>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="space-y-2">
                {allStudents
                  .filter(s => s.id !== studentId)
                  .map(s => (
                    <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bulkAssignSelectedIds.has(s.id)}
                        onChange={() => setBulkAssignSelectedIds(prev => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        })}
                        className="w-5 h-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-bold text-gray-900">{s.name}</span>
                    </label>
                  ))}
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowBulkAssignModal(false)}
                className="px-5 py-2.5 rounded-xl font-bold border-2 border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkAssignSelectedIds.size === 0 || bulkAssigning}
                onClick={async () => {
                  if (bulkAssignSelectedIds.size === 0) return;
                  setBulkAssigning(true);
                  try {
                    await onBulkAssignDailyQuest([...bulkAssignSelectedIds], dailyWordIds);
                    setShowBulkAssignModal(false);
                  } catch (e) {
                    setError('Failed to assign daily quest. Please try again.');
                  } finally {
                    setBulkAssigning(false);
                  }
                }}
                className="px-5 py-2.5 rounded-xl font-black bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                {bulkAssigning ? 'Assigning…' : `Assign to ${bulkAssignSelectedIds.size} student${bulkAssignSelectedIds.size !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Past daily quests */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-[2rem] overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setPastQuestsOpen(prev => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-gray-100 transition-colors"
        >
          <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest flex items-center gap-2">
            <span className="text-lg">📅</span> Past daily quests
          </h3>
          <span className="text-gray-500 font-bold text-sm">{pastQuestsOpen ? '▼' : '▶'}</span>
        </button>
        {pastQuestsOpen && (
          <div className="px-6 pb-6 pt-0 border-t border-gray-200">
            {loadingPastQuests && pastQuestDates.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">Loading…</p>
            ) : pastQuestDates.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">No past quest dates for this student yet.</p>
            ) : (
              <>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Select a date</label>
                <select
                  value={selectedPastDate ?? ''}
                  onChange={(e) => setSelectedPastDate(e.target.value || null)}
                  className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-900 text-sm cursor-pointer w-full max-w-xs mb-4"
                >
                  <option value="">Choose date…</option>
                  {pastQuestDates.map(d => (
                    <option key={d} value={d}>{formatPastDate(d)}</option>
                  ))}
                </select>
                {selectedPastDate && (
                  loadingPastQuests ? (
                    <p className="text-gray-500 text-sm">Loading quest…</p>
                  ) : pastQuestDetail.length === 0 ? (
                    <p className="text-gray-500 text-sm">No words for this date.</p>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-gray-600 text-sm font-medium">
                        {pastQuestDetail.filter(q => q.completed).length} of {pastQuestDetail.length} completed
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {pastQuestDetail.map((q, i) => (
                          <span
                            key={q.word?.id ?? i}
                            className={`px-4 py-2 rounded-xl text-sm font-black shadow-sm border-2 ${
                              q.completed
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : 'bg-white border-gray-200 text-gray-700'
                            }`}
                          >
                            {q.word?.word != null ? formatWordForDisplay(q.word.word) : '—'}
                            {q.completed && <span className="ml-1.5" title="Completed">✓</span>}
                          </span>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!studentId || pastQuestDetail.length === 0) return;
                          const wordIds = pastQuestDetail.map(q => q.word?.id).filter((id): id is string => !!id);
                          if (wordIds.length === 0) return;
                          setReassigningPastQuest(true);
                          try {
                            await assignWordsToDailyQuest(studentId, wordIds, getTodayLondonDate());
                            await onRefetchDailyQuest?.();
                          } catch (e) {
                            console.error('Failed to reassign past quest:', e);
                          } finally {
                            setReassigningPastQuest(false);
                          }
                        }}
                        disabled={reassigningPastQuest}
                        className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-black text-sm shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {reassigningPastQuest ? 'Reassigning…' : 'Reassign this quest to today'}
                      </button>
                    </div>
                  )
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Past writing exercises */}
      <div className="bg-gray-50 border-2 border-gray-200 rounded-[2rem] overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setPastWritingOpen(prev => !prev)}
          className="w-full px-6 py-4 flex items-center justify-between gap-3 text-left hover:bg-gray-100 transition-colors"
        >
          <h3 className="font-black text-gray-800 uppercase text-xs tracking-widest flex items-center gap-2">
            <span className="text-lg">📝</span> Past writing exercises
          </h3>
          <span className="text-gray-500 font-bold text-sm">{pastWritingOpen ? '▼' : '▶'}</span>
        </button>
        {pastWritingOpen && (
          <div className="px-6 pb-6 pt-0 border-t border-gray-200">
            {studentId.startsWith('temp-') ? (
              <p className="text-gray-500 text-sm py-4">
                Save this student in Supabase to track writing exercise history.
              </p>
            ) : pastWritingLoading && pastWritingDates.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">Loading…</p>
            ) : pastWritingDates.length === 0 ? (
              <p className="text-gray-500 text-sm py-4">
                No writing exercises sent yet. Use <span className="font-black text-gray-700">Writing exercises</span> in the word bank and assign to {studentName}&apos;s dashboard.
              </p>
            ) : (
              <>
                <label className="block text-xs font-black text-gray-500 uppercase tracking-widest mb-2">Select a date</label>
                <select
                  value={selectedPastWritingDate ?? ''}
                  onChange={e => setSelectedPastWritingDate(e.target.value || null)}
                  className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-900 text-sm cursor-pointer w-full max-w-xs mb-2"
                >
                  <option value="">Choose date…</option>
                  {pastWritingDates.map(d => (
                    <option key={d} value={d}>
                      {formatPastDate(d)}
                    </option>
                  ))}
                </select>
                {!selectedPastWritingDate && (
                  <p className="text-sm text-gray-600 mb-4 font-medium">
                    After you pick a date, you&apos;ll see the{' '}
                    <span className="font-black text-gray-800">task text and instructions</span> the pupil was given,
                    then their <span className="font-black text-gray-800">draft or submitted answer</span> when
                    present.
                  </p>
                )}
                {selectedPastWritingDate &&
                  (selectedPastWritingRows.length === 0 ? (
                    <p className="text-gray-500 text-sm">No exercises for this date.</p>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-gray-600 text-sm font-medium">
                        {selectedPastWritingBatches.length} batch
                        {selectedPastWritingBatches.length !== 1 ? 'es' : ''} ·{' '}
                        {selectedPastWritingRows.length} exercise{selectedPastWritingRows.length !== 1 ? 's' : ''} ·{' '}
                        {selectedPastWritingRows.filter(a => a.completed_at).length} submitted ·{' '}
                        {
                          selectedPastWritingRows.filter(a => {
                            const p = parseStudentWritingResponse(a);
                            return !!(p.choiceText || p.freeText);
                          }).length
                        }{' '}
                        with online answer ·{' '}
                        {
                          selectedPastWritingRows.filter(
                            a => !a.completed_at && onlineAnswerPresent(parseStudentWritingDraft(a))
                          ).length
                        }{' '}
                        with draft in progress
                      </p>
                      <div className="space-y-4">
                        {selectedPastWritingBatches.map((group, gi) => {
                          const pack = isWritingPack(group);
                          const gDone = group.filter(a => a.completed_at).length;
                          const gDraft = group.filter(
                            a => !a.completed_at && onlineAnswerPresent(parseStudentWritingDraft(a))
                          ).length;
                          const firstTitle =
                            group[0]?.title?.trim() ||
                            getWritingExerciseMeta(group[0]?.exercise_type || '')?.label ||
                            'Writing exercises';
                          return (
                            <div
                              key={pack ? `pack-${group[0]?.batch_id ?? gi}` : `solo-${group[0]?.id ?? gi}`}
                              className={
                                pack
                                  ? 'rounded-2xl border-2 border-indigo-200/80 bg-indigo-50/40 p-4 space-y-3 shadow-sm'
                                  : 'space-y-3'
                              }
                            >
                              {pack && (
                                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-indigo-200/60 pb-3">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                                      Exercise pack
                                    </p>
                                    <p className="font-black text-gray-900 text-sm mt-0.5">{firstTitle}</p>
                                    <p className="text-xs font-bold text-indigo-900/80 mt-1">
                                      Progress: {gDone}/{group.length} submitted
                                      {gDraft > 0 ? ` · ${gDraft} with autosaved draft` : ''}
                                      {gDone < group.length && gDraft === 0
                                        ? ' · rest outstanding (no draft yet)'
                                        : ''}
                                    </p>
                                  </div>
                                </div>
                              )}
                              <ul className={`space-y-3 ${pack ? 'pl-0' : ''}`}>
                                {group.map(a => {
                                  const wordEntry = a.word_id ? wordBank.find(w => w.id === a.word_id) : undefined;
                                  const wordLabel = wordEntry ? formatWordForDisplay(wordEntry.word) : '—';
                                  const typeLabel =
                                    getWritingExerciseMeta(a.exercise_type || '')?.label ?? a.title ?? 'Writing exercise';
                                  const timeStr = a.created_at
                                    ? new Date(a.created_at).toLocaleTimeString('en-GB', {
                                        timeZone: 'Europe/London',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })
                                    : '';
                                  const resp = parseStudentWritingResponse(a);
                                  const hasOnline = !!(resp.choiceText || resp.freeText);
                                  const draft = parseStudentWritingDraft(a);
                                  const hasDraft = onlineAnswerPresent(draft);
                                  const taskTitle = (a.title || '').trim();
                                  const taskInstr = (a.student_instructions || '').trim();
                                  const taskMain = (a.main_content || '').trim();
                                  const taskOptions = Array.isArray(a.options)
                                    ? a.options.filter((o): o is string => typeof o === 'string' && o.trim())
                                    : [];
                                  const hasTaskBody = !!(taskTitle || taskInstr || taskMain || taskOptions.length);
                                  return (
                                    <li
                                      key={a.id}
                                      className="text-sm bg-white rounded-xl px-4 py-3 border-2 border-gray-200 shadow-sm space-y-3"
                                    >
                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="font-black text-gray-900 min-w-[5.5rem]">{wordLabel}</span>
                                        <span className="font-bold text-gray-800 flex-1 min-w-[8rem]">{typeLabel}</span>
                                        {timeStr && (
                                          <span className="text-xs font-bold text-gray-500">{timeStr}</span>
                                        )}
                                        <span
                                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${
                                            a.completed_at
                                              ? 'bg-emerald-100 text-emerald-800'
                                              : hasDraft
                                                ? 'bg-sky-100 text-sky-900'
                                                : 'bg-amber-100 text-amber-900'
                                          }`}
                                        >
                                          {a.completed_at ? 'Done' : hasDraft ? 'In progress' : 'Outstanding'}
                                        </span>
                                      </div>
                                      <div className="rounded-xl bg-slate-50 border-2 border-slate-200/90 px-3 py-3 space-y-3">
                                        <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                          Task (what the pupil saw)
                                        </div>
                                        {!hasTaskBody && (
                                          <p className="text-xs font-medium text-slate-500">
                                            No task text or choices stored for this row.
                                          </p>
                                        )}
                                        {taskTitle ? (
                                          <div>
                                            <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                              Title
                                            </span>
                                            <p className="text-sm font-bold text-slate-900">{taskTitle}</p>
                                          </div>
                                        ) : null}
                                        {taskInstr ? (
                                          <div>
                                            <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                              Instructions
                                            </span>
                                            <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">
                                              {taskInstr}
                                            </p>
                                          </div>
                                        ) : null}
                                        {taskMain ? (
                                          <div>
                                            <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                              Worksheet / prompt
                                            </span>
                                            <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">
                                              {taskMain}
                                            </p>
                                          </div>
                                        ) : null}
                                        {taskOptions.length > 0 ? (
                                          <div>
                                            <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">
                                              Answer choices (online)
                                            </span>
                                            <ul className="list-none space-y-1.5 text-sm font-medium text-slate-900">
                                              {taskOptions.map((opt, oi) => (
                                                <li key={oi} className="flex gap-2">
                                                  <span className="shrink-0 font-black text-slate-500 w-6">
                                                    {String.fromCharCode(65 + oi)}.
                                                  </span>
                                                  <span className="whitespace-pre-wrap leading-relaxed">{opt}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        ) : null}
                                      </div>
                                      {!a.completed_at && hasDraft && (
                                        <div className="rounded-xl bg-sky-50/90 border-2 border-sky-200/80 px-3 py-3 space-y-2">
                                          <div className="text-[10px] font-black text-sky-900 uppercase tracking-widest">
                                            Draft (autosaved, not submitted)
                                          </div>
                                          {draft.choiceText != null && (
                                            <div>
                                              <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                                Selected choice{draft.choiceLetter ? ` (${draft.choiceLetter})` : ''}
                                              </span>
                                              <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">
                                                {draft.choiceText}
                                              </p>
                                            </div>
                                          )}
                                          {draft.freeText != null && (
                                            <div>
                                              <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                                Written answer (partial)
                                              </span>
                                              <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">
                                                {draft.freeText}
                                              </p>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className="rounded-xl bg-emerald-50/90 border-2 border-emerald-200/80 px-3 py-3 space-y-2">
                                        <div className="text-[10px] font-black text-emerald-900 uppercase tracking-widest">
                                          Student response (online)
                                        </div>
                                        {!a.completed_at && (
                                          <p className="text-xs font-bold text-amber-900">
                                            {hasDraft
                                              ? 'Draft above is not the final submission yet.'
                                              : 'Not submitted yet — the pupil still has this open on their dashboard.'}
                                          </p>
                                        )}
                                        {a.completed_at && !hasOnline && (
                                          <p className="text-xs font-medium text-slate-600">
                                            No online answer stored (e.g. completed before answers were added, or marked
                                            done without the new form).
                                          </p>
                                        )}
                                        {resp.choiceText != null && (
                                          <div>
                                            <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                              Selected choice{resp.choiceLetter ? ` (${resp.choiceLetter})` : ''}
                                            </span>
                                            <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap">
                                              {resp.choiceText}
                                            </p>
                                          </div>
                                        )}
                                        {resp.freeText != null && (
                                          <div>
                                            <span className="text-[10px] font-black uppercase text-slate-500 block mb-0.5">
                                              Written answer
                                            </span>
                                            <p className="text-sm font-medium text-slate-900 whitespace-pre-wrap leading-relaxed">
                                              {resp.freeText}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          );
                        })}
                      </div>
                      {selectedPastWritingRows.some(a => !a.word_id) && (
                        <p className="text-[11px] font-medium text-gray-500">
                          “—” for word means an older assignment without a linked vocabulary word. Run{' '}
                          <code className="font-mono bg-white px-1 rounded text-[10px] border border-gray-200">
                            supabase_student_assignments_word_id.sql
                          </code>{' '}
                          so new assignments show the word.
                        </p>
                      )}
                    </div>
                  ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Directory Table */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-8 py-6 bg-gray-50/80 border-b">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <h3 className="font-black text-gray-900 uppercase text-xs tracking-widest flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
              Word Bank Directory
              {loadingWords && <span className="text-xs text-gray-400 ml-2">(Loading...)</span>}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
               <span className="bg-white px-4 py-1.5 rounded-full border text-xs font-black text-indigo-600 shadow-sm">
                 {filteredWords.length} {filteredWords.length === wordBank.length && !filterPinnedOnly ? 'Words' : `of ${wordBank.length} Words`}
                 {wordBankTotalPages > 1 && ` · Page ${wordBankPage} of ${wordBankTotalPages}`}
               </span>
               <button
                 type="button"
                 onClick={() => setFilterPinnedOnly(prev => !prev)}
                 className={`px-4 py-1.5 rounded-full border text-xs font-black shadow-sm transition-all ${
                   filterPinnedOnly
                     ? 'bg-amber-500 border-amber-600 text-white'
                     : 'bg-amber-100 border-amber-200 text-amber-700 hover:bg-amber-200'
                 }`}
                 title="Show only words included in this student’s daily quest"
               >
                 {dailyWordIds.length} in daily quest{filterPinnedOnly ? ' · filtered' : ''}
               </button>
               {wordBank.some(needsEnriching) && (
                 <button
                   onClick={handleEnrichAll}
                   disabled={enrichingAll}
                   className="bg-emerald-500 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-emerald-600 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2"
                   title="Fill example sentences, synonyms, and antonyms for all words that need them"
                 >
                   {enrichingAll ? (
                     <>
                       <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                         <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                         <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                       </svg>
                       Enriching…
                     </>
                   ) : (
                     <>✨ Enrich all with AI</>
                   )}
                 </button>
               )}
               <button
                 type="button"
                 onClick={() => setWritingExercisesOpen(true)}
                 disabled={writingExerciseWordIds.length === 0}
                 className="bg-teal-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                 title="One AI writing task per ticked word; selected exercise types rotate across words"
               >
                 📝 Writing exercises
                 {writingExerciseWordIds.length > 0 && (
                   <span className="bg-white/20 px-2 py-0.5 rounded-lg">{writingExerciseWordIds.length}</span>
                 )}
               </button>
            </div>
          </div>
          <p className="text-xs text-gray-600 font-medium mb-3 leading-relaxed">
            <span className="font-black text-amber-800">Daily quest</span> (amber checkboxes) and{' '}
            <span className="font-black text-teal-800">writing exercises</span> (teal checkboxes) are{' '}
            <span className="font-black text-gray-800">independent</span>—pick different words for each.
          </p>
          {(dailyWordIds.length > 0 || writingExerciseWordIds.length > 0) && (
            <p className="text-xs font-bold text-gray-800 mb-3">
              {dailyWordIds.length > 0 && (
                <span className="text-amber-900">
                  {dailyWordIds.length} word{dailyWordIds.length !== 1 ? 's' : ''} in daily quest
                </span>
              )}
              {dailyWordIds.length > 0 && writingExerciseWordIds.length > 0 && <span className="text-gray-400 mx-2">·</span>}
              {writingExerciseWordIds.length > 0 && (
                <span className="text-teal-900">
                  {writingExerciseWordIds.length} word{writingExerciseWordIds.length !== 1 ? 's' : ''} for writing
                  exercises — use the <span className="font-black">Writing exercise words</span> panel (same layout as
                  Today&apos;s Daily Quest) to unpin or clear all.
                </span>
              )}
            </p>
          )}

          {/* Filter Controls */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {/* Search Filter */}
            <div className="md:col-span-2">
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Search words, definitions, grammar, semantic…"
                className="w-full bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-medium text-sm text-gray-900"
              />
            </div>

            {/* Year Group Filter */}
            <select
              value={filterYearGroup}
              onChange={(e) => setFilterYearGroup(e.target.value)}
              className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-sm text-gray-900 cursor-pointer"
            >
              <option value="all">All Year Groups</option>
              {uniqueYearGroups.map(yg => (
                <option key={yg} value={yg}>{yg}</option>
              ))}
            </select>

            {/* Learning Point Filter (Prefix/Suffix) */}
            <select
              value={filterLearningPoint}
              onChange={(e) => setFilterLearningPoint(e.target.value)}
              className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-sm text-gray-900 cursor-pointer"
            >
              <option value="all">All Patterns</option>
              {uniqueLearningPoints.map(lp => (
                <option key={lp} value={lp}>{lp}</option>
              ))}
            </select>

            {/* Word family filter */}
            <div className="flex gap-2">
              <select
                value={filterWordFamily}
                onChange={(e) => setFilterWordFamily(e.target.value)}
                className="flex-1 bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-bold text-sm text-gray-900 cursor-pointer"
              >
                <option value="all">All families</option>
                {uniqueWordFamilies.map(fam => (
                  <option key={fam} value={fam}>{fam}</option>
                ))}
              </select>
              
              {(filterYearGroup !== 'all' || filterLearningPoint !== 'all' || filterWordFamily !== 'all' || filterGrammar !== 'all' || filterWriting !== 'all' || filterSemantic !== 'all' || filterPinnedOnly || filterSearch.trim()) && (
                <button
                  onClick={clearFilters}
                  className="bg-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-bold hover:bg-gray-300 transition-all text-sm"
                  title="Clear all filters"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <select
              value={filterGrammar}
              onChange={(e) => setFilterGrammar(e.target.value)}
              className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-sm text-gray-900 cursor-pointer"
            >
              <option value="all">All grammar</option>
              {uniqueGrammars.map(g => (
                <option key={g} value={g}>{humanizeCurriculumLabel(g)}</option>
              ))}
            </select>
            <select
              value={filterWriting}
              onChange={(e) => setFilterWriting(e.target.value)}
              className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-sm text-gray-900 cursor-pointer"
            >
              <option value="all">All writing</option>
              {uniqueWritings.map(x => (
                <option key={x} value={x}>{humanizeCurriculumLabel(x)}</option>
              ))}
            </select>
            <select
              value={filterSemantic}
              onChange={(e) => setFilterSemantic(e.target.value)}
              className="bg-white border-2 border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-sm text-gray-900 cursor-pointer"
            >
              <option value="all">All semantic</option>
              {uniqueSemantics.map(s => (
                <option key={s} value={s}>{humanizeCurriculumLabel(s)}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 text-gray-400 text-[10px] uppercase font-black border-b tracking-widest">
              <tr>
                <th className="pl-4 pr-1 py-5 w-[4.5rem] text-center align-bottom" title="Words in the student’s daily quest (flashcards / quiz)">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[9px] font-black text-amber-700 tracking-tight leading-tight normal-case">Daily</span>
                    <input
                      type="checkbox"
                      checked={allPageDailySelected}
                      onChange={() => { void toggleSelectAllDailyOnPage(); }}
                      disabled={paginatedWords.length === 0 || dailyBulkReplacing}
                      className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                      aria-label="Select all words on this page for daily quest"
                    />
                  </div>
                </th>
                <th className="pr-1 py-5 w-[4.5rem] text-center align-bottom" title="Words used when you open Writing exercises">
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[9px] font-black text-teal-700 tracking-tight leading-tight normal-case">Writing</span>
                    <input
                      type="checkbox"
                      checked={allPageExerciseSelected}
                      onChange={toggleSelectAllExerciseWordsOnPage}
                      disabled={paginatedWords.length === 0}
                      className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                      aria-label="Select all words on this page for writing exercises"
                    />
                  </div>
                </th>
                <th className="px-6 py-5 min-w-[140px]">Word</th>
                <th className="px-4 py-5 whitespace-nowrap">Year</th>
                <th className="px-4 py-5 min-w-[100px]">Learning Point</th>
                <th className="px-4 py-5 min-w-[80px]">PoS</th>
                <th className="px-4 py-5 min-w-[90px]">Grammar</th>
                <th className="px-4 py-5 min-w-[90px]">Writing</th>
                <th className="px-4 py-5 min-w-[90px]">Semantic</th>
                <th className="px-6 py-5 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedWords.map(w => {
                const isDaily = dailyWordIds.includes(w.id);
                return (
                  <tr key={w.id} className={`transition-colors group text-sm ${isDaily ? 'bg-amber-50/30' : 'hover:bg-indigo-50/30'}`}>
                    <td className="pl-4 pr-1 py-5 align-top text-center">
                      <input
                        type="checkbox"
                        checked={isDaily}
                        onChange={() => onToggleDaily(w.id)}
                        disabled={dailyBulkReplacing}
                        className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer mt-1"
                        aria-label={`Include ${w.word} in daily quest`}
                      />
                    </td>
                    <td className="pr-1 py-5 align-top text-center">
                      <input
                        type="checkbox"
                        checked={writingExerciseWordIds.includes(w.id)}
                        onChange={() => toggleExerciseWordSelection(w.id)}
                        className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer mt-1"
                        aria-label={`Select ${w.word} for writing exercises`}
                      />
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-black text-gray-900 text-lg">{formatWordForDisplay(w.word)}</div>
                      {w.wordFamily && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-3 py-0.5 text-[10px] font-black uppercase tracking-widest text-blue-700">
                            <span className="text-[11px]">🧭</span>
                            <span>Word family: {w.wordFamily}</span>
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-8 py-5">
                      <span className="bg-white border-2 px-3 py-1.5 rounded-xl text-[10px] font-black text-gray-700 uppercase shadow-sm">
                        {w.yearGroup}
                      </span>
                    </td>
                    <td className="px-4 py-5 align-top">
                      <span className="text-indigo-600 font-black bg-indigo-50 px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-wider inline-block max-w-[200px] break-words">
                        {w.learningPoint}
                      </span>
                    </td>
                    <td className="px-4 py-5 align-top text-xs text-gray-700 max-w-[120px]">
                      {w.partOfSpeech ? (
                        <span className="font-bold bg-slate-100 px-2 py-1 rounded-lg">{humanizeCurriculumLabel(w.partOfSpeech)}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-5 align-top text-xs text-gray-700 max-w-[160px]">
                      {w.grammar && w.grammar.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {w.grammar.map(t => (
                            <span key={t} className="font-semibold text-teal-800 bg-teal-50 px-2 py-0.5 rounded-lg text-[10px] leading-tight">
                              {humanizeCurriculumLabel(t)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-5 align-top text-xs text-gray-700 max-w-[160px]">
                      {w.writing && w.writing.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {w.writing.map(t => (
                            <span key={t} className="font-semibold text-violet-800 bg-violet-50 px-2 py-0.5 rounded-lg text-[10px] leading-tight">
                              {humanizeCurriculumLabel(t)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-5 align-top text-xs text-gray-700 max-w-[160px]">
                      {w.semantic && w.semantic.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {w.semantic.map(t => (
                            <span key={t} className="font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-lg text-[10px] leading-tight">
                              {humanizeCurriculumLabel(t)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {needsEnriching(w) && (
                          <button
                            onClick={() => handleEnrichWord(w)}
                            disabled={!!enrichingWordId || enrichingAll}
                            className="text-gray-300 hover:text-emerald-500 font-bold transition-colors p-2"
                            title="Fill example, synonyms & antonyms with AI"
                          >
                            {enrichingWordId === w.id ? (
                              <svg className="w-5 h-5 animate-spin text-emerald-500" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : (
                              <span className="text-lg" title="Enrich with AI">✨</span>
                            )}
                          </button>
                        )}
                        <button 
                          onClick={() => startEditing(w)}
                          className="text-gray-300 hover:text-indigo-500 font-bold transition-colors p-2"
                          title="Edit Word"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button 
                          onClick={() => removeWord(w.id)}
                          className="text-gray-300 hover:text-red-500 font-bold transition-colors p-2"
                          title="Delete Word"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {wordBank.length > 0 && filteredWords.length > 0 && wordBankTotalPages > 1 && (
          <div className="flex items-center justify-center gap-4 px-8 py-4 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={() => setWordBankPage(p => Math.max(1, p - 1))}
              disabled={wordBankPage <= 1}
              className="bg-white border-2 border-indigo-200 text-indigo-700 px-5 py-2.5 rounded-xl font-black text-sm hover:bg-indigo-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Previous
            </button>
            <span className="text-sm font-bold text-gray-700">
              Page {wordBankPage} of {wordBankTotalPages}
            </span>
            <button
              onClick={() => setWordBankPage(p => Math.min(wordBankTotalPages, p + 1))}
              disabled={wordBankPage >= wordBankTotalPages}
              className="bg-white border-2 border-indigo-200 text-indigo-700 px-5 py-2.5 rounded-xl font-black text-sm hover:bg-indigo-50 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              Next
            </button>
          </div>
        )}
        {wordBank.length === 0 && (
          <div className="p-20 text-center">
            <div className="text-7xl mb-6">📚</div>
            <h4 className="text-2xl font-black text-gray-900">Your word bank is empty!</h4>
            <p className="text-gray-500 max-w-sm mx-auto mt-2 font-medium">Add words manually or use the AI generator to start building your students' daily quest list.</p>
          </div>
        )}
        {wordBank.length > 0 && filteredWords.length === 0 && (
          <div className="p-20 text-center">
            <div className="text-6xl mb-4">🔍</div>
            <h4 className="text-xl font-black text-gray-900 mb-2">No words match your filters</h4>
            <p className="text-gray-500 text-sm mb-4">Try adjusting your search or filter criteria.</p>
            <button
              onClick={clearFilters}
              className="bg-indigo-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-indigo-700 transition-all"
            >
              Clear All Filters
            </button>
          </div>
        )}
      </div>

      {/* Edit Word Modal */}
      {editingWord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-8 py-6 flex items-center justify-between">
              <h2 className="text-2xl font-black text-gray-900">Edit Word</h2>
              <button
                onClick={cancelEditing}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              {/* Word */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Word</label>
                <input
                  type="text"
                  value={editFormData.word || ''}
                  onChange={(e) => handleEditFieldChange('word', e.target.value)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold text-gray-900"
                />
              </div>

              {/* Definition */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Definition</label>
                <textarea
                  value={editFormData.definition || ''}
                  onChange={(e) => handleEditFieldChange('definition', e.target.value)}
                  rows={3}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Root */}
                <div>
                  <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Root</label>
                  <input
                    type="text"
                    value={editFormData.root || ''}
                    onChange={(e) => handleEditFieldChange('root', e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                  />
                </div>

                {/* Origin */}
                <div>
                  <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Origin</label>
                  <input
                    type="text"
                    value={editFormData.origin || ''}
                    onChange={(e) => handleEditFieldChange('origin', e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                  />
                </div>
              </div>

              {/* Year Group & Learning Point */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Year Group</label>
                  <select
                    value={editFormData.yearGroup || 'Year 5'}
                    onChange={(e) => handleEditFieldChange('yearGroup', e.target.value as YearGroup)}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-bold text-gray-900 cursor-pointer"
                  >
                    <option value="Year 3">Year 3</option>
                    <option value="Year 4">Year 4</option>
                    <option value="Year 5">Year 5</option>
                    <option value="Year 6">Year 6</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Learning Point</label>
                  <input
                    type="text"
                    value={editFormData.learningPoint || ''}
                    onChange={(e) => handleEditFieldChange('learningPoint', e.target.value)}
                    className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                  />
                </div>
              </div>

              {/* Part of speech (single choice) */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Part of speech</label>
                <p className="text-xs text-gray-500 mb-2">Choose one value only.</p>
                <select
                  value={editFormData.partOfSpeech || ''}
                  onChange={(e) => handleEditFieldChange('partOfSpeech', e.target.value || undefined)}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900 cursor-pointer"
                >
                  <option value="">— None —</option>
                  {PART_OF_SPEECH_VALUES.map(pos => (
                    <option key={pos} value={pos}>{humanizeCurriculumLabel(pos)}</option>
                  ))}
                </select>
              </div>

              {/* Grammar tags (TEXT[] — multiple allowed) */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-1 uppercase tracking-wide">Grammar tags</label>
                <p className="text-xs text-gray-500 mb-2">Select any that apply (saved as a text array).</p>
                <div className="max-h-44 overflow-y-auto border-2 border-gray-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/50">
                  {GRAMMAR_TAGS.map(tag => {
                    const checked = (editFormData.grammar as string[] | undefined)?.includes(tag) ?? false;
                    return (
                      <label key={tag} className="flex items-start gap-2 text-sm cursor-pointer text-gray-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCurriculumTag('grammar', tag)}
                          className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{humanizeCurriculumLabel(tag)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Writing tags */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-1 uppercase tracking-wide">Writing tags</label>
                <p className="text-xs text-gray-500 mb-2">Select any that apply.</p>
                <div className="max-h-44 overflow-y-auto border-2 border-gray-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/50">
                  {WRITING_TAGS.map(tag => {
                    const checked = (editFormData.writing as string[] | undefined)?.includes(tag) ?? false;
                    return (
                      <label key={tag} className="flex items-start gap-2 text-sm cursor-pointer text-gray-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCurriculumTag('writing', tag)}
                          className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{humanizeCurriculumLabel(tag)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Semantic tags */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-1 uppercase tracking-wide">Semantic tags</label>
                <p className="text-xs text-gray-500 mb-2">Select any that apply.</p>
                <div className="max-h-44 overflow-y-auto border-2 border-gray-200 rounded-xl p-3 grid grid-cols-1 sm:grid-cols-2 gap-2 bg-gray-50/50">
                  {SEMANTIC_TAGS.map(tag => {
                    const checked = (editFormData.semantic as string[] | undefined)?.includes(tag) ?? false;
                    return (
                      <label key={tag} className="flex items-start gap-2 text-sm cursor-pointer text-gray-800">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCurriculumTag('semantic', tag)}
                          className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span>{humanizeCurriculumLabel(tag)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Example */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Example Sentence</label>
                <textarea
                  value={editFormData.example || ''}
                  onChange={(e) => handleEditFieldChange('example', e.target.value)}
                  rows={2}
                  className="w-full bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                />
              </div>

              {/* Synonyms */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Synonyms</label>
                <div className="space-y-2">
                  {(editFormData.synonyms || []).map((syn, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={syn}
                        onChange={(e) => handleEditArrayFieldChange('synonyms', index, e.target.value)}
                        className="flex-1 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                      />
                      <button
                        onClick={() => removeArrayItem('synonyms', index)}
                        className="text-red-500 hover:text-red-700 px-3 py-2 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addArrayItem('synonyms')}
                    className="text-indigo-600 hover:text-indigo-700 font-bold text-sm"
                  >
                    + Add Synonym
                  </button>
                </div>
              </div>

              {/* Antonyms */}
              <div>
                <label className="block text-sm font-black text-gray-700 mb-2 uppercase tracking-wide">Antonyms</label>
                <div className="space-y-2">
                  {(editFormData.antonyms || []).map((ant, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="text"
                        value={ant}
                        onChange={(e) => handleEditArrayFieldChange('antonyms', index, e.target.value)}
                        className="flex-1 bg-gray-50 border-2 border-gray-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none font-medium text-gray-900"
                      />
                      <button
                        onClick={() => removeArrayItem('antonyms', index)}
                        className="text-red-500 hover:text-red-700 px-3 py-2 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addArrayItem('antonyms')}
                    className="text-indigo-600 hover:text-indigo-700 font-bold text-sm"
                  >
                    + Add Antonym
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-4 border-t">
                <button
                  onClick={saveEdit}
                  disabled={savingEdit}
                  className="flex-1 bg-indigo-600 text-white px-6 py-4 rounded-xl font-black hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all shadow-md"
                >
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={cancelEditing}
                  disabled={savingEdit}
                  className="px-6 py-4 rounded-xl font-bold border-2 border-gray-200 hover:bg-gray-50 transition-all text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <WritingExercisesModal
        open={writingExercisesOpen}
        onClose={() => setWritingExercisesOpen(false)}
        selectedWords={selectedWordsForExercises}
        assignStudentId={studentId}
        assignStudentName={studentName}
        onAssigned={refreshPastWritingAssignments}
      />
    </div>
  );
};

export default TutorDashboard;
