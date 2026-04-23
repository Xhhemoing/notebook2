import React from 'react';
import { BookOpen, Settings2, User } from 'lucide-react';

import { useAppContext } from '@/lib/store';

export default function GeneralSettings() {
  const { state, dispatch } = useAppContext();
  const subjectProfile = state.fsrsProfiles.find((profile) => profile.subject === state.currentSubject);

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
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <User className="w-4 h-4" />
          学生画像与 AI 注意事项
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
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">系统从反馈中学习到的偏好</label>
            <div className="min-h-24 rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm text-slate-300 whitespace-pre-wrap leading-7">
              {state.settings.feedbackLearningNotes || '暂无自动学习结果。'}
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
            />
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          检索策略
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">检索后端</label>
              <select
                value={state.settings.serverBackend || 'server-qdrant'}
                onChange={(event) =>
                  dispatch({
                    type: 'UPDATE_SETTINGS',
                    payload: { serverBackend: event.target.value as 'server-qdrant' | 'local-browser' },
                  })
                }
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              >
                <option value="server-qdrant">Qdrant 服务端</option>
                <option value="local-browser">本地浏览器回退</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">融合方式</label>
              <select
                value={state.settings.fusionMode || 'dbsf'}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { fusionMode: event.target.value as 'dbsf' | 'rrf' } })
                }
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              >
                <option value="dbsf">DBSF</option>
                <option value="rrf">RRF</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Recall TopK</label>
              <input
                type="number"
                min="5"
                max="100"
                value={state.settings.recallTopK || 40}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { recallTopK: Number(event.target.value) } })
                }
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Rerank TopN</label>
              <input
                type="number"
                min="1"
                max="30"
                value={state.settings.rerankTopN || 10}
                onChange={(event) =>
                  dispatch({ type: 'UPDATE_SETTINGS', payload: { rerankTopN: Number(event.target.value) } })
                }
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">精排模式</label>
              <select
                value={state.settings.rerankMode || 'cross-encoder'}
                onChange={(event) =>
                  dispatch({
                    type: 'UPDATE_SETTINGS',
                    payload: {
                      rerankMode: event.target.value as 'cross-encoder' | 'late-interaction' | 'hybrid-only',
                    },
                  })
                }
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
              >
                <option value="cross-encoder">Cross-Encoder</option>
                <option value="late-interaction">Late Interaction</option>
                <option value="hybrid-only">仅 Hybrid</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300 space-y-1">
            <div>索引状态：{state.retrievalIndex.status}</div>
            <div>待处理文档：{state.retrievalIndex.pendingDocumentCount}</div>
            <div>上次索引：{state.retrievalIndex.lastIndexedAt ? new Date(state.retrievalIndex.lastIndexedAt).toLocaleString() : '未完成'}</div>
            {state.retrievalIndex.lastError ? <div>最近错误：{state.retrievalIndex.lastError}</div> : null}
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

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">目标 retention</label>
            <input
              type="number"
              min="0.8"
              max="0.97"
              step="0.01"
              value={state.settings.fsrsDesiredRetention || 0.9}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { fsrsDesiredRetention: Number(event.target.value) } })
              }
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-200"
            />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300 space-y-1">
            <div>当前学科：{state.currentSubject}</div>
            <div>Profile 状态：{subjectProfile?.status || 'temporary'}</div>
            <div>事件数：{subjectProfile?.eventCount || 0}</div>
            <div>覆盖卡片：{subjectProfile?.distinctMemoryCount || 0}</div>
            <div>CMRR 下限：{(subjectProfile?.cmrrLowerBound || 0.9).toFixed(2)}</div>
            <div>推荐 retention：{(subjectProfile?.recommendedRetention || 0.9).toFixed(2)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
