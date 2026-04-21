import React from 'react';
import { BookOpen, Settings2, User } from 'lucide-react';

import { useAppContext } from '@/lib/store';

export default function GeneralSettings() {
  const { state, dispatch } = useAppContext();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          界面设置
        </h3>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">全局字体大小</label>
          <select
            value={state.settings.fontSize || 'base'}
            onChange={(event) =>
              dispatch({
                type: 'UPDATE_SETTINGS',
                payload: {
                  fontSize: event.target.value as 'small' | 'base' | 'medium' | 'large',
                },
              })
            }
            className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
          >
            <option value="small">小</option>
            <option value="base">默认</option>
            <option value="medium">中</option>
            <option value="large">大</option>
          </select>
          <p className="text-xs text-slate-500 mt-2">调整整个应用的阅读密度和字号。</p>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <User className="w-4 h-4" />
          学生画像与 AI 注意点
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">学生画像</label>
            <textarea
              value={state.settings.studentProfile || ''}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { studentProfile: event.target.value } })
              }
              className="w-full h-32 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
              placeholder="例如：理科基础较好，但细节容易出错；更适合先看结论，再看推导。"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">手动补充的 AI 注意事项</label>
            <textarea
              value={state.settings.aiAttentionNotes || ''}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { aiAttentionNotes: event.target.value } })
              }
              className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
              placeholder="例如：优先保留题干原文；图像不清时明确写出不确定；先给结论再解释。"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">系统从反馈中学习到的偏好</label>
            <div className="min-h-24 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300 whitespace-pre-wrap leading-7">
              {state.settings.feedbackLearningNotes ||
                '暂无自动学习结果。你在录入审核、记忆编辑、删除、重生成和对话反馈中的行为会逐步沉淀到这里。'}
            </div>
          </div>
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
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { homeworkPreferences: event.target.value } })
              }
              className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
              placeholder="例如：优先收录错题；尽量拆分为短记忆；英语保留原文和词义。"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">个人符号与标记含义</label>
            <textarea
              value={state.settings.userSymbols || ''}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { userSymbols: event.target.value } })
              }
              className="w-full h-24 p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200 resize-none"
              placeholder="例如：星号=重点，问号=不懂，红叉=做错，波浪线=易错点。"
            />
            <p className="text-xs text-slate-500 mt-2">
              图片专业处理和整卷分析都会优先参考这些标记含义。
            </p>
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
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { dailyReviewLimit: Number(event.target.value) } })
                }
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
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { reviewBatchSize: Number(event.target.value) } })
                }
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
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { minReviewDifficulty: Number(event.target.value) } })
                }
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
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { maxReviewDifficulty: Number(event.target.value) } })
                }
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">FSRS 参数更新频率</label>
            <select
              value={state.settings.fsrsUpdateFrequency || 'daily'}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { fsrsUpdateFrequency: event.target.value } })
              }
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
            >
              <option value="always">每次复习后</option>
              <option value="daily">每天自动更新</option>
              <option value="weekly">每周自动更新</option>
              <option value="manual">仅手动更新</option>
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
