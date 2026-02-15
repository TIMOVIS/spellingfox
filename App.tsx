
import React, { useState, useEffect } from 'react';
import { UserRole, AppState, WordEntry, StudentData } from './types';
import StudentDashboard from './components/StudentDashboard';
import StudentNameEntry from './components/StudentNameEntry';
import TutorDashboard from './components/TutorDashboard';
import StudentSelector from './components/StudentSelector';
import Navbar from './components/Navbar';
import { toggleDailyQuestWord, addStudent as addStudentToSupabase, deleteStudent as deleteStudentFromSupabase, getAllStudents, getStudentProgress, getDailyQuestWordIds, getStudent, addPointsToStudent } from './lib/supabaseQueries';
import { getAllWords } from './lib/supabaseQueries';
import { VocabWord } from './lib/supabase';

const INITIAL_WORD_BANK: WordEntry[] = [
  {
    id: '1',
    word: 'Benevolent',
    definition: 'Well-meaning and kindly; desiring to do good for others.',
    root: 'Bene (Good)',
    origin: 'Latin',
    synonyms: ['Kind', 'Generous', 'Compassionate'],
    antonyms: ['Malevolent', 'Spiteful', 'Cruel'],
    example: 'The benevolent headmaster, much like Albus Dumbledore, always had a twinkle in his eye and a lemon sherbet for a troubled student.',
    yearGroup: 'Year 5',
    learningPoint: '-ent suffix'
  },
  {
    id: '2',
    word: 'Dormant',
    definition: 'In a deep sleep or state of rest; inactive for a period of time.',
    root: 'Dorm (Sleep)',
    origin: 'Latin',
    synonyms: ['Inactive', 'Sleeping', 'Latent'],
    antonyms: ['Active', 'Awake', 'Lively'],
    example: 'Deep in the Lonely Mountain, the dragon Smaug lay dormant for decades, guarding his stolen treasure in silence.',
    yearGroup: 'Year 5',
    learningPoint: '-ant suffix'
  },
  {
    id: '3',
    word: 'Courageous',
    definition: 'Showing great bravery and not being deterred by danger or pain.',
    root: 'Cor (Heart)',
    origin: 'Latin',
    synonyms: ['Brave', 'Valiant', 'Heroic'],
    antonyms: ['Cowardly', 'Timid', 'Fearful'],
    example: 'Lucy Pevensie was a courageous explorer, stepping through the wardrobe into the snowy woods of Narnia without a second thought.',
    yearGroup: 'Year 4',
    learningPoint: '-ous suffix'
  }
];

