'use client';

import { useAppContext } from '@/lib/store';
import { Download, BrainCircuit, Search, Trash2, Edit, Info, Database, RefreshCw, Wand2, AlertCircle, FileText } from 'lucide-react';
import { useState, useRef, useMemo } from 'react';
import { clsx } from 'clsx';
import { calculateMetrics } from '@/lib/fsrs';
import { ImageModal } from './ImageModal';
import { searchMemoriesRAG, getEmbedding, reorganizeMemories } from '@/lib/ai';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useVirtualizer } from '@tanstack/react-virtual';

export function MemoryBank() {
  const { state, dispatch } = useAppContext();
  const [search, setSearch] = useState('');
  const [filterFunction, setFilterFunction] = useState<string>('all');
  const [filterPurpose, setFilterPurpose] = useState<string>('all');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // RAG Management State
  const [ragSearchQuery, setRagSearchQuery] = useState('');
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [isRagSearching, setIsRagSearching] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const [isReorganizing, setIsReorganizing] = useState(false);
  const [showRagManager, setShowRagManager] = useState(false);

  const functionTypes = Array.from(new Set(state.memories.map(m => m.functionType)));
  const purposeTypes = Array.from(new Set(state.memories.map(m => m.purposeType)));

  const memories = state.memories
    .filter((m) => m.subject === state.currentSubject)
    .filter((m) => m.content.toLowerCase().includes(search.toLowerCase()))
    .filter((m) => filterFunction === 'all' || m.functionType === filterFunction)
    .filter((m) => filterPurpose === 'all' || m.purposeType === filterPurpose)
    .sort((a, b) => b.createdAt - a.createdAt);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: memories.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 200,
    overscan: 5,
  });

  const handleRagSearch = async () => {
    if (!ragSearchQuery.trim()) return;
    setIsRagSearching(true);
    try {
      const results = await searchMemoriesRAG(ragSearchQuery, state.memories.filter(m => m.subject === state.currentSubject), state.settings);
      setRagResults(results);
    } catch (error) {
      console.error('RAG Search failed:', error);
    } finally {
      setIsRagSearching(false);
    }
  };

  const handleReindexAll = async () => {
    if (isReindexing) return;
    setIsReindexing(true);
    try {
      const subjectMemories = state.memories.filter(m => m.subject === state.currentSubject);
      for (const memory of subjectMemories) {
        if (!memory.embedding) {
          const embedding = await getEmbedding(memory.content, state.settings);
          dispatch({
            type: 'UPDATE_MEMORY',
            payload: { ...memory, embedding }
          });
        }
      }
      alert('重新索引完成！');
    } catch (error) {
      console.error('Reindexing failed:', error);
      alert('重新索引失败，请检查网络。');
    } finally {
      setIsReindexing(false);
    }
  };

  const handleReorganize = async () => {
    if (isReorganizing) return;
    setIsReorganizing(true);
    try {
      const subjectMemories = state.memories.filter(m => m.subject === state.currentSubject);
      const operations = await reorganizeMemories(state.settings, state.currentSubject, subjectMemories);
      
      if (operations.length === 0) {
        alert('记忆库已经很整洁，无需调整。');
        return;
      }

      // For simplicity, we'll just show the operations in a log for now
      // In a real app, we'd show a preview modal like in KnowledgeGraph
      console.log('Memory Reorganization Operations:', operations);
      alert('AI 已生成整理建议，请在控制台查看（后续将支持自动应用）。');
    } catch (error) {
      console.error('Reorganization failed:', error);
      alert('整理失败，请检查网络。');
    } finally {
      setIsReorganizing(false);
    }
  };

  const handleEdit = (memory: any) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditNotes(memory.notes || '');
  };

  const handleSaveEdit = (memory: any) => {
    dispatch({
      type: 'UPDATE_MEMORY',
      payload: { ...memory, content: editContent, notes: editNotes }
    });
    dispatch({
      type: 'ADD_FEEDBACK_EVENT',
      payload: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        subject: state.currentSubject,
        targetType: 'memory',
        targetId: memory.id,
        signalType: 'memory_edited',
        sentiment: 'neutral',
        note: 'Memory content edited by user',
        metadata: {
          workflow: memory.ingestionMode || 'quick',
        },
      }
    });
    setEditingId(null);
  };

  const escapeCSV = (str: string) => {
    if (!str) return '""';
    return '"' + str.replace(/"/g, '""') + '"';
  };

  const exportToAnki = () => {
    const csvContent = memories
      .map((m) => {
        const front = `[${m.functionType}] ${m.content}`;
        const back = `关联节点: ${m.knowledgeNodeIds.map(id => state.knowledgeNodes.find(n => n.id === id)?.name).join(', ')}<br/>分类: ${m.purposeType}<br/>${m.notes || ''}`;
        return `${escapeCSV(front)},${escapeCSV(back)}`;
      })
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${state.currentSubject}_anki_export.csv`;
    link.click();
  };

  const indexedCount = useMemo(() => memories.filter(m => m.embedding).length, [memories]);

  return (
    <div className="p-2 h-full flex flex-col max-w-6xl mx-auto text-slate-200 bg-black">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center shadow-2xl">
            <BrainCircuit className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-base font-black tracking-tighter text-white uppercase">
              {state.currentSubject} 记忆库
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded-full">
                <span className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">检索:</span>
                <span className="text-[7px] font-black text-blue-400 uppercase tracking-widest">
                  {state.settings.parseModel || 'GEMINI-2.0-FLASH'}
                </span>
              </div>
              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 rounded-full">
                <span className="text-[7px] font-bold text-slate-600 uppercase tracking-widest">向量:</span>
                <span className="text-[7px] font-black text-green-400 uppercase tracking-widest">
                  GOOGLE-EMBEDDING-2
                </span>
              </div>
              <button 
                onClick={() => setShowRagManager(!showRagManager)}
                className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 border border-slate-800 hover:border-purple-500/50 rounded-full transition-all"
                title="管理RAG向量索引"
              >
                <Database className="w-2.5 h-2.5 text-purple-400" />
                <span className="text-[7px] font-black text-purple-400 uppercase tracking-widest">
                  {indexedCount} / {memories.length} 已索引
                </span>
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReorganize}
            disabled={isReorganizing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-purple-500/50 hover:bg-slate-800 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-xl disabled:opacity-50"
          >
            {isReorganizing ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : <Wand2 className="w-2.5 h-2.5" />}
            AI 整理
          </button>
          <button
            onClick={exportToAnki}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 border border-slate-800 hover:border-blue-500/50 hover:bg-slate-800 text-slate-300 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all shadow-xl group"
          >
            <Download className="w-2.5 h-2.5 group-hover:translate-y-0.5 transition-transform" />
            导出 ANKI
          </button>
        </div>
      </div>

      {showRagManager && (
        <div className="mb-6 p-4 bg-slate-900/40 border border-slate-800 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] flex items-center gap-2">
              <Database className="w-4 h-4" /> 检索与向量管理器
            </h3>
            <button 
              onClick={handleReindexAll}
              disabled={isReindexing}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-green-500/50 text-[8px] font-black text-slate-400 uppercase tracking-widest rounded-lg transition-all disabled:opacity-50"
            >
              {isReindexing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              重新索引全部
            </button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
                <input
                  type="text"
                  placeholder="测试检索..."
                  value={ragSearchQuery}
                  onChange={(e) => setRagSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRagSearch()}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white focus:ring-1 focus:ring-purple-500/50 outline-none transition-all"
                />
                <button 
                  onClick={handleRagSearch}
                  disabled={isRagSearching}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 bg-purple-600 hover:bg-purple-500 text-[8px] font-black text-white rounded-md transition-all disabled:opacity-50"
                >
                  {isRagSearching ? '...' : '搜索'}
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {ragResults.length > 0 ? (
                  ragResults.map((m, i) => (
                    <div key={i} className="p-2 bg-slate-950/50 border border-slate-800/50 rounded-lg text-[9px] text-slate-400">
                      <span className="text-purple-400 font-bold mr-2">#{i+1}</span>
                      {m.content.substring(0, 80)}...
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-[8px] text-slate-600 uppercase tracking-widest">
                    暂无检索结果
                  </div>
                )}
              </div>
            </div>
            
            <div className="bg-slate-950/50 p-3 rounded-xl border border-slate-800/50">
              <h4 className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-2">向量统计</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-600">总记忆数</span>
                  <span className="text-white font-bold">{memories.length}</span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-600">已索引</span>
                  <span className="text-green-400 font-bold">{indexedCount}</span>
                </div>
                <div className="flex justify-between text-[9px]">
                  <span className="text-slate-600">待处理</span>
                  <span className="text-amber-400 font-bold">{memories.length - indexedCount}</span>
                </div>
                <div className="w-full bg-slate-900 h-1 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-green-500 h-full transition-all duration-500" 
                    style={{ width: `${(indexedCount / (memories.length || 1)) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <div className="relative md:col-span-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" />
            <input
              type="text"
              placeholder="搜索记忆..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-900/50 border border-slate-900 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-slate-700"
            />
          </div>
          {(search || filterFunction !== 'all' || filterPurpose !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setFilterFunction('all');
                setFilterPurpose('all');
              }}
              className="px-3 py-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-400 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap"
              title="清除所有筛选条件"
            >
              清除筛选
            </button>
          )}
        </div>
        <select
          value={filterFunction}
          onChange={(e) => setFilterFunction(e.target.value)}
          className="px-3 py-2 bg-slate-900/50 border border-slate-900 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-400 focus:ring-1 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-slate-900 transition-all"
        >
          <option value="all">所有功能类型</option>
          {functionTypes.filter(Boolean).map((t, i) => <option key={`${t}-${i}`} value={t}>{(t || '').toUpperCase()}</option>)}
        </select>
        <select
          value={filterPurpose}
          onChange={(e) => setFilterPurpose(e.target.value)}
          className="px-3 py-2 bg-slate-900/50 border border-slate-900 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-400 focus:ring-1 focus:ring-blue-500/50 outline-none cursor-pointer hover:bg-slate-900 transition-all"
        >
          <option value="all">所有用途类型</option>
          {purposeTypes.filter(Boolean).map((t, i) => <option key={`${t}-${i}`} value={t}>{(t || '').toUpperCase()}</option>)}
        </select>
      </div>

      <div ref={parentRef} className="flex-1 overflow-y-auto pb-6 custom-scrollbar">
        {memories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-slate-900/20 rounded-[2rem] border border-dashed border-slate-900">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6 border border-slate-800">
              <Search className="w-6 h-6 text-slate-800" />
            </div>
            <p className="text-slate-600 font-black text-[10px] uppercase tracking-[0.3em]">未找到匹配的记忆</p>
          </div>
        ) : (
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const memory = memories[virtualRow.index];
              if (!memory) return null;
              const metrics = calculateMetrics(memory.fsrs, memory.lastReviewed);
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualRow.start}px)`,
                    paddingBottom: '16px', // Gap between items
                  }}
                >
                  <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-900 shadow-xl hover:border-slate-800 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600 opacity-0 group-hover:opacity-100 transition-all duration-500" />
                    
                    {editingId === memory.id ? (
                      <div className="space-y-4">
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full p-4 bg-slate-950 border border-slate-900 rounded-xl text-xs text-white focus:ring-1 focus:ring-indigo-500/50 outline-none resize-y transition-all"
                          rows={3}
                        />
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="补充笔记..."
                          className="w-full p-4 border border-amber-900/20 bg-amber-500/5 rounded-xl text-xs text-amber-200/80 focus:ring-1 focus:ring-amber-500/50 outline-none resize-y transition-all"
                          rows={2}
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setEditingId(null)}
                            className="px-4 py-2 text-[8px] font-black uppercase tracking-widest text-slate-500 bg-slate-900 hover:bg-slate-800 rounded-lg transition-all border border-slate-800"
                          >
                            取消
                          </button>
                          <button
                            onClick={() => handleSaveEdit(memory)}
                            className="px-4 py-2 text-[8px] font-black uppercase tracking-widest text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-xl transition-all"
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="text-slate-200 text-xs leading-relaxed prose prose-invert prose-sm max-w-none flex-1">
                            <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.content || ''}</Markdown>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <button
                              onClick={() => handleEdit(memory)}
                              className="text-slate-600 hover:text-blue-400 p-2 hover:bg-slate-900 rounded-lg transition-all"
                              title="编辑记忆"
                            >
                              <Edit className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: '删除记忆',
                                  message: '确定要删除这条记忆吗？',
                                  onConfirm: () => {
                                    dispatch({
                                      type: 'ADD_FEEDBACK_EVENT',
                                      payload: {
                                        id: crypto.randomUUID(),
                                        timestamp: Date.now(),
                                        subject: state.currentSubject,
                                        targetType: 'memory',
                                        targetId: memory.id,
                                        signalType: 'memory_deleted',
                                        sentiment: 'negative',
                                        note: 'Memory deleted from bank',
                                        metadata: {
                                          workflow: memory.ingestionMode || 'quick',
                                        },
                                      }
                                    });
                                    dispatch({ type: 'DELETE_MEMORY', payload: memory.id });
                                    setConfirmModal(null);
                                  }
                                });
                              }}
                              className="text-slate-600 hover:text-red-500 p-2 hover:bg-slate-900 rounded-lg transition-all"
                              title="删除记忆"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {memory.imageUrl && (
                          <div className="relative group/img mb-4 rounded-xl overflow-hidden border border-slate-900 cursor-pointer shadow-xl">
                            {memory.imageUrl.startsWith('data:application/pdf') ? (
                              <div 
                                className="w-full h-32 bg-slate-800 flex flex-col items-center justify-center text-slate-400 group-hover:bg-slate-700 transition-colors"
                                onClick={() => {
                                  const newWindow = window.open();
                                  if (newWindow) {
                                    newWindow.document.write(`<iframe src="${memory.imageUrl}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                                  }
                                }}
                              >
                                <FileText className="w-8 h-8 mb-2" />
                                <span className="text-xs font-bold">查看 PDF 附件</span>
                              </div>
                            ) : (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img 
                                src={memory.imageUrl} 
                                alt="Source" 
                                className="max-h-40 w-full object-cover group-hover:scale-105 transition-transform duration-700" 
                                onClick={() => setPreviewImage(memory.imageUrl!)}
                              />
                            )}
                          </div>
                        )}

                        {memory.isMistake && (
                          <div className="bg-red-500/5 text-red-200/80 text-[10px] p-4 rounded-xl mb-4 border border-red-500/10 prose prose-invert prose-sm max-w-none">
                            <div className="flex items-center gap-2 mb-2 text-red-500 font-black uppercase tracking-[0.2em] text-[8px]">
                              <AlertCircle className="w-3 h-3" /> 错题分析
                            </div>
                            {memory.wrongAnswer && (
                              <div className="mb-2">
                                <span className="font-bold text-red-400">我的错误答案：</span>
                                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.wrongAnswer}</Markdown>
                              </div>
                            )}
                            {memory.errorReason && (
                              <div>
                                <span className="font-bold text-red-400">错误原因分析：</span>
                                <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.errorReason}</Markdown>
                              </div>
                            )}
                          </div>
                        )}

                        {memory.notes && (
                          <div className="bg-amber-500/5 text-amber-200/80 text-[10px] p-4 rounded-xl mb-4 border border-amber-500/10 prose prose-invert prose-sm max-w-none">
                            <div className="flex items-center gap-2 mb-2 text-amber-500 font-black uppercase tracking-[0.2em] text-[8px]">
                              <Info className="w-3 h-3" /> 笔记
                            </div>
                            <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.notes}</Markdown>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 mb-4">
                          <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-[8px] font-black uppercase tracking-widest border border-indigo-500/20">
                            {memory.functionType || '未分类'}
                          </span>
                          <span className="px-3 py-1 bg-purple-500/10 text-purple-400 rounded-full text-[8px] font-black uppercase tracking-widest border border-purple-500/20">
                            {memory.purposeType || '未分类'}
                          </span>
                          {memory.embedding && (
                            <span className="px-3 py-1 bg-green-500/10 text-green-400 rounded-full text-[8px] font-black uppercase tracking-widest border border-green-500/20 flex items-center gap-1">
                              <Search className="w-2.5 h-2.5" /> RAG 就绪
                            </span>
                          )}
                          <div className="flex-1" />
                          <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest">
                            {new Date(memory.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="pt-4 border-t border-slate-900 flex items-center justify-between">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="text-[8px] text-slate-600 font-black uppercase tracking-widest shrink-0">关联节点</span>
                            <div className="flex gap-1 overflow-x-auto no-scrollbar">
                              {(memory.knowledgeNodeIds || []).map(id => {
                                const node = state.knowledgeNodes.find(n => n.id === id);
                                return node ? (
                                  <span key={id} className="px-2 py-1 bg-slate-950 text-slate-500 rounded-lg text-[8px] font-bold border border-slate-900 whitespace-nowrap">
                                    {(node.name || '').toUpperCase()}
                                  </span>
                                ) : null;
                              })}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-4 shrink-0 ml-4">
                            <div className="flex flex-col items-end">
                              <span className="text-[8px] text-slate-500 font-black uppercase mb-1 tracking-widest">掌握度 {Math.round(metrics.mastery)}%</span>
                              <div className="w-16 h-1 bg-slate-950 rounded-full overflow-hidden border border-slate-900">
                                <div
                                  className={clsx(
                                    'h-full rounded-full transition-all duration-1000 ease-out',
                                    metrics.mastery > 70 ? 'bg-emerald-500' : 
                                    metrics.mastery > 40 ? 'bg-amber-500' : 
                                    'bg-rose-500'
                                  )}
                                  style={{ width: `${metrics.mastery}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewImage && <ImageModal src={previewImage} onClose={() => setPreviewImage(null)} />}

      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-10 h-10 bg-rose-950/30 rounded-xl flex items-center justify-center mb-4 border border-rose-900/30">
              <Trash2 className="w-5 h-5 text-rose-500" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1 tracking-tight">{confirmModal.title}</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="flex-1 px-3 py-2 text-xs font-semibold text-slate-400 bg-slate-900 hover:bg-slate-800 rounded-xl transition-all border border-slate-800"
              >
                取消
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all shadow-lg shadow-rose-900/20"
              >
                确定删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
