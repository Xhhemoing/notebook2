'use client';

import React, { useState, useMemo } from 'react';
import { clearLocalAppData, useAppContext } from '@/lib/store';
import { Shield, Trash2, RefreshCw, AlertTriangle, Sparkles, ShieldAlert, Filter, Database, Search, Zap, Loader2, X, BarChart2 } from 'lucide-react';
import { Memory, KnowledgeNode, Subject } from '@/lib/types';
import clsx from 'clsx';
import { v4 as uuidv4 } from 'uuid';

export default function DataGovernanceSettings() {
  const { state, dispatch } = useAppContext();
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [isDeepScanning, setIsDeepScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'alert' | 'confirm', onConfirm?: () => void }>({ isOpen: false, title: '', message: '', type: 'alert' });

  const showAlert = (title: string, message: string) => {
    setModalConfig({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  const subjects = Array.from(new Set([
    ...state.memories.map(m => m.subject),
    ...state.knowledgeNodes.map(n => n.subject),
    ...state.textbooks.map(t => t.subject)
  ]));

  const duplicates = useMemo(() => {
    const memoryDupes: Memory[] = [];
    const contentMap = new Map<string, string>();
    state.memories.forEach(m => {
      const key = `${m.subject}-${m.content}`;
      if (contentMap.has(key)) {
        memoryDupes.push(m);
      } else {
        contentMap.set(key, m.id);
      }
    });

    const nodeDupes: KnowledgeNode[] = [];
    const nodeMap = new Map<string, string>();
    state.knowledgeNodes.forEach(n => {
      const key = `${n.subject}-${n.parentId}-${n.name}`;
      if (nodeMap.has(key)) {
        nodeDupes.push(n);
      } else {
        nodeMap.set(key, n.id);
      }
    });

    return { memories: memoryDupes, nodes: nodeDupes };
  }, [state.memories, state.knowledgeNodes]);

  const deepScanResults = useMemo(() => {
    const emptyMemories = state.memories.filter(m => !m.content.trim());
    const invalidNodes = state.knowledgeNodes.filter(n => !n.name.trim() || !n.subject);
    
    const circularNodes: string[] = [];
    const checkCircular = (nodeId: string, visited: Set<string>, path: Set<string>) => {
      visited.add(nodeId);
      path.add(nodeId);
      const node = state.knowledgeNodes.find(n => n.id === nodeId);
      if (node && node.parentId) {
        if (path.has(node.parentId)) {
          circularNodes.push(nodeId);
        } else if (!visited.has(node.parentId)) {
          checkCircular(node.parentId, visited, path);
        }
      }
      path.delete(nodeId);
    };

    const visited = new Set<string>();
    state.knowledgeNodes.forEach(n => {
      if (!visited.has(n.id)) {
        checkCircular(n.id, visited, new Set());
      }
    });

    return {
      emptyMemories,
      invalidNodes,
      circularNodes: Array.from(new Set(circularNodes))
    };
  }, [state.memories, state.knowledgeNodes]);

  const handleDeduplicate = () => {
    if (duplicates.memories.length === 0 && duplicates.nodes.length === 0) {
      showAlert('提示', '未发现冗余数据。');
      return;
    }
    showConfirm('清理冗余数据', `发现 ${duplicates.memories.length} 条冗余记忆和 ${duplicates.nodes.length} 个冗余知识节点。是否自动清理？`, () => {
      if (duplicates.memories.length > 0) {
        dispatch({ type: 'BATCH_DELETE_MEMORIES', payload: duplicates.memories.map(m => m.id) });
      }
      if (duplicates.nodes.length > 0) {
        dispatch({ type: 'BATCH_DELETE_NODES', payload: duplicates.nodes.map(n => n.id) });
      }
      showAlert('成功', '清理完成。');
    });
  };

  const handleFixGraph = () => {
    const nodeIds = new Set(state.knowledgeNodes.map(n => n.id));
    const brokenNodes = state.knowledgeNodes.filter(n => n.parentId && !nodeIds.has(n.parentId));
    
    if (brokenNodes.length === 0) {
      showAlert('提示', '未发现异常节点。');
      return;
    }

    showConfirm('修复异常节点', `发现 ${brokenNodes.length} 个异常节点（父节点不存在），是否修复？`, () => {
      brokenNodes.forEach(node => {
        dispatch({ type: 'UPDATE_NODE', payload: { ...node, parentId: null } });
      });
      showAlert('成功', '修复完成。');
    });
  };

  const handleCleanupEmptyTextbooks = () => {
    const empty = state.textbooks.filter(t => t.pages.length === 0);
    if (empty.length === 0) {
      showAlert('提示', '未发现空课本。');
      return;
    }
    showConfirm('清理空课本', `发现 ${empty.length} 本空课本（无页面）。是否删除？`, () => {
      dispatch({ type: 'BATCH_DELETE_TEXTBOOKS', payload: empty.map(t => t.id) });
      showAlert('成功', '删除完成。');
    });
  };

  const handleDeleteSubjectData = () => {
    if (subjectFilter === 'all') {
      showAlert('提示', '请先选择一个具体学科。');
      return;
    }
    showConfirm('危险操作', `确定要删除【${subjectFilter}】学科下的所有数据吗？`, () => {
      dispatch({ type: 'DELETE_SUBJECT_DATA', payload: { subject: subjectFilter as Subject } });
      showAlert('成功', `【${subjectFilter}】学科数据已清空。`);
    });
  };

  const handleDeleteSubjectNodes = () => {
    if (subjectFilter === 'all') return;
    showConfirm('删除知识图谱', `确定要删除【${subjectFilter}】学科下的所有知识图谱节点吗？`, () => {
      dispatch({ type: 'DELETE_SUBJECT_NODES', payload: { subject: subjectFilter as Subject } });
      showAlert('成功', `【${subjectFilter}】学科知识图谱已清空。`);
    });
  };

  const handleDeleteSubjectMistakes = () => {
    if (subjectFilter === 'all') return;
    showConfirm('删除错题记录', `确定要删除【${subjectFilter}】学科下的所有错题记录吗？`, () => {
      dispatch({ type: 'DELETE_SUBJECT_MISTAKES', payload: { subject: subjectFilter as Subject } });
      showAlert('成功', `【${subjectFilter}】学科错题记录已清空。`);
    });
  };

  const handleDeleteSubjectTextbooks = () => {
    if (subjectFilter === 'all') return;
    showConfirm('删除课本', `确定要删除【${subjectFilter}】学科下的所有课本吗？`, () => {
      dispatch({ type: 'DELETE_SUBJECT_TEXTBOOKS', payload: { subject: subjectFilter as Subject } });
      showAlert('成功', `【${subjectFilter}】学科课本已清空。`);
    });
  };

  const handleDeepCleanup = () => {
    const total = deepScanResults.emptyMemories.length + deepScanResults.invalidNodes.length + deepScanResults.circularNodes.length;
    if (total === 0) {
      showAlert('提示', '深度扫描未发现异常数据。');
      return;
    }

    showConfirm('深度清理', `深度扫描发现：\n- 空白记忆: ${deepScanResults.emptyMemories.length}\n- 无效节点: ${deepScanResults.invalidNodes.length}\n- 循环引用节点: ${deepScanResults.circularNodes.length}\n\n是否立即清理这些异常数据？`, () => {
      if (deepScanResults.emptyMemories.length > 0) {
        dispatch({ type: 'BATCH_DELETE_MEMORIES', payload: deepScanResults.emptyMemories.map(m => m.id) });
      }
      const nodesToDelete = [...deepScanResults.invalidNodes.map(n => n.id), ...deepScanResults.circularNodes];
      if (nodesToDelete.length > 0) {
        dispatch({ type: 'BATCH_DELETE_NODES', payload: Array.from(new Set(nodesToDelete)) });
      }
      showAlert('成功', '深度清理完成。');
    });
  };

  const handleFixBrokenNodes = () => {
    const nodeIds = new Set(state.knowledgeNodes.map(n => n.id));
    const brokenNodes = state.knowledgeNodes.filter(n => n.parentId && !nodeIds.has(n.parentId));
    if (brokenNodes.length === 0) {
      showAlert('提示', '未发现异常节点。');
      return;
    }
    showConfirm('修复异常节点', `发现 ${brokenNodes.length} 个异常节点（父节点不存在），是否修复？`, () => {
      brokenNodes.forEach(node => {
        dispatch({ type: 'UPDATE_NODE', payload: { ...node, parentId: null } });
      });
      showAlert('成功', '修复完成。');
    });
  };

  const handleAutoReorganize = async () => {
    setLoading(true);
    try {
      const { reorganizeKnowledgeGraph } = await import('@/lib/ai');
      const subjectNodes = state.knowledgeNodes.filter(n => n.subject === state.currentSubject);
      const operations = await reorganizeKnowledgeGraph(state.settings, state.currentSubject, subjectNodes);
      
      if (operations.length === 0) {
        showAlert('提示', '图谱结构已经很完善，无需调整。');
        return;
      }

      showConfirm('AI 自动整理', `AI 建议执行 ${operations.length} 项调整以优化图谱结构。是否立即应用？`, () => {
        operations.forEach(op => {
          if (op.action === 'add') {
            dispatch({ type: 'ADD_NODE', payload: { ...op.node, id: uuidv4() } });
          } else if (op.action === 'update' || op.action === 'move') {
            dispatch({ type: 'UPDATE_NODE', payload: op.node });
          } else if (op.action === 'delete') {
            dispatch({ type: 'DELETE_NODE', payload: op.nodeId });
          }
        });
        showAlert('成功', '自动整理完成。');
      });
    } catch (error) {
      console.error('Failed to reorganize graph:', error);
      showAlert('错误', '自动整理失败，请检查网络或API Key配置。');
    } finally {
      setLoading(false);
    }
  };

  const handleOneClickCleanup = () => {
    const total = duplicates.memories.length + duplicates.nodes.length + deepScanResults.emptyMemories.length + deepScanResults.invalidNodes.length + deepScanResults.circularNodes.length;
    if (total === 0) {
      showAlert('提示', '未发现可清理的冗余或异常数据。');
      return;
    }

    showConfirm('一键清理', `一键清理将执行以下操作：\n- 清理重复记忆: ${duplicates.memories.length}\n- 清理重复节点: ${duplicates.nodes.length}\n- 清理空白记忆: ${deepScanResults.emptyMemories.length}\n- 清理无效/循环节点: ${deepScanResults.invalidNodes.length + deepScanResults.circularNodes.length}\n\n是否立即执行？`, () => {
      if (duplicates.memories.length > 0) {
        dispatch({ type: 'BATCH_DELETE_MEMORIES', payload: duplicates.memories.map(m => m.id) });
      }
      if (deepScanResults.emptyMemories.length > 0) {
        dispatch({ type: 'BATCH_DELETE_MEMORIES', payload: deepScanResults.emptyMemories.map(m => m.id) });
      }
      const nodesToDelete = [
        ...duplicates.nodes.map(n => n.id),
        ...deepScanResults.invalidNodes.map(n => n.id),
        ...deepScanResults.circularNodes
      ];
      if (nodesToDelete.length > 0) {
        dispatch({ type: 'BATCH_DELETE_NODES', payload: Array.from(new Set(nodesToDelete)) });
      }
      showAlert('成功', '一键清理完成。');
    });
  };

  const handleClearAllData = async () => {
    if (confirm('警告：此操作将永久删除所有本地数据（包括记忆、知识图谱、课本等），且无法恢复！\n\n您确定要继续吗？')) {
      if (confirm('最后确认：真的要清空所有数据吗？')) {
        await clearLocalAppData();
        window.location.reload();
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ── 数据统计 ── */}
      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <BarChart2 className="w-4 h-4" />
          数据概览
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">总记忆数</p>
            <p className="text-2xl font-black text-white">{state.memories.length}</p>
          </div>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">知识节点</p>
            <p className="text-2xl font-black text-white">{state.knowledgeNodes.length}</p>
          </div>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">课本文件</p>
            <p className="text-2xl font-black text-white">{state.textbooks.length}</p>
          </div>
          <div className="p-4 bg-slate-950 rounded-xl border border-slate-900">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">错题比例</p>
            <p className="text-2xl font-black text-white">
              {state.memories.length > 0 ? ((state.memories.filter(m => m.isMistake).length / state.memories.length) * 100).toFixed(1) : 0}%
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {Array.from(new Set(state.memories.map(m => m.subject))).map(subject => {
            const count = state.memories.filter(m => m.subject === subject).length;
            const percentage = (count / state.memories.length) * 100;
            return (
              <div key={subject} className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>{subject}</span>
                  <span>{count} 条 ({percentage.toFixed(1)}%)</span>
                </div>
                <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
          {state.memories.length === 0 && (
            <p className="text-xs text-slate-500 text-center py-2">暂无记忆数据</p>
          )}
        </div>
      </section>

      {/* One-Click Cleanup Banner */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 p-6 rounded-2xl border border-indigo-500/30 flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">智能一键清理</h3>
            <p className="text-sm text-slate-400">自动检测并清除所有冗余、空白及结构异常的数据</p>
          </div>
        </div>
        <button
          onClick={handleOneClickCleanup}
          className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
        >
          立即开始
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Redundancy Cleanup */}
        <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20">
              <Layers className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">冗余数据清理</h4>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">自动识别并合并重复记录</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>重复记忆点:</span>
              <span className={duplicates.memories.length > 0 ? "text-amber-400" : "text-slate-600"}>{duplicates.memories.length}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>重复知识节点:</span>
              <span className={duplicates.nodes.length > 0 ? "text-amber-400" : "text-slate-600"}>{duplicates.nodes.length}</span>
            </div>
          </div>
          <button
            onClick={handleDeduplicate}
            className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            立即清理冗余
          </button>
        </section>

        {/* Structure Repair */}
        <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-red-500/10 rounded-xl flex items-center justify-center border border-red-500/20">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">结构异常修复</h4>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">修复层级关系或空数据</p>
            </div>
          </div>
          <div className="space-y-2">
            <button
              onClick={handleFixBrokenNodes}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between px-4"
            >
              <span>修复父节点丢失</span>
              <RefreshCw className="w-3 h-3" />
            </button>
            <button
              onClick={handleAutoReorganize}
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600/10 hover:bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between px-4 disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                <span>AI 自动整理图谱</span>
              </div>
              <Sparkles className="w-3 h-3" />
            </button>
            <button
              onClick={handleCleanupEmptyTextbooks}
              className="w-full py-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all flex items-center justify-between px-4"
            >
              <span>删除无内容课本</span>
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </section>

        {/* Subject Cleanup */}
        <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-500/20">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">分区/科目块删除</h4>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">按学科维度快速清理数据块</p>
            </div>
          </div>
          <div className="space-y-3">
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="all">选择要清理的学科...</option>
              {subjects.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={handleDeleteSubjectData}
              disabled={subjectFilter === 'all'}
              className="w-full py-2.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all disabled:opacity-30 flex items-center justify-center gap-2"
            >
              <Trash2 className="w-3 h-3" />
              清空该学科全部数据
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={handleDeleteSubjectNodes}
                disabled={subjectFilter === 'all'}
                className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-lg text-[10px] disabled:opacity-30 transition-all"
              >
                删除导图
              </button>
              <button
                onClick={handleDeleteSubjectMistakes}
                disabled={subjectFilter === 'all'}
                className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-lg text-[10px] disabled:opacity-30 transition-all"
              >
                删除错题
              </button>
              <button
                onClick={handleDeleteSubjectTextbooks}
                disabled={subjectFilter === 'all'}
                className="py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 rounded-lg text-[10px] disabled:opacity-30 transition-all"
              >
                删除课本
              </button>
            </div>
          </div>
        </section>

        {/* Deep Scan */}
        <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-rose-500/10 rounded-xl flex items-center justify-center border border-rose-500/20">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white uppercase tracking-widest">深度扫描清理</h4>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">扫描并清理不可见的异常数据</p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>空白/无效记忆:</span>
              <span className={deepScanResults.emptyMemories.length > 0 ? "text-rose-400" : "text-slate-600"}>{deepScanResults.emptyMemories.length}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>无效知识节点:</span>
              <span className={deepScanResults.invalidNodes.length > 0 ? "text-rose-400" : "text-slate-600"}>{deepScanResults.invalidNodes.length}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>循环引用节点:</span>
              <span className={deepScanResults.circularNodes.length > 0 ? "text-rose-400" : "text-slate-600"}>{deepScanResults.circularNodes.length}</span>
            </div>
          </div>
          <button
            onClick={handleDeepCleanup}
            className="w-full py-2.5 bg-rose-600/10 hover:bg-rose-600/20 border border-rose-500/30 text-rose-300 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
          >
            深度清理异常
          </button>
        </section>
      </div>

      {/* ── 危险区域 ── */}
      <section className="bg-slate-900 p-6 rounded-2xl border border-red-900/20 shadow-sm">
        <h3 className="text-sm font-semibold text-red-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Trash2 className="w-4 h-4" />
          危险操作
        </h3>
        <div className="p-4 bg-red-950/20 border border-red-900/30 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-red-400">清空所有本地数据</p>
            <p className="text-xs text-red-500/80 mt-0.5">此操作不可逆，将删除所有记忆、知识图谱和设置。</p>
          </div>
          <button
            onClick={handleClearAllData}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            清空数据
          </button>
        </div>
      </section>

      {/* Custom Modal */}
      {modalConfig.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
                {modalConfig.type === 'confirm' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> : <ShieldAlert className="w-5 h-5 text-indigo-500" />}
                {modalConfig.title}
              </h3>
              <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed">
                {modalConfig.message}
              </p>
            </div>
            <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
              {modalConfig.type === 'confirm' && (
                <button
                  onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
                >
                  取消
                </button>
              )}
              <button
                onClick={() => {
                  if (modalConfig.type === 'confirm' && modalConfig.onConfirm) {
                    modalConfig.onConfirm();
                  }
                  setModalConfig({ ...modalConfig, isOpen: false });
                }}
                className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Layers(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
      <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
    </svg>
  );
}
