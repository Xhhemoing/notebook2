'use client';

import React from 'react';
import { useAppContext } from '@/lib/store';
import { BarChart2, Filter } from 'lucide-react';

export default function DataStatsSettings() {
  const { state } = useAppContext();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <Filter className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-widest">数据分布统计</h4>
            <p className="text-[10px] text-slate-500 uppercase tracking-widest">当前数据库各维度分布情况</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">总记忆数</p>
            <p className="text-2xl font-black text-white">{state.memories.length}</p>
          </div>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">知识节点</p>
            <p className="text-2xl font-black text-white">{state.knowledgeNodes.length}</p>
          </div>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">课本文件</p>
            <p className="text-2xl font-black text-white">{state.textbooks.length}</p>
          </div>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest mb-1">错题比例</p>
            <p className="text-2xl font-black text-white">
              {state.memories.length > 0 ? ((state.memories.filter(m => m.isMistake).length / state.memories.length) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4" />
          学科分布
        </h3>
        <div className="space-y-3">
          {Array.from(new Set(state.memories.map(m => m.subject))).map(subject => {
            const count = state.memories.filter(m => m.subject === subject).length;
            const percentage = (count / state.memories.length) * 100;
            return (
              <div key={subject} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{subject}</span>
                  <span>{count} 条 ({percentage.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-500 rounded-full" 
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
