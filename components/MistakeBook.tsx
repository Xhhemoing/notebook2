'use client';

import { useAppContext } from '@/lib/store';
import { BookX, Trash2, CheckCircle, Info, Edit, Search, Filter, X, ChevronLeft, ChevronRight, GitCommit, Tag } from 'lucide-react';
import { useState, useCallback } from 'react';
import { clsx } from 'clsx';
import { ImageModal } from './ImageModal';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import { v4 as uuidv4 } from 'uuid';
import { createMemoryPayload } from '@/lib/data/commands';

export function MistakeBook() {
  const { state, dispatch } = useAppContext();
  const [search, setSearch] = useState('');
  const [showAnalysis, setShowAnalysis] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editWrongAnswer, setEditWrongAnswer] = useState('');
  const [editErrorReason, setEditErrorReason] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  const [filterReason, setFilterReason] = useState<string>('all');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  const allMistakes = state.memories.filter((m) => m.subject === state.currentSubject && m.isMistake);
  const errorReasons = Array.from(new Set(allMistakes.map(m => m.errorReason).filter(Boolean))) as string[];

  const mistakes = allMistakes
    .filter((m) => m.content.toLowerCase().includes(search.toLowerCase()))
    .filter((m) => filterReason === 'all' || m.errorReason === filterReason);

  const totalPages = Math.ceil(mistakes.length / itemsPerPage);
  const paginatedMistakes = mistakes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleEdit = useCallback((memory: any) => {
    setEditingId(memory.id);
    setEditContent(memory.content);
    setEditNotes(memory.notes || '');
    setEditWrongAnswer(memory.wrongAnswer || '');
    setEditErrorReason(memory.errorReason || '');
    setEditImageUrl(memory.imageUrl || '');
  }, []);

  const handleSaveEdit = useCallback((memory: any) => {
    // Generate these values ONLY when called
    const eventId = uuidv4();
    const now = Date.now();

    dispatch({
      type: 'UPDATE_MEMORY',
      payload: { 
        ...memory, 
        content: editContent, 
        notes: editNotes,
        wrongAnswer: editWrongAnswer,
        errorReason: editErrorReason,
        imageUrl: editImageUrl
      }
    });
    dispatch({
      type: 'ADD_FEEDBACK_EVENT',
      payload: {
        id: eventId,
        timestamp: now,
        subject: state.currentSubject,
        targetType: 'memory',
        targetId: memory.id,
        signalType: 'memory_edited',
        sentiment: 'neutral',
        note: 'Mistake memory edited by user',
        metadata: {
          workflow: memory.ingestionMode || 'image_pro',
        },
      }
    });
    setEditingId(null);
  }, [editContent, editNotes, editWrongAnswer, editErrorReason, editImageUrl, state.currentSubject, dispatch]);

  const toggleMistake = useCallback((id: string, currentStatus: boolean | undefined) => {
    const memory = state.memories.find(m => m.id === id);
    if (memory) {
      const eventId = uuidv4();
      const now = Date.now();
      dispatch({
        type: 'ADD_FEEDBACK_EVENT',
        payload: {
          id: eventId,
          timestamp: now,
          subject: state.currentSubject,
          targetType: 'memory',
          targetId: id,
          signalType: 'memory_promoted',
          sentiment: !currentStatus ? 'positive' : 'neutral',
          note: !currentStatus ? 'Marked as mistake' : 'Removed from mistake set',
          metadata: {
            workflow: memory.ingestionMode || 'image_pro',
          },
        },
      });
      dispatch({ type: 'UPDATE_MEMORY', payload: { ...memory, isMistake: !currentStatus } });
    }
  }, [state.memories, state.currentSubject, dispatch]);

  const handleApproveProposal = (memoryId: string, proposal: any) => {
    if (!proposal.suggestedNodeName) {
      dispatch({ type: 'REMOVE_DRAFT_PROPOSAL' as any, payload: memoryId });
      return;
    }
    
    // Find if the node already exists
    let existingNode = state.knowledgeNodes.find(n => n.name === proposal.suggestedNodeName && n.subject === state.currentSubject);
    let nodeId = existingNode?.id;
    
    // If we need to create it and it doesn't exist
    if (proposal.action === 'CREATE_NODE' && !existingNode) {
       nodeId = uuidv4();
       dispatch({
         type: 'ADD_NODE',
         payload: {
           id: nodeId,
           subject: state.currentSubject,
           name: proposal.suggestedNodeName,
           parentId: null, // Attach to root, or could be smarter
           order: state.knowledgeNodes.length + 1
         }
       });
    }

    if (nodeId) {
      // Connect to memory
      const memory = state.memories.find(m => m.id === memoryId);
      if (memory) {
         dispatch({
           type: 'UPDATE_MEMORY',
           payload: {
             ...memory,
             knowledgeNodeIds: [...new Set([...memory.knowledgeNodeIds, nodeId])]
           }
         });
      }
    }
    
    dispatch({ type: 'REMOVE_DRAFT_PROPOSAL' as any, payload: memoryId });
  };

  return (
    <div className="p-4 md:p-6 h-full flex flex-col w-full max-w-[100vw] text-slate-200 bg-black overflow-hidden">
      {/* Header Section */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-3">
            <div className="p-2 bg-red-500/10 rounded-lg shrink-0">
              <BookX className="w-5 h-5 md:w-6 md:h-6 text-red-500" />
            </div>
            <span className="truncate">{state.currentSubject} 错题本</span>
          </h2>
          <p className="text-slate-500 text-xs md:text-sm mt-1">记录薄弱环节，针对性查漏补缺</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="relative group flex-1 md:flex-initial">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-red-500 transition-colors" />
            <input
              type="text"
              placeholder="搜索错题..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-red-500/50 outline-none w-full md:w-64 transition-all"
            />
          </div>
          
          <div className="relative flex-1 md:flex-initial">
            <select
              value={filterReason}
              onChange={(e) => setFilterReason(e.target.value)}
              className="appearance-none pl-10 pr-8 py-2 bg-slate-900 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-red-500/50 outline-none text-slate-300 cursor-pointer w-full"
            >
              <option value="all">所有错因</option>
              {errorReasons.map(reason => (
                <option key={reason} value={reason}>{reason}</option>
              ))}
            </select>
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        {paginatedMistakes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-600 border-2 border-dashed border-slate-900 rounded-3xl">
            <BookX className="w-12 h-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">暂无错题记录</p>
            <p className="text-sm opacity-60 text-center px-4">在 AI 答疑中标记问题为“错题”即可在此查看</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 pb-10">
            {paginatedMistakes.map((memory) => {
              const draftProposal = (memory as any).draftProposal; 
              
              return (
              <div key={memory.id} className="group bg-slate-900/30 border border-slate-900 rounded-2xl overflow-hidden hover:border-red-500/20 transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/5">
                <div className="p-6">
                  {editingId === memory.id ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">题目内容</label>
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="w-full p-4 bg-slate-950 border border-slate-800 rounded-xl text-sm focus:ring-2 focus:ring-red-500/50 outline-none resize-none h-32"
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">错误答案</label>
                          <textarea
                            value={editWrongAnswer}
                            onChange={(e) => setEditWrongAnswer(e.target.value)}
                            className="w-full p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-sm focus:ring-2 focus:ring-red-500/50 outline-none h-24"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">错因分析</label>
                          <textarea
                            value={editErrorReason}
                            onChange={(e) => setEditErrorReason(e.target.value)}
                            className="w-full p-3 bg-orange-500/5 border border-orange-500/20 rounded-xl text-sm focus:ring-2 focus:ring-orange-500/50 outline-none h-24"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">题目图片 (可选，补充原图)</label>
                        <div className="flex items-center gap-3">
                          {editImageUrl && (
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={editImageUrl} alt="preview" className="w-full h-full object-cover" />
                              <button onClick={() => setEditImageUrl('')} className="absolute top-1 right-1 bg-black/60 rounded p-1 hover:text-red-400">
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {!editImageUrl && (
                            <label className="cursor-pointer px-4 py-2 bg-slate-900 border border-slate-700 hover:border-slate-500 rounded-xl text-sm font-medium transition-all text-slate-300">
                              上传图片
                              <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*" 
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    const reader = new FileReader();
                                    reader.onload = () => setEditImageUrl(reader.result as string);
                                    reader.readAsDataURL(file);
                                  }
                                }} 
                              />
                            </label>
                          )}
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 pt-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleSaveEdit(memory)}
                          className="px-6 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-lg shadow-red-600/20"
                        >
                          保存修改
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 text-slate-200">
                          <div className="flex items-center gap-1 mb-2">
                             <Tag className="w-3 h-3 text-slate-500"/>
                             <span className="text-[10px] text-slate-500 font-medium">题目正文</span>
                          </div>
                          <div className="prose prose-invert prose-sm max-w-none text-slate-200 leading-relaxed text-sm">
                            <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.content}</Markdown>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => toggleMistake(memory.id, memory.isMistake)}
                            className="p-2 text-slate-500 hover:text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
                            title="已掌握"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => handleEdit(memory)}
                            className="p-2 text-slate-500 hover:text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                            title="编辑"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => {
                              const eventId = uuidv4();
                              const now = Date.now();
                              dispatch({
                                type: 'ADD_FEEDBACK_EVENT',
                                payload: {
                                  id: eventId,
                                  timestamp: now,
                                  subject: state.currentSubject,
                                  targetType: 'memory',
                                  targetId: memory.id,
                                  signalType: 'memory_deleted',
                                  sentiment: 'negative',
                                  note: 'Mistake memory deleted by user',
                                  metadata: {
                                    workflow: memory.ingestionMode || 'image_pro',
                                  },
                                },
                              });
                              dispatch({ type: 'DELETE_MEMORY', payload: memory.id });
                            }}
                            className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                            title="删除"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </div>
                      </div>

                      {memory.imageUrl && (
                        <div className="relative w-fit group/img">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img 
                            src={memory.imageUrl} 
                            alt="Mistake Source" 
                            className="max-h-64 rounded-xl border border-slate-800 cursor-pointer hover:border-red-500/50 transition-all" 
                            onClick={() => setPreviewImage(memory.imageUrl!)}
                          />
                          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity pointer-events-none rounded-xl" />
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-4">
                        {memory.wrongAnswer && (
                          <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                              <span className="text-xs font-bold text-red-500/80 uppercase tracking-wider">我的错解</span>
                            </div>
                            <div className="text-sm text-red-200/90 prose prose-invert prose-sm max-w-none">
                              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.wrongAnswer}</Markdown>
                            </div>
                          </div>
                        )}
                        {memory.errorReason && (
                          <div className="p-4 bg-orange-500/5 border border-orange-500/10 rounded-xl">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                              <span className="text-xs font-bold text-orange-500/80 uppercase tracking-wider">AI 错因诊断</span>
                            </div>
                            <div className="text-[13px] text-orange-200/90 prose prose-invert prose-sm max-w-none leading-relaxed">
                              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{memory.errorReason}</Markdown>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Human in the loop confirmation UI */}
                      {draftProposal && (
                        <div className="mt-2 relative z-10 p-4 border border-indigo-500/30 bg-indigo-500/10 rounded-xl animate-in fade-in zoom-in-95 shadow-lg shadow-indigo-500/5">
                          <div className="flex items-center gap-2 mb-3 text-indigo-400 font-bold text-sm">
                            <GitCommit className="w-4 h-4" />
                            AI 局部图谱关联提议
                          </div>
                          <p className="text-xs text-indigo-200/80 mb-4 leading-relaxed">{draftProposal.reasoning}</p>
                          <div className="flex items-center gap-2 bg-black/30 p-2 rounded-lg mb-4">
                            <span className="text-[10px] px-2 py-1 bg-slate-800 text-slate-300 rounded-md font-mono border border-slate-700 font-semibold tracking-wide">
                              {draftProposal.action === 'CREATE_NODE' ? '新建节点' : 
                               draftProposal.action === 'ADD_RELATION' ? '易混淆关联' : '挂载现有'}
                            </span>
                            <span className="text-sm text-indigo-300 font-medium">
                              {draftProposal.suggestedNodeName ? `"${draftProposal.suggestedNodeName}"` : '未知'}
                            </span>
                          </div>
                          <div className="flex gap-3">
                            <button 
                              onClick={() => handleApproveProposal(memory.id, draftProposal)}
                              className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors shadow-lg shadow-indigo-600/20"
                            >
                              批准并关联
                            </button>
                            <button 
                              onClick={() => dispatch({ type: 'REMOVE_DRAFT_PROPOSAL' as any, payload: memory.id })}
                              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg transition-colors border border-slate-700"
                            >
                              拒绝
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-slate-800/50">
                        <div className="flex flex-wrap gap-2">
                          {Array.from(new Set(memory.knowledgeNodeIds)).map((id, index) => {
                            const node = state.knowledgeNodes.find(n => n.id === id);
                            if (!node) return null;
                            return (
                              <span key={`${id}-${index}`} className="px-2.5 py-1 bg-indigo-500/10 text-indigo-300 rounded-lg text-[10px] font-medium border border-indigo-500/20">
                                {node.name}
                              </span>
                            );
                          })}
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono tracking-wider uppercase">
                          {new Date(memory.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-')}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 mt-8 pb-8">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-200">{currentPage}</span>
            <span className="text-sm text-slate-600">/</span>
            <span className="text-sm text-slate-500">{totalPages}</span>
          </div>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-2 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {previewImage && <ImageModal src={previewImage} onClose={() => setPreviewImage(null)} />}
    </div>
  );
}
