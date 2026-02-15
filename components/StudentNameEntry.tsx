import React, { useState } from 'react';

interface StudentNameEntryProps {
  onSubmit: (name: string) => void;
  loading: boolean;
}

const StudentNameEntry: React.FC<StudentNameEntryProps> = ({ onSubmit, loading }) => {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onSubmit(name.trim());
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border-8 border-orange-100 flex flex-col">
        {/* Header Section */}
        <div className="bg-gradient-to-r from-orange-500 to-amber-500 p-12 text-center text-white relative">
          <div className="text-9xl mb-6">🦊</div>
          <h1 className="text-5xl font-black tracking-tight mt-4 leading-tight">
            Welcome to Spelling Fox Quest!
          </h1>
          <p className="text-orange-100 font-bold mt-4 text-xl opacity-90">
            Enter your name to begin your learning adventure
          </p>
          
          {/* Background Pattern */}
          <div className="absolute -bottom-6 -right-6 text-9xl opacity-10 rotate-12 pointer-events-none select-none">
            📚
          </div>
        </div>

        {/* Form Section */}
        <div className="p-12 bg-white">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="student-name" className="block text-lg font-black text-gray-900 mb-4">
                What's your name?
              </label>
              <input
                id="student-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name..."
                disabled={loading}
                className="w-full bg-gray-50 border-4 border-orange-200 rounded-2xl px-6 py-5 focus:ring-4 focus:ring-orange-400 focus:border-orange-500 outline-none transition-all font-bold text-xl text-gray-900 placeholder-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                autoFocus
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white px-8 py-6 rounded-2xl font-black text-xl shadow-lg hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 border-b-4 border-amber-600 flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Loading...</span>
                </>
              ) : (
                <>
                  <span>Start Learning</span>
                  <span className="text-2xl">→</span>
                </>
              )}
            </button>
          </form>
          
          <div className="mt-8 text-center">
            <p className="text-gray-500 text-sm font-medium">
              Don't worry if you're new - we'll create your profile automatically! 🎉
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentNameEntry;
