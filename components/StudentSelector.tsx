import React, { useState } from 'react';

interface Student {
  id: string;
  name: string;
}

interface StudentSelectorProps {
  students: Student[];
  onSelectStudent: (studentId: string) => void;
  onAddStudent: (name: string) => void;
  onDeleteStudent: (studentId: string) => void;
}

const StudentSelector: React.FC<StudentSelectorProps> = ({ students, onSelectStudent, onAddStudent, onDeleteStudent }) => {
  const [newStudentName, setNewStudentName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);

  const handleAddStudent = () => {
    if (newStudentName.trim()) {
      onAddStudent(newStudentName.trim());
      setNewStudentName('');
      setShowAddForm(false);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, studentId: string) => {
    e.stopPropagation(); // Prevent selecting the student when clicking delete
    setStudentToDelete(studentId);
  };

  const confirmDelete = () => {
    if (studentToDelete) {
      onDeleteStudent(studentToDelete);
      setStudentToDelete(null);
    }
  };

  const cancelDelete = () => {
    setStudentToDelete(null);
  };

  return (
    <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white rounded-[2.5rem] shadow-xl border-4 border-amber-400 p-12">
        <div className="text-center mb-10">
          <div className="text-7xl mb-6">👨‍🏫</div>
          <h1 className="text-5xl font-black text-gray-900 mb-4 tracking-tight">Teacher Portal</h1>
          <p className="text-xl text-gray-600 font-medium">Select a student to manage their curriculum</p>
        </div>

        {/* Student List */}
        <div className="mb-8">
          <h2 className="text-2xl font-black text-gray-900 mb-6 flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-indigo-500"></span>
            Your Students
          </h2>
          
          {students.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {students.map((student) => (
                <div
                  key={student.id}
                  className="relative bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6 rounded-2xl font-black text-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-between group border-b-4 border-indigo-700"
                >
                  <button
                    onClick={() => onSelectStudent(student.id)}
                    className="flex-1 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="text-4xl">👤</div>
                      <span>{student.name}</span>
                    </div>
                    <span className="text-2xl group-hover:translate-x-2 transition-transform">→</span>
                  </button>
                  <button
                    onClick={(e) => handleDeleteClick(e, student.id)}
                    className="ml-3 p-2 hover:bg-red-600 rounded-lg transition-colors"
                    title="Delete student"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-3xl border-4 border-dashed border-gray-200">
              <div className="text-6xl mb-4">📚</div>
              <p className="text-gray-500 font-bold text-lg">No students yet. Add your first student below!</p>
            </div>
          )}
        </div>

        {/* Add New Student */}
        <div className="border-t-4 border-gray-100 pt-8">
          {showAddForm ? (
            <div className="bg-indigo-50 p-6 rounded-2xl border-2 border-indigo-200">
              <h3 className="text-lg font-black text-indigo-900 mb-4 flex items-center gap-2">
                <span>➕</span> Add New Student
              </h3>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddStudent()}
                  placeholder="Enter student name..."
                  className="flex-grow bg-white border-2 border-indigo-200 rounded-xl px-6 py-4 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-bold text-lg text-gray-900"
                  autoFocus
                />
                <button
                  onClick={handleAddStudent}
                  className="bg-indigo-600 text-white px-8 rounded-xl font-black hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                >
                  ADD
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewStudentName('');
                  }}
                  className="bg-white text-gray-500 px-6 rounded-xl font-bold border-2 border-gray-200 hover:bg-gray-50 transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full bg-gradient-to-r from-amber-400 to-orange-500 text-white px-8 py-6 rounded-2xl font-black text-xl shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 border-b-4 border-amber-600"
            >
              <span className="text-2xl">➕</span>
              <span>Add New Student</span>
            </button>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border-4 border-red-400 animate-in zoom-in-95 duration-300">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h3 className="text-2xl font-black text-gray-900 mb-2">Delete Student?</h3>
              <p className="text-gray-600 mb-6">
                Are you sure you want to delete <span className="font-black text-red-600">
                  {students.find(s => s.id === studentToDelete)?.name}
                </span>? This will also delete all their progress and daily quests. This action cannot be undone.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={cancelDelete}
                  className="flex-1 bg-gray-200 text-gray-700 px-6 py-3 rounded-xl font-black hover:bg-gray-300 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 bg-red-600 text-white px-6 py-3 rounded-xl font-black hover:bg-red-700 transition-all"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentSelector;
