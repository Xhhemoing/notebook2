'use client';

import { BookOpen, BrainCircuit, MessageSquare, Network, PlusCircle, Settings, BookX, ChevronLeft, ChevronRight, GraduationCap, Search, User, LayoutDashboard, TrendingDown, Database, RefreshCw, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import { useAppContext, syncWithD1 } from '@/lib/store';

export type View = 'dashboard' | 'input' | 'graph' | 'memory' | 'mistakes' | 'chat' | 'settings' | 'review' | 'textbooks' | 'resources';

export function Sidebar({ 
  currentView, 
  setView,
  isMobileMenuOpen,
  setIsMobileMenuOpen
}: { 
  currentView: View; 
  setView: (v: View) => void;
  isMobileMenuOpen?: boolean;
  setIsMobileMenuOpen?: (v: boolean) => void;
}) {
  const { state, dispatch } = useAppContext();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await syncWithD1(state, dispatch);
    } catch (e) {
      console.error('Manual sync failed', e);
    } finally {
      setIsSyncing(false);
    }
  };

  const navItems = [
    { id: 'dashboard', label: '总览', icon: LayoutDashboard, color: 'text-blue-400' },
    { id: 'textbooks', label: '课本导入', icon: BookOpen, color: 'text-cyan-400' },
    { id: 'resources', label: '学习资源库', icon: Database, color: 'text-teal-400' },
    { id: 'input', label: '录入记忆', icon: PlusCircle, color: 'text-emerald-400' },
    { id: 'graph', label: '知识图谱', icon: Network, color: 'text-purple-400' },
    { id: 'memory', label: '记忆库', icon: BrainCircuit, color: 'text-amber-400' },
    { id: 'mistakes', label: '错题本', icon: BookX, color: 'text-red-400' },
    { id: 'review', label: '记忆复习', icon: GraduationCap, color: 'text-indigo-400' },
    { id: 'chat', label: 'AI 答疑', icon: MessageSquare, color: 'text-pink-400' },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/80 z-40 backdrop-blur-sm"
          onClick={() => setIsMobileMenuOpen?.(false)}
        />
      )}
      
      <div className={clsx(
        "bg-black text-slate-500 flex flex-col h-full border-r border-slate-900 transition-all duration-500 ease-in-out absolute md:relative z-50",
        isCollapsed ? "w-16" : "w-48 md:w-40",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
      {/* Header */}
      <div className={clsx("p-2 flex items-center mb-1", isCollapsed ? "justify-center" : "gap-2")}>
        <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0 shadow-2xl shadow-indigo-600/40 rotate-3 hover:rotate-0 transition-transform duration-300">
          <BrainCircuit className="w-3.5 h-3.5 text-white" />
        </div>
        {!isCollapsed && (
          <div className="flex flex-col">
            <h1 className="text-xs font-black text-white tracking-tighter uppercase">二轮复习助手</h1>
            <span className="text-[0.4rem] font-bold text-slate-600 uppercase tracking-[0.2em]">内测版 2.0</span>
          </div>
        )}
      </div>

      {/* Search Bar */}
      {!isCollapsed && (
        <div className="px-3 mb-4">
          <div className="relative group">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-slate-600 group-focus-within:text-indigo-500 transition-colors" />
            <input 
              type="text" 
              placeholder="搜索..." 
              className="w-full bg-slate-900/50 border border-slate-900 rounded-xl py-1.5 pl-7 pr-2 text-[0.6rem] font-bold text-white placeholder:text-slate-700 focus:outline-none focus:border-indigo-500/50 transition-all uppercase tracking-widest"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id as View)}
              title={isCollapsed ? item.label : undefined}
              className={clsx(
                'w-full flex items-center gap-3 py-2.5 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest transition-all duration-300 group relative',
                isCollapsed ? 'justify-center px-0' : 'px-3',
                isActive
                  ? 'bg-slate-900 text-white shadow-inner'
                  : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'
              )}
            >
              {isActive && (
                <div className="absolute left-0 w-0.5 h-4 bg-indigo-600 rounded-r-full" />
              )}
              <Icon className={clsx(
                'w-3.5 h-3.5 shrink-0 transition-all duration-300',
                isActive ? 'text-indigo-500 scale-110' : 'text-slate-700 group-hover:text-slate-500'
              )} />
              {!isCollapsed && <span className="whitespace-nowrap">{item.label}</span>}
              {!isCollapsed && isActive && (
                <div className="ml-auto w-1 h-1 rounded-full bg-indigo-500 animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-slate-900 space-y-3">
        <button
          onClick={handleManualSync}
          disabled={isSyncing}
          className={clsx(
            'w-full flex items-center gap-3 py-2.5 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest transition-all duration-300 group',
            isCollapsed ? 'justify-center px-0' : 'px-3',
            'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'
          )}
        >
          {isSyncing ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-indigo-500" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5 shrink-0 text-slate-700 group-hover:text-slate-500" />
          )}
          {!isCollapsed && <span className="whitespace-nowrap">{isSyncing ? '同步中...' : '手动同步'}</span>}
        </button>

        <button
          onClick={() => setView('settings')}
          className={clsx(
            'w-full flex items-center gap-3 py-2.5 rounded-xl text-[0.65rem] font-bold uppercase tracking-widest transition-all duration-300 group',
            isCollapsed ? 'justify-center px-0' : 'px-3',
            currentView === 'settings'
              ? 'bg-slate-900 text-white'
              : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'
          )}
        >
          <Settings className={clsx(
            'w-3.5 h-3.5 shrink-0',
            currentView === 'settings' ? 'text-indigo-500' : 'text-slate-700 group-hover:text-slate-500'
          )} />
          {!isCollapsed && <span className="whitespace-nowrap">系统设置</span>}
        </button>

        <div className={clsx(
          "flex items-center gap-3 p-2 rounded-2xl bg-slate-900/30 border border-slate-900/50",
          isCollapsed ? "justify-center" : "px-3"
        )}>
          <div className="w-7 h-7 rounded-xl bg-indigo-600/10 border border-indigo-600/20 flex items-center justify-center text-[10px] font-black text-indigo-500 shrink-0">
            U
          </div>
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-[0.65rem] font-black text-white truncate uppercase tracking-tighter">高三学子</span>
              <span className="text-[0.5rem] font-bold text-slate-600 truncate uppercase tracking-widest">复习进行中</span>
            </div>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="hidden md:block absolute -right-4 top-1/2 -translate-y-1/2 bg-slate-900 border border-slate-800 text-slate-600 rounded-2xl p-2 hover:text-white transition-all z-20 shadow-2xl hover:scale-110 active:scale-90"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </div>
    </>
  );
}
