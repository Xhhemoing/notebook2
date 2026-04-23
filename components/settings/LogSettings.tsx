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

function readOptimizationHints(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function getQualityBadgeClass(score?: number) {
  if (typeof score !== 'number') return 'bg-slate-800 text-slate-300';
  if (score >= 85) return 'bg-emerald-500/10 text-emerald-300';
  if (score >= 65) return 'bg-amber-500/10 text-amber-200';
  return 'bg-rose-500/10 text-rose-200';
}

function formatIssueLabel(issue: string) {
  return issue.replace(/_/g, ' ');
}

export default function LogSettings() {
  const { state, dispatch } = useAppContext();

  const autoResources = useMemo(
    () => state.resources.filter((resource) => !resource.isFolder && resource.retentionPolicy === 'auto'),
    [state.resources]
  );

  const expiringSoonCount = useMemo(() => {
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
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-slate-500">
              <Activity className="h-4 w-4" />
              AI 日志与优化包
            </h3>
            <p className="mt-2 text-sm leading-7 text-slate-400">
              把日志、输入历史、反馈事件和相关图片整理成可直接用于提示词优化的素材。
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
          <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
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
              <div className="mt-1 text-xs leading-6 text-slate-500">保存解析、对话、总结和清理相关日志。</div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
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

          <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <input
              type="checkbox"
              checked={Boolean(state.settings.autoCleanupResources)}
              onChange={(event) =>
                dispatch({ type: 'UPDATE_SETTINGS', payload: { autoCleanupResources: event.target.checked } })
              }
              className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-500"
            />
            <div>
              <div className="text-sm font-medium text-slate-200">自动清理图片/附件</div>
              <div className="mt-1 text-xs leading-6 text-slate-500">
                未固定且未关联记忆的旧图片会按规则自动清理。
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
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
              <div className="mt-1 text-xs leading-6 text-slate-500">
                适合需要结合截图、错题和日志一起分析的场景。
              </div>
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
              if (confirm('确定要清空所有 AI 日志吗？此操作不可撤销。')) {
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
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">最近日志</h3>
          <div className="custom-scrollbar max-h-[640px] space-y-4 overflow-y-auto pr-2">
            {state.logs.length === 0 ? (
              <div className="py-12 text-center text-sm text-slate-500">暂无日志记录</div>
            ) : (
              state.logs.map((log) => {
                const optimizationHints = readOptimizationHints(log.metadata?.optimizationHints);

                return (
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

                    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                      {log.promptVersion && (
                        <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
                          Prompt {log.promptVersion}
                        </span>
                      )}
                      {typeof log.qualityScore === 'number' && (
                        <span className={`rounded-md px-2 py-1 ${getQualityBadgeClass(log.qualityScore)}`}>
                          质量 {log.qualityScore}
                        </span>
                      )}
                      {typeof log.durationMs === 'number' && (
                        <span className="rounded-md bg-slate-800 px-2 py-1 text-slate-300">
                          {log.durationMs} ms
                        </span>
                      )}
                    </div>

                    {log.qualitySummary && (
                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
                        {log.qualitySummary}
                      </div>
                    )}

                    {(log.qualityIssues?.length || 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {log.qualityIssues?.map((issue) => (
                          <span
                            key={issue}
                            className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200"
                          >
                            {formatIssueLabel(issue)}
                          </span>
                        ))}
                      </div>
                    )}

                    {optimizationHints.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <div className="text-xs font-medium text-slate-500">优化提示</div>
                        <ul className="space-y-1 text-xs text-slate-400">
                          {optimizationHints.slice(0, 4).map((hint) => (
                            <li key={hint}>- {hint}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-medium text-slate-500">Prompt</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 text-xs text-slate-300">
                        {log.prompt}
                      </pre>
                    </div>

                    <div className="mt-3 space-y-2">
                      <div className="text-xs font-medium text-slate-500">Response</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-900 p-3 text-xs text-slate-300">
                        {log.response}
                      </pre>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">最近反馈事件</h3>
            <div className="custom-scrollbar max-h-[320px] space-y-3 overflow-y-auto pr-2">
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
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
              系统自动学习到的提示词注意点
            </h3>
            <div className="whitespace-pre-wrap rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm leading-7 text-slate-300">
              {state.settings.feedbackLearningNotes || '暂无自动学习结果。'}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
