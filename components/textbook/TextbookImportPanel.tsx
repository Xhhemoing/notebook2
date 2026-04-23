'use client';

import { BookOpen, Loader2, Search, Upload } from 'lucide-react';

export function TextbookImportPanel({
  searchQuery,
  onSearchChange,
  newTextbookName,
  onNewTextbookNameChange,
  enableOCR,
  onEnableOCRChange,
  isUploading,
  uploadProgress,
  error,
  onUploadClick,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  newTextbookName: string;
  onNewTextbookNameChange: (value: string) => void;
  enableOCR: boolean;
  onEnableOCRChange: (value: boolean) => void;
  isUploading: boolean;
  uploadProgress: { current: number; total: number };
  error: string | null;
  onUploadClick: () => void;
}) {
  return (
    <div className="p-3 border-b border-slate-900 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
        <h2 className="text-xs font-bold text-white">课本工作台</h2>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
        <input
          type="text"
          placeholder="搜索课本..."
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          className="w-full bg-slate-900/60 border border-slate-900 rounded-xl py-2 pl-8 pr-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
        />
      </div>

      <input
        type="text"
        placeholder="新课本名称（可选）"
        value={newTextbookName}
        onChange={(event) => onNewTextbookNameChange(event.target.value)}
        className="w-full bg-slate-900/60 border border-slate-900 rounded-xl py-2 px-3 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
      />

      <label className="flex items-center gap-2 text-[11px] text-slate-400">
        <input
          type="checkbox"
          checked={enableOCR}
          onChange={(event) => onEnableOCRChange(event.target.checked)}
          className="w-3.5 h-3.5 rounded border-slate-700 bg-slate-900 text-indigo-500 focus:ring-indigo-500"
        />
        启用 AI OCR（更准，但更慢）
      </label>

      <button
        onClick={onUploadClick}
        disabled={isUploading}
        className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors"
      >
        {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
        {isUploading ? `处理中 ${uploadProgress.current}/${uploadProgress.total}` : '导入课本（PDF / DOC / 图）'}
      </button>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-[11px] text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
