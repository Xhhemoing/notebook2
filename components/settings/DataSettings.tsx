import React, { useState } from 'react';
import { clearLocalAppData, useAppContext } from '@/lib/store';
import { Cloud, Loader2, Trash2 } from 'lucide-react';
import { pushToCloudflare, pullFromCloudflare } from '@/lib/sync';
import clsx from 'clsx';

export default function DataSettings() {
  const { state, dispatch } = useAppContext();
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSync = async (direction: 'push' | 'pull') => {
    setSyncing(direction);
    try {
      if (direction === 'push') {
        const success = await pushToCloudflare(state, state.settings.cloudflareEndpoint || '', state.settings.cloudflareToken || '');
        if (success) {
          alert('同步到云端成功！');
        } else {
          alert('同步到云端失败，请检查配置。');
        }
      } else {
        const cloudState = await pullFromCloudflare(
          state.settings.cloudflareEndpoint || '',
          state.settings.cloudflareToken || '',
          state.settings.syncKey || ''
        );
        if (cloudState) {
          dispatch({ type: 'LOAD_STATE', payload: cloudState });
          alert('从云端恢复成功！');
        } else {
          alert('从云端恢复失败，可能云端没有数据或配置错误。');
        }
      }
    } catch (error) {
      console.error('Sync error:', error);
      alert('同步过程中发生错误。');
    } finally {
      setSyncing(null);
    }
  };

  const handleExport = () => {
    const dataStr = JSON.stringify(state, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `aistudio-backup-${new Date().toISOString().slice(0, 10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedState = JSON.parse(e.target?.result as string);
          if (importedState && importedState.settings) {
            dispatch({ type: 'LOAD_STATE', payload: importedState });
            alert('数据导入成功！');
          } else {
            alert('无效的备份文件格式。');
          }
        } catch (error) {
          console.error("Import error:", error);
          alert('导入失败，文件可能已损坏。');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedState = JSON.parse(e.target?.result as string);
          if (importedState && importedState.settings) {
            dispatch({ type: 'LOAD_STATE', payload: importedState });
            alert('数据导入成功！');
          } else {
            alert('无效的备份文件格式。');
          }
        } catch (error) {
          console.error("Import error:", error);
          alert('导入失败，文件可能已损坏。');
        }
      };
      reader.readAsText(file);
    } else {
      alert('请上传有效的 JSON 备份文件。');
    }
  };

  const handleClearData = async () => {
    if (confirm('警告：此操作将永久删除所有本地数据（包括记忆、知识图谱、课本等），且无法恢复！\n\n您确定要继续吗？')) {
      if (confirm('最后确认：真的要清空所有数据吗？')) {
        await clearLocalAppData();
        window.location.reload();
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Cloud className="w-4 h-4" />
          Cloudflare D1 数据同步 (Beta)
        </h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">API Endpoint</label>
              <input
                type="text"
                value={state.settings.cloudflareEndpoint || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { cloudflareEndpoint: e.target.value } })}
                placeholder="https://your-worker.workers.dev"
                className="w-full bg-[#1e1e1e] border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">API Token</label>
              <input
                type="password"
                value={state.settings.cloudflareToken || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { cloudflareToken: e.target.value } })}
                placeholder="••••••••••••••••"
                className="w-full bg-[#1e1e1e] border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mb-4">
            * 核心常用数据（如当前学习的科目、近期错题）仍会优先缓存在本地以保证读取速度，全量数据将异步同步至 D1。
          </p>
          <div className="p-4 bg-blue-900/20 border border-blue-900/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-400">云端同步</p>
              <p className="text-xs text-indigo-500/80">将您的记忆库和设置同步到云端，防止丢失。</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSync('pull')}
                disabled={syncing !== null || !state.settings.cloudflareEndpoint}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {syncing === 'pull' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                {syncing === 'pull' ? '恢复中...' : '从云端恢复'}
              </button>
              <button
                onClick={() => handleSync('push')}
                disabled={syncing !== null || !state.settings.cloudflareEndpoint}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {syncing === 'push' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                {syncing === 'push' ? '同步中...' : '推送到云端'}
              </button>
            </div>
          </div>
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={clsx(
              "grid grid-cols-2 gap-4 p-4 border-2 border-dashed rounded-2xl transition-all duration-200",
              isDragging ? "border-indigo-500 bg-indigo-500/5 scale-[1.01]" : "border-transparent"
            )}
          >
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center gap-2">
              <p className="text-sm font-medium text-slate-300">导出本地备份</p>
              <p className="text-xs text-slate-500 mb-2">下载包含所有数据的 JSON 文件</p>
              <button
                onClick={handleExport}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors"
              >
                导出数据
              </button>
            </div>
            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center gap-2 relative overflow-hidden">
              <p className="text-sm font-medium text-slate-300">导入本地备份</p>
              <p className="text-xs text-slate-500 mb-2">
                {isDragging ? '松开鼠标导入文件' : '选择或拖拽 JSON 文件到此处'}
              </p>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors pointer-events-none">
                选择文件
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          本地数据清理
        </h3>
        <div className="space-y-4">
          <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-red-400">清空所有本地数据</p>
              <p className="text-xs text-red-500/80">此操作不可逆，将删除所有记忆、知识图谱和设置。</p>
            </div>
            <button
              onClick={handleClearData}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              清空数据
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
