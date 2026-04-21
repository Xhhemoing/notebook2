'use client';

import { useAppContext } from '@/lib/store';
import { Subject } from '@/lib/types';
import { clsx } from 'clsx';

import { Menu } from 'lucide-react';

const SUBJECTS: Subject[] = ['语文', '数学', '英语', '物理', '化学', '生物'];

export function SubjectSelector({ onMenuClick }: { onMenuClick?: () => void }) {
  const { state, dispatch } = useAppContext();

  return (
    <div className="flex items-center gap-2 p-3 bg-black border-b border-slate-900 sticky top-0 z-10 backdrop-blur-md bg-black/80 overflow-x-auto no-scrollbar">
      {onMenuClick && (
        <button 
          onClick={onMenuClick}
          className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}
      <div className="flex gap-2">
        {SUBJECTS.map((sub) => (
          <button
            key={sub}
            onClick={() => dispatch({ type: 'SET_SUBJECT', payload: sub })}
            className={clsx(
              'px-4 py-1.5 rounded-xl text-[0.7rem] font-bold uppercase tracking-widest transition-all duration-300 border shrink-0',
              state.currentSubject === sub
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20 scale-105'
                : 'bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700 hover:text-slate-300'
            )}
          >
            {sub}
          </button>
        ))}
      </div>
    </div>
  );
}
