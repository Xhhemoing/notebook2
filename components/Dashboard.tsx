'use client';

import { useAppContext } from '@/lib/store';
import { BrainCircuit, Target, AlertTriangle, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import { calculateMetrics } from '@/lib/fsrs';

function GaokaoCountdown() {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const getGaokaoCountdown = () => {
    if (!now) return { days: 0, hours: 0, minutes: 0, seconds: 0 };
    const current = new Date(now);
    let gaokaoYear = current.getFullYear();
    let gaokaoDate = new Date(gaokaoYear, 5, 7); // June 7th
    
    if (current.getTime() > gaokaoDate.getTime()) {
      gaokaoYear++;
      gaokaoDate = new Date(gaokaoYear, 5, 7);
    }
    
    const diffTime = gaokaoDate.getTime() - current.getTime();
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);
    return { days, hours, minutes, seconds };
  };

  const countdown = getGaokaoCountdown();

  return (
    <div className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[9px] font-bold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
      高考倒计时 
      <span className="text-white">{countdown.days}</span> 天 
      <span className="text-white">{countdown.hours}</span> 时 
      <span className="text-white">{countdown.minutes}</span> 分 
      <span className="text-white">{countdown.seconds}</span> 秒
    </div>
  );
}

export function Dashboard() {
  const { state } = useAppContext();
  const [now] = useState(() => Date.now());

  const subjectMemories = useMemo(() => state.memories.filter((m) => m.subject === state.currentSubject), [state.memories, state.currentSubject]);
  
  const weakMemories = useMemo(() => subjectMemories.filter((m) => {
    const metrics = calculateMetrics(m.fsrs, m.lastReviewed);
    return metrics.confidence <= 40;
  }), [subjectMemories]);
  
  const recentMemories = useMemo(() => [...subjectMemories].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5), [subjectMemories]);

  const stats = useMemo(() => [
    { label: '总记忆点', value: subjectMemories.length, icon: BrainCircuit, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: '薄弱环节', value: weakMemories.length, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
    { label: '今日复习', value: subjectMemories.filter(m => m.lastReviewed && now > 0 && m.lastReviewed > now - 86400000).length, icon: Target, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  ], [subjectMemories, weakMemories.length, now]);

  return (
    <div className="p-3 max-w-5xl mx-auto space-y-4 text-slate-200 bg-black h-full overflow-y-auto custom-scrollbar">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-white tracking-tighter mb-0.5 uppercase">{state.currentSubject} 学习总览</h2>
          <div className="flex items-center gap-2">
            <GaokaoCountdown />
            <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">保持专注，稳步提升</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className="bg-slate-900/40 p-3 rounded-xl border border-slate-900 hover:border-slate-800 transition-all duration-300 group">
              <div className="flex items-center justify-between mb-1.5">
                <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-300', 
                  stat.color === 'text-indigo-400' ? 'bg-indigo-500/10 border-indigo-500/20 group-hover:border-indigo-500/40' :
                  stat.color === 'text-red-400' ? 'bg-red-500/10 border-red-500/20 group-hover:border-red-500/40' :
                  'bg-emerald-500/10 border-emerald-500/20 group-hover:border-emerald-500/40'
                )}>
                  <Icon className={clsx('w-4 h-4', stat.color)} />
                </div>
                <div className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">实时数据</div>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-0.5">{stat.label}</p>
                <p className="text-2xl font-black text-white tracking-tighter">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              急需复习的薄弱点
            </h3>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">前 5 优先级</span>
          </div>
          <div className="space-y-3">
            {weakMemories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-600 text-xs font-medium uppercase tracking-widest">太棒了！目前没有薄弱点。</p>
              </div>
            ) : (
              weakMemories.slice(0, 5).map((m) => {
                const metrics = calculateMetrics(m.fsrs, m.lastReviewed);
                return (
                <div key={m.id} className="p-5 bg-slate-950 border border-slate-900 rounded-2xl hover:border-red-500/30 transition-all duration-300 group/item">
                  <div className="text-sm text-slate-300 font-medium line-clamp-2 prose prose-invert prose-sm max-w-none group-hover/item:text-white transition-colors">
                    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.content}</Markdown>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">置信度: {Math.round(metrics.confidence)}%</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-slate-900/40 rounded-2xl border border-slate-900 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-3">
              <Clock className="w-4 h-4 text-indigo-500" />
              最近录入
            </h3>
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">最近活动</span>
          </div>
          <div className="space-y-3">
            {recentMemories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-slate-600 text-xs font-medium uppercase tracking-widest">暂无最近录入的记忆。</p>
              </div>
            ) : (
              recentMemories.map((m) => (
                <div key={m.id} className="p-5 bg-slate-950 border border-slate-900 rounded-2xl hover:border-blue-500/30 transition-all duration-300 group/item">
                  <div className="text-sm text-slate-300 font-medium line-clamp-2 prose prose-invert prose-sm max-w-none group-hover/item:text-white transition-colors">
                    <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.content}</Markdown>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                      <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg text-[10px] font-bold uppercase tracking-widest">{m.functionType}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{new Date(m.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
