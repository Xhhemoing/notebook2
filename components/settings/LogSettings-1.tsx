import React from 'react';
import { useAppContext } from '@/lib/store';
import { Activity, Trash2 } from 'lucide-react';

export default function LogSettings() {
  const { state, dispatch } = useAppContext();

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4" />
            AI 操作日志
          </h3>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={state.settings.enableLogging}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { enableLogging: e.target.checked } })}
                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              启用日志记录
            </label>
            <button
              onClick={() => {
                if (confirm('确定要清空所有日志吗？')) {
                  dispatch({ type: 'CLEAR_LOGS' });
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              清空日志
            </button>
          </div>
        </div>

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
          {state.logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              暂无日志记录
            </div>
          ) : (
            state.logs.map(log => (
              <div key={log.id} className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded-md font-medium">
                    {(log.type || '').toUpperCase()}
                  </span>
                  <span className="text-slate-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-slate-400">
                  模型: <span className="text-slate-300 font-mono">{log.model}</span>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">Prompt:</div>
                  <pre className="p-3 bg-slate-900 rounded-lg text-xs text-slate-300 whitespace-pre-wrap font-mono overflow-x-auto">
                    {log.prompt}
                  </pre>
                </div>
                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-500">Response:</div>
                  <pre className="p-3 bg-slate-900 rounded-lg text-xs text-slate-300 whitespace-pre-wrap font-mono overflow-x-auto">
                    {log.response}
                  </pre>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
