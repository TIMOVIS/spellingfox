
import React, { useState, useRef, useEffect } from 'react';
import { WordEntry, YearGroup } from '../types';
import { generateWordExplanation, extractVocabularyFromFile, generateDailySpellingList } from '../geminiService';
import { getAllWords, addWord as addWordToSupabase, toggleDailyQuestWord, updateWord as updateWordInSupabase, deleteWord as deleteWordFromSupabase, getStudentDailyQuestDates, getStudentDailyQuests, getStudentProgress, getStudentPracticeHistoryByDate, assignWordsToDailyQuest, getTodayLondonDate } from '../lib/supabaseQueries';
import { formatWordForDisplay } from '../lib/wordDisplay';
import { VocabWord } from '../lib/supabase';
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

interface TutorDashboardProps {
  studentName: string;
  studentId: string;
  wordBank: WordEntry[];
  dailyWordIds: string[];
  allStudents: { id: string; name: string }[];
  onBulkAssignDailyQuest: (studentIds: string[], wordIds: string[]) => Promise<void>;
  /** Replace the full daily quest word-id list (used for bulk select on page). */
  onReplaceDailyQuest: (wordIds: string[]) => Promise<void>;
  onUpdateWords: (newWords: WordEntry[]) => void;
  onToggleDaily: (id: string) => void;
  onRefetchDailyQuest?: () => Promise<void>;
  onBack: () => void;
}

const TutorDashboard: React.FC<TutorDashboardProps> = ({ studentName, studentId, wordBank, dailyWordIds, allStudents, onBulkAssignDailyQuest, onReplaceDailyQuest, onUpdateWords, onToggleDaily, onRefetchDailyQuest, onBack }) => {
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
  const [selectedExerciseWordIds, setSelectedExerciseWordIds] = useState<Set<string>>(new Set());
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

  /** True if word is missing definition, placeholder example, or empty synonyms/antonyms — AI can fill these */
  const needsEnriching = (w: WordEntry) => {
    const missingDefinition = !w.definition?.trim();
    const placeholderExample = /example (sentence )?to be (updated|provided) by (the )?teacher/i;
    const emptyExample = !w.example?.trim() || placeholderExample.test(w.example);
    const emptySynonyms = !w.synonyms?.length;
    const emptyAntonyms = !w.antonyms?.length;
    return missingDefinition || emptyExample || emptySynonyms || emptyAntonyms;
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
      setError('No words need enriching. All have definitions, examples, synonyms, and antonyms.');
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
    setSelectedExerciseWordIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllExerciseWordsOnPage = () => {
    const ids = paginatedWords.map(w => w.id);
    setSelectedExerciseWordIds(prev => {
      const next = new Set(prev);
      const allOn = ids.length > 0 && ids.every(id => next.has(id));
      if (allOn) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const selectedWordsForExercises = wordBank.filter(w => selectedExerciseWordIds.has(w.id));
  const allPageExerciseSelected =
    paginatedWords.length > 0 && paginatedWords.every(w => selectedExerciseWordIds.has(w.id));
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
                 disabled={selectedExerciseWordIds.size === 0}
                 className="bg-teal-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm hover:bg-teal-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                 title="Generate printable writing tasks from ticked words"
               >
                 📝 Writing exercises
                 {selectedExerciseWordIds.size > 0 && (
                   <span className="bg-white/20 px-2 py-0.5 rounded-lg">{selectedExerciseWordIds.size}</span>
                 )}
               </button>
            </div>
          </div>
          <p className="text-xs text-gray-600 font-medium mb-3 leading-relaxed">
            <span className="font-black text-amber-800">Daily quest</span> (amber checkboxes) and{' '}
            <span className="font-black text-teal-800">writing exercises</span> (teal checkboxes) are{' '}
            <span className="font-black text-gray-800">independent</span>—pick different words for each.
          </p>
          {(dailyWordIds.length > 0 || selectedExerciseWordIds.size > 0) && (
            <p className="text-xs font-bold text-gray-800 mb-3">
              {dailyWordIds.length > 0 && (
                <span className="text-amber-900">
                  {dailyWordIds.length} word{dailyWordIds.length !== 1 ? 's' : ''} in daily quest
                </span>
              )}
              {dailyWordIds.length > 0 && selectedExerciseWordIds.size > 0 && <span className="text-gray-400 mx-2">·</span>}
              {selectedExerciseWordIds.size > 0 && (
                <span className="text-teal-900">
                  {selectedExerciseWordIds.size} word{selectedExerciseWordIds.size !== 1 ? 's' : ''} for writing exercises
                  {' · '}
                  <button
                    type="button"
                    className="underline hover:text-teal-950 font-black"
                    onClick={() => setSelectedExerciseWordIds(new Set())}
                  >
                    Clear writing selection
                  </button>
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
                        checked={selectedExerciseWordIds.has(w.id)}
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
      />
    </div>
  );
};

export default TutorDashboard;
