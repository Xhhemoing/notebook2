'use client';

import React, { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, Timer, X, Maximize2, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppContext } from '@/lib/store';

export function FocusTimer() {
  const { state, dispatch } = useAppContext();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [timeLeft, setTimeLeft] = useState(25 * 60); // 25 minutes
  const [isActive, setIsActive] = useState(false);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((time) => {
          if (time <= 1) {
            setIsActive(false);
            return 0;
          }
          return time - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  // Handle transition in an effect but avoid cascading by checking condition strictly
  useEffect(() => {
    if (timeLeft === 0 && !isActive) {
      const timer = setTimeout(() => {
        if (mode === 'focus') {
          setMode('break');
          setTimeLeft(5 * 60);
        } else {
          setMode('focus');
          setTimeLeft(25 * 60);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, isActive, mode]);

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(mode === 'focus' ? 25 * 60 : 5 * 60);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 left-6 z-50 p-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full shadow-2xl transition-all hover:scale-110 flex items-center justify-center group"
        title="专注时钟"
      >
        <Timer className="w-5 h-5" />
        {isActive && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
          </span>
        )}
      </button>
    );
  }

  if (isMinimized) {
    return (
      <div className="fixed bottom-6 left-6 z-50 flex items-center gap-2 bg-slate-900 border border-slate-700 p-2 rounded-full shadow-2xl animate-in slide-in-from-bottom-5">
        <button
          onClick={() => setIsMinimized(false)}
          className="px-3 text-sm font-bold font-mono text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {formatTime(timeLeft)}
        </button>
        <button
          onClick={toggleTimer}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-300 transition-colors"
        >
          {isActive ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-full transition-colors mr-1"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const progress = mode === 'focus' 
    ? ((25 * 60 - timeLeft) / (25 * 60)) * 100 
    : ((5 * 60 - timeLeft) / (5 * 60)) * 100;

  return (
    <div className="fixed bottom-6 left-6 z-50 w-64 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
      <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-900">
        <div className="flex items-center gap-2">
          <Timer className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold text-slate-300 tracking-wider">专注时钟</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMinimized(true)} className="p-1 text-slate-500 hover:bg-slate-800 rounded-lg">
            <Minimize2 className="w-3 h-3" />
          </button>
          <button onClick={() => setIsOpen(false)} className="p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400 rounded-lg">
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>
      
      <div className="p-5 flex flex-col items-center">
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl mb-6 border border-slate-800">
          <button 
            onClick={() => { setMode('focus'); setIsActive(false); setTimeLeft(25 * 60); }}
            className={clsx('px-3 py-1 text-xs font-bold rounded-lg transition-all', mode === 'focus' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800')}
          >
            专注
          </button>
          <button 
            onClick={() => { setMode('break'); setIsActive(false); setTimeLeft(5 * 60); }}
            className={clsx('px-3 py-1 text-xs font-bold rounded-lg transition-all', mode === 'break' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:bg-slate-800')}
          >
            休息
          </button>
        </div>

        <div className="relative w-32 h-32 flex items-center justify-center mb-6">
          <svg className="absolute inset-0 w-full h-full -rotate-90">
            <circle cx="64" cy="64" r="60" className="stroke-slate-800" strokeWidth="4" fill="none" />
            <circle 
              cx="64" cy="64" r="60" 
              className={clsx("transition-all duration-1000", mode === 'focus' ? 'stroke-indigo-500' : 'stroke-emerald-500')} 
              strokeWidth="4" fill="none" 
              strokeDasharray="377" 
              strokeDashoffset={377 - (377 * progress) / 100}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-3xl font-black text-white tracking-tight font-mono">{formatTime(timeLeft)}</span>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={toggleTimer}
            className={clsx(
              "w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-xl",
              isActive ? "bg-amber-500 hover:bg-amber-400 text-slate-900" : (mode === 'focus' ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white")
            )}
          >
            {isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
          </button>
          <button 
            onClick={resetTimer}
            className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all"
            title="重置"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