// Helper function to convert VocabWord to WordEntry
const convertVocabWordToWordEntry = (vocabWord: any): WordEntry => {
  return {
    id: vocabWord.id,
    word: vocabWord.word,
    definition: vocabWord.definition,
    root: vocabWord.root,
    origin: vocabWord.origin,
    synonyms: vocabWord.synonyms || [],
    antonyms: vocabWord.antonyms || [],
    example: vocabWord.example,
    yearGroup: vocabWord.year_group,
    learningPoint: vocabWord.learning_point
  };
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    role: 'student',
    studentName: '',
    points: 0,
    streak: 0,
    wordBank: [],
    dailyWordIds: [],
    activeExercise: null,
    students: [],
    selectedStudentId: null
  });
  const [studentEnteredName, setStudentEnteredName] = useState(false);
  const [loadingStudent, setLoadingStudent] = useState(false);
  const [currentStudentId, setCurrentStudentId] = useState<string | null>(null);

  // Load students from Supabase on mount
  useEffect(() => {
    const loadStudents = async () => {
      try {
        const vocabStudents = await getAllStudents();
        const allWords = await getAllWords();
        const wordEntries = allWords.map(convertVocabWordToWordEntry);
        
        // Load progress and daily quests for each student
        const studentsData: StudentData[] = await Promise.all(
          vocabStudents.map(async (student) => {
            const progress = await getStudentProgress(student.id);
            const dailyWordIds = await getDailyQuestWordIds(student.id);
            
            return {
              id: student.id,
              name: student.name,
              points: progress?.points || 0,
              streak: progress?.streak || 0,
              wordBank: wordEntries, // All students share the same word bank
              dailyWordIds: dailyWordIds
            };
          })
        );
        
        setState(prev => ({ ...prev, students: studentsData }));
      } catch (error) {
        console.error('Failed to load students from Supabase:', error);
        // Keep empty students array on error
      }
    };
    
    loadStudents();
  }, []);

  // Keep student view in sync with Supabase: re-fetch daily quest (and word bank) when student is viewing their dashboard
  // so teacher-pinned words show up without the student re-entering their name
  useEffect(() => {
    if (state.role !== 'student' || !currentStudentId) return;
    let cancelled = false;
    (async () => {
      try {
        const [allWords, dailyWordIds] = await Promise.all([
          getAllWords(),
          getDailyQuestWordIds(currentStudentId)
        ]);
        const wordEntries = allWords.map(convertVocabWordToWordEntry);
        if (!cancelled) {
          setState(prev => ({ ...prev, wordBank: wordEntries, dailyWordIds }));
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to refresh student daily quest:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [state.role, currentStudentId]);

  // When student tab gains focus, refresh daily quest so teacher-pinned words appear
  useEffect(() => {
    if (state.role !== 'student' || !currentStudentId) return;
    const onFocus = () => {
      getDailyQuestWordIds(currentStudentId).then(ids => {
        setState(prev => ({ ...prev, dailyWordIds: ids }));
      }).catch(e => console.error('Failed to refresh daily quest on focus:', e));
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [state.role, currentStudentId]);

  const toggleRole = () => {
    setState(prev => {
      if (prev.role === 'tutor') {
        // When switching from tutor to student, clear selected student and reset name entry
        setStudentEnteredName(false);
        setCurrentStudentId(null);
        return { 
          ...prev, 
          role: 'student', 
          selectedStudentId: null,
          studentName: '',
          points: 0,
          streak: 0,
          wordBank: [],
          dailyWordIds: []
        };
      } else {
        // When switching to tutor, keep selected student if any
        return { ...prev, role: 'tutor' };
      }
    });
  };

  const handleStudentNameSubmit = async (name: string) => {
    if (!name.trim()) return;
    
    setLoadingStudent(true);
    try {
      // Search for existing student by name (case-insensitive)
      const allStudents = await getAllStudents();
      let student = allStudents.find(s => s.name.toLowerCase() === name.trim().toLowerCase());
      
      // If student doesn't exist, create them
      if (!student) {
        student = await addStudentToSupabase(name.trim());
      }
      
      // Load student data
      const allWords = await getAllWords();
      const wordEntries = allWords.map(convertVocabWordToWordEntry);
      const progress = await getStudentProgress(student.id);
      const dailyWordIds = await getDailyQuestWordIds(student.id);
      
      // Update state with student data
      setState(prev => ({
        ...prev,
        studentName: student!.name,
        points: progress?.points || 0,
        streak: progress?.streak || 0,
        wordBank: wordEntries,
        dailyWordIds: dailyWordIds
      }));
      
      setCurrentStudentId(student.id);
      setStudentEnteredName(true);
    } catch (error) {
      console.error('Failed to load student:', error);
      // Still allow them to proceed with basic data
      setState(prev => ({
        ...prev,
        studentName: name.trim(),
        wordBank: [],
        dailyWordIds: []
      }));
      setStudentEnteredName(true);
    } finally {
      setLoadingStudent(false);
    }
  };

  const selectStudent = (studentId: string) => {
    setState(prev => ({ ...prev, selectedStudentId: studentId }));
  };

  const addStudent = async (name: string) => {
    try {
      // Add to Supabase
      const vocabStudent = await addStudentToSupabase(name);
      
      // Load all words for the word bank
      const allWords = await getAllWords();
      const wordEntries = allWords.map(convertVocabWordToWordEntry);
      
      // Create new student data
      const newStudent: StudentData = {
        id: vocabStudent.id,
        name: vocabStudent.name,
        points: 0,
        streak: 0,
        wordBank: wordEntries,
        dailyWordIds: []
      };
      
      // Update local state
      setState(prev => ({
        ...prev,
        students: [...prev.students, newStudent]
      }));
    } catch (error) {
      console.error('Failed to add student to Supabase:', error);
      // Still add to local state for immediate feedback
      const tempStudent: StudentData = {
        id: `temp-${Date.now()}`,
        name,
        points: 0,
        streak: 0,
        wordBank: [],
        dailyWordIds: []
      };
      setState(prev => ({
        ...prev,
        students: [...prev.students, tempStudent]
      }));
    }
  };

  const deleteStudent = async (studentId: string) => {
    try {
      // Delete from Supabase (this will cascade delete progress and daily quests)
      await deleteStudentFromSupabase(studentId);
      
      // Update local state
      setState(prev => {
        // If the deleted student was selected, clear the selection
        const newSelectedId = prev.selectedStudentId === studentId ? null : prev.selectedStudentId;
        
        return {
          ...prev,
          students: prev.students.filter(s => s.id !== studentId),
          selectedStudentId: newSelectedId
        };
      });
    } catch (error) {
      console.error('Failed to delete student from Supabase:', error);
      // Still remove from local state for immediate feedback
      setState(prev => {
        const newSelectedId = prev.selectedStudentId === studentId ? null : prev.selectedStudentId;
        
        return {
          ...prev,
          students: prev.students.filter(s => s.id !== studentId),
          selectedStudentId: newSelectedId
        };
      });
    }
  };

  const getSelectedStudent = (): StudentData | null => {
    if (!state.selectedStudentId) return null;
    return state.students.find(s => s.id === state.selectedStudentId) || null;
  };

  const updateWordBank = (newWords: WordEntry[]) => {
    setState(prev => ({
      ...prev,
      students: prev.students.map(s => ({ ...s, wordBank: newWords }))
    }));
  };

  const toggleDailyWord = async (wordId: string) => {
    const selectedStudent = getSelectedStudent();
    if (!selectedStudent) return;
    
    // Update local state first for immediate UI feedback
    setState(prev => {
      const student = prev.students.find(s => s.id === selectedStudent.id);
      if (!student) return prev;
      
      const isDaily = student.dailyWordIds.includes(wordId);
      return {
        ...prev,
        students: prev.students.map(s => 
          s.id === selectedStudent.id
            ? {
                ...s,
                dailyWordIds: isDaily 
                  ? s.dailyWordIds.filter(id => id !== wordId)
                  : [...s.dailyWordIds, wordId]
              }
            : s
        )
      };
    });
    
    // Save to Supabase
    try {
      await toggleDailyQuestWord(selectedStudent.id, wordId);
    } catch (error) {
      console.error('Failed to save daily quest to Supabase:', error);
      // Revert local state on error
      setState(prev => {
        const student = prev.students.find(s => s.id === selectedStudent.id);
        if (!student) return prev;
        
        const isDaily = student.dailyWordIds.includes(wordId);
        return {
          ...prev,
          students: prev.students.map(s => 
            s.id === selectedStudent.id
              ? {
                  ...s,
                  dailyWordIds: isDaily 
                    ? [...s.dailyWordIds, wordId]
                    : s.dailyWordIds.filter(id => id !== wordId)
                }
              : s
          )
        };
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc]">
      <Navbar 
        role={state.role} 
        points={state.points} 
        streak={state.streak} 
        onToggleRole={toggleRole} 
      />
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {state.role === 'student' ? (
          !studentEnteredName ? (
            <StudentNameEntry 
              onSubmit={handleStudentNameSubmit}
              loading={loadingStudent}
            />
          ) : (
            <StudentDashboard 
              name={state.studentName} 
              wordBank={state.wordBank}
              dailyWordIds={state.dailyWordIds}
              onCompleteExercise={async (pts) => {
                // Update local state immediately
                setState(prev => ({ ...prev, points: prev.points + pts }));
                // Save to Supabase
                if (currentStudentId) {
                  try {
                    await addPointsToStudent(currentStudentId, pts);
                  } catch (error) {
                    console.error('Failed to save points to Supabase:', error);
                  }
                }
              }}
            />
          )
        ) : state.selectedStudentId ? (
          <TutorDashboard 
            studentName={getSelectedStudent()?.name || ''}
            studentId={state.selectedStudentId}
            wordBank={getSelectedStudent()?.wordBank || []} 
            dailyWordIds={getSelectedStudent()?.dailyWordIds || []}
            onUpdateWords={updateWordBank}
            onToggleDaily={toggleDailyWord}
            onBack={() => setState(prev => ({ ...prev, selectedStudentId: null }))}
          />
        ) : (
          <StudentSelector
            students={state.students.map(s => ({ id: s.id, name: s.name }))}
            onSelectStudent={selectStudent}
            onAddStudent={addStudent}
            onDeleteStudent={deleteStudent}
          />
        )}
      </main>

      <footer className="bg-white border-t p-4 text-center text-gray-500 text-sm font-bold">
        <p>© 2024 Spelling Fox Quest. Learning is an adventure! 🦊</p>
      </footer>
    </div>
  );
};

export default App;
