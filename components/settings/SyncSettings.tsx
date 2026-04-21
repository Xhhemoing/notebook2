'use client';

import React, { useState } from 'react';
import { useAppContext } from '@/lib/store';
import { Cloud, Download, Upload, Loader2, RefreshCw } from 'lucide-react';
import { pushToCloudflare, pullFromCloudflare } from '@/lib/sync';
import clsx from 'clsx';

export default function SyncSettings() {
  const { state, dispatch } = useAppContext();
  const [syncing, setSyncing] = useState<'push' | 'pull' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleSync = async (direction: 'push' | 'pull') => {
    setSyncing(direction);
    try {
      if (direction === 'push') {
        const success = await pushToCloudflare(state);
        alert(success ? '同步到云端成功！' : '同步到云端失败，请检查配置。');
      } else {
        const cloudState = await pullFromCloudflare(state.settings.syncKey || '');
        if (cloudState) {
          dispatch({ type: 'LOAD_STATE', payload: cloudState });
          alert('从云端恢复成功！');
        } else {
          alert('从云端恢复失败，可能云端没有数据或配置错误。');
        }
      }
    } catch (error: any) {
      console.error('Sync error:', error);
      alert('同步过程中发生错误: ' + error.message);
    } finally {
      setSyncing(null);
    }
  };

  const handleExport = () => {
    try {
      const dataStr = JSON.stringify(state, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const exportFileDefaultName = `aistudio-backup-${new Date().toISOString().slice(0, 10)}.json`;
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', url);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Export failed', e);
      alert('导出失败，请检查数据大小或浏览器限制。');
    }
  };

  const processImport = (file: File) => {
    if (file.type !== 'application/json') {
      alert('请上传有效的 JSON 备份文件。');
      return;
    }
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
      } catch {
        alert('导入失败，文件可能已损坏。');
      }
    };
    reader.readAsText(file);
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) processImport(file);
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processImport(file);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* ── 自动同步 ── */}
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <RefreshCw className="w-4 h-4" />
          自动同步
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <div>
              <label className="block text-sm font-medium text-slate-300">启用自动同步</label>
              <p className="text-xs text-slate-500">在后台自动同步数据到云端数据库。</p>
            </div>
            <button
              onClick={() => dispatch({ type: 'UPDATE_SETTINGS', payload: { enableAutoSync: !state.settings.enableAutoSync } })}
              className={clsx(
                'w-10 h-5 rounded-full transition-colors relative',
                state.settings.enableAutoSync ? 'bg-indigo-600' : 'bg-slate-800'
              )}
            >
              <div className={clsx(
                'absolute top-1 w-3 h-3 bg-white rounded-full transition-all',
                state.settings.enableAutoSync ? 'left-6' : 'left-1'
              )} />
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">同步频率</label>
            <select
              value={state.settings.syncInterval}
              onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { syncInterval: Number(e.target.value) } })}
              className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-200"
            >
              <option value={60}>每 1 分钟</option>
              <option value={300}>每 5 分钟（推荐）</option>
              <option value={1800}>每 30 分钟</option>
              <option value={3600}>每 1 小时</option>
              <option value={0}>仅手动同步</option>
            </select>
          </div>
        </div>
      </section>

      {/* ── Cloudflare D1 云同步 ── */}
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
            <Cloud className="w-4 h-4" />
            Cloudflare D1 云端同步
          </h3>
          <button 
            onClick={() => window.open('https://github.com/Xhhemoing/notebook2#%E9%83%A8%E7%BD%B2%E6%8C%87%E5%8D%97', '_blank')}
            className="text-[10px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
          >
            部署指南
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="p-4 bg-amber-950/20 border border-amber-900/30 rounded-xl mb-4">
            <p className="text-xs text-amber-200/80 leading-5">
              <strong>部署说明：</strong> 本同步功能基于 Cloudflare D1。
              1. 在 Cloudflare 创建 D1 数据库并绑定为 <code className="bg-slate-900 px-1 rounded text-white">DB</code>。
              2. 确保项目中有 <code className="bg-slate-900 px-1 rounded text-white">app/api/sync/route.ts</code>。
              3. 填入下方 <strong>Sync Key</strong>，它相当于你的私人保险箱密码，不同 Key 之间数据完全隔离。
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 flex items-center gap-1">
              数据隔离密钥 (Sync Key)
              <span className="text-[10px] text-slate-500 font-normal">(必填，用于隔离多用户数据，建议包含字母数字)</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={state.settings.syncKey || ''}
                onChange={(e) => dispatch({ type: 'UPDATE_SETTINGS', payload: { syncKey: e.target.value } })}
                placeholder="例如: my-secret-vault-2024"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors text-slate-200"
              />
              {(!state.settings.syncKey || state.settings.syncKey.length < 4) && (
                <p className="mt-1.5 text-[10px] text-rose-500 animate-pulse">
                  ⚠️ 缺少同步密钥或密钥过短，同步已禁用。
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            核心常用数据仍会优先缓存在本地以保证读取速度，全量数据将异步同步至 D1 数据库。自动同步功能会定期执行。
          </p>

          <div className="flex items-center justify-between p-4 bg-indigo-950/30 border border-indigo-900/30 rounded-xl">
            <div>
              <p className="text-sm font-semibold text-indigo-300">手动同步</p>
              <p className="text-xs text-indigo-500/80 mt-0.5">将记忆库和设置同步到云端，防止丢失。</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleSync('pull')}
                disabled={syncing !== null || (state.settings.syncKey?.length ?? 0) < 4}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {syncing === 'pull' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {syncing === 'pull' ? '恢复中...' : '从云端恢复'}
              </button>
              <button
                onClick={() => handleSync('push')}
                disabled={syncing !== null || (state.settings.syncKey?.length ?? 0) < 4}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {syncing === 'push' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {syncing === 'push' ? '同步中...' : '推送到云端'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── 本地备份 ── */}
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Download className="w-4 h-4" />
          本地备份
        </h3>
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={clsx(
            'grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border-2 border-dashed rounded-2xl transition-all duration-200',
            isDragging ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]' : 'border-transparent'
          )}
        >
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center gap-3">
            <Download className="w-6 h-6 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-300">导出本地备份</p>
              <p className="text-xs text-slate-500 mt-1">下载包含所有数据的 JSON 文件</p>
            </div>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-sm transition-colors"
            >
              导出数据
            </button>
          </div>

          <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col items-center justify-center text-center gap-3 relative overflow-hidden">
            <Upload className="w-6 h-6 text-slate-400" />
            <div>
              <p className="text-sm font-medium text-slate-300">导入本地备份</p>
              <p className="text-xs text-slate-500 mt-1">
                {isDragging ? '松开鼠标导入文件' : '选择或拖拽 JSON 文件'}
              </p>
            </div>
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
      </section>

    </div>
  );
}
