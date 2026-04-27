'use client';

import { useAppContext } from '@/lib/store';
import { BrainCircuit, Target, AlertTriangle, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useState, useEffect, useMemo } from 'react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import { calculateMetrics } from '@/lib/fsrs';

function getMemoryContent(content: unknown) {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  return String(content);
}

function getMemoryCreatedDate(createdAt: unknown) {
  const value = typeof createdAt === 'number' ? createdAt : Number(createdAt);
  return Number.isFinite(value) ? new Date(value) : null;
}

function getSafeMetrics(fsrs: Parameters<typeof calculateMetrics>[0], lastReviewed?: number) {
  try {
    return calculateMetrics(fsrs, lastReviewed);
  } catch (error) {
    console.warn('Failed to calculate dashboard metrics for memory', error);
    return { confidence: 0, mastery: 0 };
  }
}

function GaokaoCountdown() {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const countdown = useMemo(() => {
    const current = new Date(now);
    let gaokaoYear = current.getFullYear();
    let gaokaoDate = new Date(gaokaoYear, 5, 7);

    if (current.getTime() > gaokaoDate.getTime()) {
      gaokaoYear += 1;
      gaokaoDate = new Date(gaokaoYear, 5, 7);
    }

    const diffTime = Math.max(0, gaokaoDate.getTime() - current.getTime());
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds };
  }, [now]);

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-indigo-400">
      高考倒计时
      <span className="text-white">{countdown.days}</span>天
      <span className="text-white">{countdown.hours}</span>时
      <span className="text-white">{countdown.minutes}</span>分
      <span className="text-white">{countdown.seconds}</span>秒
    </div>
  );
}

export function Dashboard() {
  const { state } = useAppContext();
  const [now] = useState(() => Date.now());

  const subjectMemories = useMemo(
    () => state.memories.filter((memory) => memory.subject === state.currentSubject),
    [state.currentSubject, state.memories]
  );

  const weakMemories = useMemo(
    () =>
      subjectMemories.filter((memory) => {
        const metrics = getSafeMetrics(memory.fsrs, memory.lastReviewed);
        return metrics.confidence <= 40;
      }),
    [subjectMemories]
  );

  const recentMemories = useMemo(
    () => [...subjectMemories].sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0)).slice(0, 5),
    [subjectMemories]
  );

  const stats = useMemo(
    () => [
      { label: '总记忆点', value: subjectMemories.length, icon: BrainCircuit, color: 'text-indigo-400' },
      { label: '薄弱环节', value: weakMemories.length, icon: AlertTriangle, color: 'text-red-400' },
      {
        label: '今日复习',
        value: subjectMemories.filter((memory) => memory.lastReviewed && memory.lastReviewed > now - 86400000).length,
        icon: Target,
        color: 'text-emerald-400',
      },
    ],
    [now, subjectMemories, weakMemories.length]
  );

  return (
    <div className="h-full max-w-5xl space-y-4 overflow-y-auto bg-black p-3 text-slate-200 custom-scrollbar mx-auto">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h2 className="mb-0.5 text-xl font-black uppercase tracking-tighter text-white">
            {state.currentSubject} 学习总览
          </h2>
          <div className="flex items-center gap-2">
            <GaokaoCountdown />
            <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">保持专注，稳步提升</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="group rounded-xl border border-slate-900 bg-slate-900/40 p-3 transition-all duration-300 hover:border-slate-800"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div
                  className={clsx(
                    'flex h-8 w-8 items-center justify-center rounded-lg border transition-all duration-300',
                    stat.color === 'text-indigo-400'
                      ? 'border-indigo-500/20 bg-indigo-500/10 group-hover:border-indigo-500/40'
                      : stat.color === 'text-red-400'
                        ? 'border-red-500/20 bg-red-500/10 group-hover:border-red-500/40'
                        : 'border-emerald-500/20 bg-emerald-500/10 group-hover:border-emerald-500/40'
                  )}
                >
                  <Icon className={clsx('h-4 w-4', stat.color)} />
                </div>
                <div className="text-[8px] font-bold uppercase tracking-widest text-slate-600">实时数据</div>
              </div>
              <div>
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">{stat.label}</p>
                <p className="text-2xl font-black tracking-tighter text-white">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-white">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              急需复习的薄弱点
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">前 5 优先级</span>
          </div>
          <div className="space-y-3">
            {weakMemories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs font-medium uppercase tracking-widest text-slate-600">当前没有明显薄弱点</p>
              </div>
            ) : (
              weakMemories.slice(0, 5).map((memory) => {
                const metrics = getSafeMetrics(memory.fsrs, memory.lastReviewed);
                const createdAt = getMemoryCreatedDate(memory.createdAt);
                return (
                  <div
                    key={memory.id}
                    className="group/item rounded-2xl border border-slate-900 bg-slate-950 p-5 transition-all duration-300 hover:border-red-500/30"
                  >
                    <div className="prose prose-invert prose-sm mb-0 text-sm font-medium text-slate-300 line-clamp-2 max-w-none transition-colors group-hover/item:text-white">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {getMemoryContent(memory.content)}
                      </Markdown>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">
                          置信度 {Math.round(metrics.confidence)}%
                        </span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        {createdAt ? createdAt.toLocaleDateString() : '--'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-900 bg-slate-900/40 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-white">
              <Clock className="h-4 w-4 text-indigo-500" />
              最近录入
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">最近活动</span>
          </div>
          <div className="space-y-3">
            {recentMemories.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-xs font-medium uppercase tracking-widest text-slate-600">暂无最近录入的记忆</p>
              </div>
            ) : (
              recentMemories.map((memory) => {
                const createdAt = getMemoryCreatedDate(memory.createdAt);
                return (
                  <div
                    key={memory.id}
                    className="group/item rounded-2xl border border-slate-900 bg-slate-950 p-5 transition-all duration-300 hover:border-blue-500/30"
                  >
                    <div className="prose prose-invert prose-sm mb-0 text-sm font-medium text-slate-300 line-clamp-2 max-w-none transition-colors group-hover/item:text-white">
                      <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {getMemoryContent(memory.content)}
                      </Markdown>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                        <span className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                          {typeof memory.functionType === 'string' && memory.functionType.trim() ? memory.functionType : '未分类'}
                        </span>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        {createdAt ? createdAt.toLocaleDateString() : '--'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
