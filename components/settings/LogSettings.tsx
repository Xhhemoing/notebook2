import React, { useMemo } from 'react';
import { Activity, Archive, Download, Sparkles, Trash2 } from 'lucide-react';

import { useAppContext } from '@/lib/store';
import { createOptimizationExportBundle, createOptimizationMarkdown } from '@/lib/optimization-export';

function downloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export default function LogSettings() {
  const { state, dispatch } = useAppContext();

  const autoResources = useMemo(
    () => state.resources.filter((resource) => !resource.isFolder && resource.retentionPolicy === 'auto'),
    [state.resources]
  );
  const expiringSoonCount = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const threshold = Date.now() + 3 * 24 * 60 * 60 * 1000;
    return autoResources.filter(
      (resource) => Number.isFinite(resource.expiresAt) && (resource.expiresAt as number) <= threshold
    ).length;
  }, [autoResources]);
  const recentFeedback = useMemo(() => state.feedbackEvents.slice(0, 20), [state.feedbackEvents]);

  const exportCurrentSubject = (format: 'json' | 'md') => {
    const bundle = createOptimizationExportBundle(
      state,
      state.currentSubject,
      Boolean(state.settings.exportOptimizationIncludeImages)
    );
    if (format === 'json') {
      downloadText(
        `${state.currentSubject}-optimization-package.json`,
        JSON.stringify(bundle, null, 2),
        'application/json;charset=utf-8'
      );
      return;
    }

    downloadText(
      `${state.currentSubject}-optimization-package.md`,
      createOptimizationMarkdown(bundle),
      'text/markdown;charset=utf-8'
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-widest text-slate-500">日志总数</div>
          <div className="mt-3 text-3xl font-black text-white">{state.logs.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-widest text-slate-500">反馈事件</div>
          <div className="mt-3 text-3xl font-black text-white">{state.feedbackEvents.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-widest text-slate-500">自动清理资源</div>
          <div className="mt-3 text-3xl font-black text-white">{autoResources.length}</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-widest text-slate-500">3 天内到期</div>
          <div className="mt-3 text-3xl font-black text-amber-300">{expiringSoonCount}</div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4" />
              AI 日志与优化包
            </h3>
            <p className="mt-2 text-sm text-slate-400 leading-7">
              把日志、录入历史、低质量记忆、反馈事件和关联图片整理为可直接交给我的优化素材。
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => exportCurrentSubject('json')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
            >
              <Download className="h-4 w-4" />
              导出 JSON 优化包
            </button>
            <button
              onClick={() => exportCurrentSubject('md')}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
            >
              <Sparkles className="h-4 w-4" />
              导出 Markdown 摘要
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="rounded-2xl border border-slate-800 bg-slate-950 p-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={state.settings.enableLogging}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { enableLogging: event.target.checked } })
              }
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-200">启用 AI 日志</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">保存解析、对话、网关总结和清理日志。</div>
            </div>
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950 p-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(state.settings.autoCleanupLogs)}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { autoCleanupLogs: event.target.checked } })
              }
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-200">自动清理旧日志</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">按保留天数清理过期日志，减少本地冗余。</div>
            </div>
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950 p-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(state.settings.autoCleanupResources)}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { autoCleanupResources: event.target.checked } })
              }
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-200">自动清理对话/录入图片</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">
                未被固定且未关联记忆的旧图片会按规则自动清理。
              </div>
            </div>
          </label>

          <label className="rounded-2xl border border-slate-800 bg-slate-950 p-4 flex items-start gap-3">
            <input
              type="checkbox"
              checked={Boolean(state.settings.exportOptimizationIncludeImages)}
              onChange={(event) =>
                dispatch({
                  type: 'UPDATE_SETTINGS',
                  payload: { exportOptimizationIncludeImages: event.target.checked },
                })
              }
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-200">导出优化包时附带图片</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">适合需要我同时看图和看日志的深度优化场景。</div>
            </div>
          </label>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-widest text-slate-500">日志保留天数</span>
            <input
              type="number"
              min="1"
              value={state.settings.logRetentionDays || 30}
              onChange={(event) =>
                dispatch({
                  type: 'UPDATE_SETTINGS',
                  payload: { logRetentionDays: Number(event.target.value) || 30 },
                })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-widest text-slate-500">图片自动清理天数</span>
            <input
              type="number"
              min="1"
              value={state.settings.resourceAutoCleanupDays || 21}
              onChange={(event) =>
                dispatch({
                  type: 'UPDATE_SETTINGS',
                  payload: { resourceAutoCleanupDays: Number(event.target.value) || 21 },
                })
              }
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => dispatch({ type: 'RUN_AUTO_CLEANUP' })}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
          >
            <Archive className="h-4 w-4" />
            立即执行清理
          </button>
          <button
            onClick={() => {
              if (confirm('确定要清空所有日志吗？')) {
                dispatch({ type: 'CLEAR_LOGS' });
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-200 hover:bg-rose-500/20"
          >
            <Trash2 className="h-4 w-4" />
            清空日志
          </button>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">最近日志</h3>
          <div className="space-y-4 max-h-[640px] overflow-y-auto pr-2 custom-scrollbar">
            {state.logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm">暂无日志记录</div>
            ) : (
              state.logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-md bg-slate-800 px-2 py-1 font-medium text-slate-300">
                      {(log.type || '').toUpperCase()}
                    </span>
                    {log.workflow && (
                      <span className="rounded-md bg-indigo-500/10 px-2 py-1 font-medium text-indigo-200">
                        {log.workflow}
                      </span>
                    )}
                    {log.subject && <span className="text-slate-500">{log.subject}</span>}
                    <span className="ml-auto text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    模型: <span className="font-mono text-slate-300">{log.model}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-slate-500">Prompt</div>
                    <pre className="rounded-xl bg-slate-900 p-3 text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto">
                      {log.prompt}
                    </pre>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="text-xs font-medium text-slate-500">Response</div>
                    <pre className="rounded-xl bg-slate-900 p-3 text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto">
                      {log.response}
                    </pre>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">最近反馈事件</h3>
            <div className="space-y-3 max-h-[320px] overflow-y-auto custom-scrollbar pr-2">
              {recentFeedback.length === 0 ? (
                <div className="text-sm text-slate-500">还没有反馈事件。</div>
              ) : (
                recentFeedback.map((event) => (
                  <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">{event.signalType}</span>
                      <span className="text-slate-500">{new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                    {event.note && <div className="mt-2 text-sm text-slate-300">{event.note}</div>}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">自动学习到的 AI 注意点</h3>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300 whitespace-pre-wrap leading-7">
              {state.settings.feedbackLearningNotes || '暂无自动学习结果。'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
