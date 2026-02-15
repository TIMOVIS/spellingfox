
import React from 'react';
import { UserRole } from '../types';

interface NavbarProps {
  role: UserRole;
  points: number;
  streak: number;
  onToggleRole: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ role, points, streak, onToggleRole }) => {
  return (
    <nav className="bg-white shadow-sm border-b px-6 py-4 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-3 group cursor-pointer">
        <div className="bg-orange-500 p-1 rounded-2xl shadow-lg transform group-hover:rotate-12 transition-transform duration-300">
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Ears */}
            <path d="M4 8L8 2L11 8H4Z" fill="#F97316" />
            <path d="M20 8L16 2L13 8H20Z" fill="#F97316" />
            <path d="M5.5 7.5L8 4L10 7.5H5.5Z" fill="#374151" />
            <path d="M18.5 7.5L16 4L14 7.5H18.5Z" fill="#374151" />
            
            {/* Main Head Shape */}
            <path d="M12 22C16.4183 22 20 18.4183 20 14C20 9.58172 16.4183 6 12 6C7.58172 6 4 9.58172 4 14C4 18.4183 7.58172 22 12 22Z" fill="#F97316" />
            
            {/* Snout/Cheeks */}
            <path d="M4 14C4 16.5 7 20 12 21.5C17 20 20 16.5 20 14H4Z" fill="white" />
            
            {/* Nose */}
            <path d="M11 18H13L12 19.5L11 18Z" fill="#111827" />
            
            {/* Eyes */}
            <circle cx="8.5" cy="13.5" r="1.2" fill="#111827" />
            <circle cx="15.5" cy="13.5" r="1.2" fill="#111827" />
            
            {/* Eye Shine */}
            <circle cx="8.8" cy="13.2" r="0.4" fill="white" />
            <circle cx="15.8" cy="13.2" r="0.4" fill="white" />
          </svg>
        </div>
        <span className="text-3xl font-black text-orange-600 tracking-tighter">Spelling <span className="text-indigo-900">Fox</span></span>
      </div>

      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-4">
          <div className="bg-orange-100 px-3 py-1 rounded-full flex items-center gap-1 border border-orange-200">
            <span className="text-orange-600 animate-pulse">🔥</span>
            <span className="font-bold text-orange-800 tracking-tight">{streak} Day Streak</span>
          </div>
          <div className="bg-indigo-100 px-3 py-1 rounded-full flex items-center gap-1 border border-indigo-200">
            <span className="text-indigo-600">💎</span>
            <span className="font-bold text-indigo-800 tracking-tight">{points} Points</span>
          </div>
        </div>

        <button 
          onClick={onToggleRole}
          className={`px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest transition-all shadow-sm ${
            role === 'student' 
            ? 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200' 
            : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200'
          }`}
        >
          {role === 'student' ? 'Teacher Mode' : 'Student Mode'}
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
