import React from 'react';
import { useAppContext } from '@/lib/store';
import { User, BookOpen, Settings2 } from 'lucide-react';
import { clsx } from 'clsx';

export default function GeneralSettings() {
  const { state, dispatch } = useAppContext();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          界面设置
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">全局字体大小</label>
            <select
              value={state.settings.fontSize || 'base'}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { fontSize: e.target.value as 'small' | 'base' | 'medium' | 'large' } })}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
            >
              <option value="small">小 (更紧凑)</option>
              <option value="base">默认 (标准)</option>
              <option value="medium">中 (适中)</option>
              <option value="large">大 (更易读)</option>
            </select>
            <p className="text-xs text-slate-500 mt-2">调整全局字体大小，以适应不同的屏幕和阅读习惯。</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <User className="w-4 h-4" />
          学生画像 (AI 认知)
        </h3>
        <div className="space-y-4">
          <textarea
            value={state.settings.studentProfile || ''}
            onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { studentProfile: e.target.value } })}
            className="w-full h-32 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
            placeholder="描述学生的学习情况，例如：高二理科生，物理力学薄弱，数学基础好但粗心..."
          />
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BookOpen className="w-4 h-4" />
          作业偏好与符号含义
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">作业偏好</label>
            <textarea
              value={state.settings.homeworkPreferences || ''}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { homeworkPreferences: e.target.value } })}
              className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
              placeholder="例如：优先复习错题，每天最多做20道数学题..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">个人符号与标记含义</label>
            <textarea
              value={state.settings.userSymbols || ''}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { userSymbols: e.target.value } })}
              className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
              placeholder="例如：☆代表重点，？代表不懂，红笔打叉代表错题，波浪线代表易错点..."
            />
            <p className="text-xs text-slate-500 mt-2">AI 将根据这些设定自动识别您上传的作业和试卷中的重点与错题。如果不填，AI 将尝试自主推断。</p>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          复习策略 (FSRS)
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">每日复习上限</label>
              <input
                type="number"
                min="1"
                value={state.settings.dailyReviewLimit}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { dailyReviewLimit: Number(e.target.value) } })}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">单次复习批次大小</label>
              <input
                type="number"
                min="1"
                max="50"
                value={state.settings.reviewBatchSize}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { reviewBatchSize: Number(e.target.value) } })}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">最小复习难度 (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={state.settings.minReviewDifficulty}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { minReviewDifficulty: Number(e.target.value) } })}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">最大复习难度 (1-10)</label>
              <input
                type="number"
                min="1"
                max="10"
                value={state.settings.maxReviewDifficulty}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { maxReviewDifficulty: Number(e.target.value) } })}
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
          </div>
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-slate-300">算法参数更新频率</label>
              <button className="text-xs text-indigo-400 hover:text-indigo-300 font-medium px-2 py-1 bg-indigo-500/10 rounded-md transition-colors">
                立即刷新算法参数
              </button>
            </div>
            <select
              value={state.settings.fsrsUpdateFrequency || 'daily'}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { fsrsUpdateFrequency: e.target.value } })}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 cursor-pointer"
            >
              <option value="always">每次复习后 (最精确，性能消耗大)</option>
              <option value="daily">每天自动更新 (推荐)</option>
              <option value="weekly">每周自动更新</option>
              <option value="manual">仅手动更新</option>
            </select>
            <p className="text-[10px] text-slate-500 mt-2">
              * FSRS 算法会根据您的复习记录不断优化参数。频繁更新可以提供更精准的复习安排，但会增加计算开销。
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
