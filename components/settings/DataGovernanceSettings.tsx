'use client';

import React, { useState, useMemo } from 'react';
import { clearLocalAppData, useAppContext } from '@/lib/store';
import { Trash2, RefreshCw, AlertTriangle, Sparkles, ShieldAlert, Zap, Loader2, BarChart2, Network } from 'lucide-react';
import {
  buildSubjectGraphImportPlan,
  buildSubjectGraphMigrationPlan,
  getSubjectGraphImportModeLabel,
  getSubjectGraphImportOverview,
  SUBJECT_GRAPH_SEED_VERSION,
  type SubjectGraphImportMode,
} from '@/lib/subject-graph-import';
import { Memory, KnowledgeNode, Subject } from '@/lib/types';
import { v4 as uuidv4 } from 'uuid';

const ALL_SUBJECTS: Subject[] = ['语文', '数学', '英语', '物理', '化学', '生物'];

export default function DataGovernanceSettings() {
  const { state, dispatch } = useAppContext();
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [isGraphImporting, setIsGraphImporting] = useState(false);
  const [graphImportTarget, setGraphImportTarget] = useState<Subject | null>(null);
  const [modalConfig, setModalConfig] = useState<{ isOpen: boolean, title: string, message: string, type: 'alert' | 'confirm', onConfirm?: () => void }>({ isOpen: false, title: '', message: '', type: 'alert' });
  const graphImportOverview = useMemo(() => getSubjectGraphImportOverview(), []);

  const showAlert = (title: string, message: string) => {
    setModalConfig({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  const subjects = ALL_SUBJECTS;

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

  const handleRunInitialSubjectGraphMigration = () => {
    setIsGraphImporting(true);
    try {
      const migrationPlan = buildSubjectGraphMigrationPlan(state.knowledgeNodes);

      if (migrationPlan.nodesToAdd.length > 0) {
        dispatch({ type: 'BATCH_ADD_NODES', payload: migrationPlan.nodesToAdd });
      }

      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'ingestion',
          model: 'subject-graph-seed',
          prompt: `manual subject-graph migration ${migrationPlan.version}`,
          response: `手动执行学科导图初始化迁移：新增 ${migrationPlan.addedCount} 个节点。`,
          subject: state.currentSubject,
          metadata: {
            mode: 'manual_initial_migration',
            version: migrationPlan.version,
            addedCount: migrationPlan.addedCount,
            subjects: migrationPlan.plans.map((plan) => ({
              subject: plan.subject,
              addedCount: plan.addedCount,
              totalSeedNodeCount: plan.totalSeedNodeCount,
              sourceFileName: plan.sourceFileName,
            })),
            missingSubjects: migrationPlan.missingSubjects,
            invalidSources: migrationPlan.invalidSources,
          },
        },
      });

      dispatch({ type: 'SET_SUBJECT_GRAPH_SEED_VERSION', payload: migrationPlan.version });

      const versionHint =
        state.subjectGraphSeedVersion === SUBJECT_GRAPH_SEED_VERSION
          ? '当前版本迁移标记已存在，本次只补齐缺失节点。'
          : '已写入当前版本迁移标记。';
      showAlert(
        '学科导图迁移完成',
        `本次新增 ${migrationPlan.addedCount} 个导图节点。\n\n${versionHint}\n缺失学科：${migrationPlan.missingSubjects.join('、') || '无'}`
      );
    } finally {
      setIsGraphImporting(false);
    }
  };

  const runSubjectGraphImport = (subject: Subject, mode: SubjectGraphImportMode) => {
    setGraphImportTarget(null);
    setIsGraphImporting(true);

    try {
      const importPlan = buildSubjectGraphImportPlan(state.knowledgeNodes, subject, mode);
      if (importPlan.missingSource) {
        showAlert('暂无可用导图源', `【${subject}】当前没有可用的静态导图种子，暂时无法执行导入。`);
        return;
      }

      const existingSubjectNodeCount = state.knowledgeNodes.filter((node) => node.subject === subject).length;
      if (mode === 'rebuild_subject') {
        dispatch({ type: 'DELETE_SUBJECT_NODES', payload: { subject } });
      }
      if (importPlan.nodesToAdd.length > 0) {
        dispatch({ type: 'BATCH_ADD_NODES', payload: importPlan.nodesToAdd });
      }

      dispatch({
        type: 'ADD_LOG',
        payload: {
          type: 'ingestion',
          model: 'subject-graph-seed',
          prompt: `subject-graph import ${subject} ${mode}`,
          response: `学科导图导入完成：${subject} - ${getSubjectGraphImportModeLabel(mode)}，新增 ${importPlan.addedCount} 个节点。`,
          subject,
          metadata: {
            mode,
            modeLabel: getSubjectGraphImportModeLabel(mode),
            subject,
            sourceFileName: importPlan.sourceFileName,
            sourceBankId: importPlan.sourceBankId,
            addedCount: importPlan.addedCount,
            skippedCount: importPlan.skippedCount,
            totalSeedNodeCount: importPlan.totalSeedNodeCount,
            existingSubjectNodeCount,
            skippedReasonCounts: importPlan.skippedReasonCounts,
            invalidSources: importPlan.invalidSources,
          },
        },
      });

      showAlert(
        '学科导图导入完成',
        `【${subject}】已按“${getSubjectGraphImportModeLabel(mode)}”执行导入。\n新增节点：${importPlan.addedCount}\n跳过节点：${importPlan.skippedCount}`
      );
    } finally {
      setIsGraphImporting(false);
    }
  };

  const handlePromptSubjectGraphImport = () => {
    setGraphImportTarget((subjectFilter === 'all' ? state.currentSubject : subjectFilter) as Subject);
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

      <section className="bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-sm space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
              <Network className="h-3.5 w-3.5" />
              学科导图导入
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">静态导图种子识别与迁移</h3>
              <p className="text-sm text-slate-400">
                已识别 {graphImportOverview.availableSubjects.length} 科可导入，语文源缺失；当前跳过 {graphImportOverview.skippedSources.length} 份重复/无效源。
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">迁移版本</p>
            <p className="mt-1 text-sm font-semibold text-white">{state.subjectGraphSeedVersion || '未执行'}</p>
            <p className="mt-1 text-xs text-slate-500">目标版本：{SUBJECT_GRAPH_SEED_VERSION}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">可导入学科</p>
            <p className="mt-2 text-2xl font-black text-white">{graphImportOverview.availableSubjects.length}</p>
            <p className="mt-2 text-xs text-slate-400">{graphImportOverview.availableSubjects.join('、')}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">缺失学科</p>
            <p className="mt-2 text-2xl font-black text-amber-300">{graphImportOverview.missingSubjects.length}</p>
            <p className="mt-2 text-xs text-slate-400">{graphImportOverview.missingSubjects.join('、') || '无'}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">跳过源文件</p>
            <p className="mt-2 text-2xl font-black text-rose-300">{graphImportOverview.skippedSources.length}</p>
            <p className="mt-2 text-xs text-slate-400">
              {graphImportOverview.skippedSources.map((item) => item.fileName).join('、') || '无'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {graphImportOverview.supportedSources.map((source) => (
            <div key={source.fileName} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{source.resolvedSubject}</p>
                  <p className="text-xs text-slate-500">{source.fileName}</p>
                </div>
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
                  可导入
                </span>
              </div>
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">有效节点</p>
                  <p className="mt-1 text-xl font-black text-white">{source.validNodeCount}</p>
                </div>
                <p className="text-xs text-slate-500">bankId: {source.bankId}</p>
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-400">{source.reason}</p>
            </div>
          ))}
          {graphImportOverview.skippedSources.map((source) => (
            <div key={source.fileName} className="rounded-2xl border border-rose-900/30 bg-rose-950/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{source.fileName}</p>
                  <p className="text-xs text-slate-500">不会参与导入</p>
                </div>
                <span className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2.5 py-1 text-[11px] font-semibold text-rose-300">
                  已跳过
                </span>
              </div>
              <p className="mt-4 text-xs leading-5 text-slate-400">{source.reason}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">导入操作</p>
              <p className="text-xs leading-5 text-slate-400">
                初始化迁移始终按“仅补缺”执行；当前学科重跑支持“仅补缺”和“整科重建”。如果上方未选择学科，将默认使用当前学科：{state.currentSubject}。
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleRunInitialSubjectGraphMigration}
                disabled={isGraphImporting}
                className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isGraphImporting ? '处理中...' : '执行初始化迁移'}
              </button>
              <button
                onClick={handlePromptSubjectGraphImport}
                disabled={isGraphImporting}
                className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-2.5 text-sm font-semibold text-indigo-300 transition hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                重跑当前学科导入
              </button>
            </div>
          </div>
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

      {graphImportTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="p-6">
              <h3 className="flex items-center gap-2 text-lg font-bold text-white">
                <Network className="h-5 w-5 text-emerald-400" />
                选择导入模式
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                准备为【{graphImportTarget}】执行导图导入。请选择本次操作模式。
              </p>
              <div className="mt-5 grid gap-3">
                <button
                  onClick={() => runSubjectGraphImport(graphImportTarget, 'fill_missing')}
                  className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-left transition hover:bg-emerald-500/20"
                >
                  <p className="text-sm font-semibold text-emerald-300">仅补缺</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    只补入缺失的稳定 id 节点，不删除你现有的任何导图节点。
                  </p>
                </button>
                <button
                  onClick={() => runSubjectGraphImport(graphImportTarget, 'rebuild_subject')}
                  className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-left transition hover:bg-rose-500/20"
                >
                  <p className="text-sm font-semibold text-rose-300">整科重建</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">
                    先清空该学科当前所有导图节点，再按静态种子完整重建。
                  </p>
                </button>
              </div>
            </div>
            <div className="flex justify-end border-t border-slate-800 bg-slate-950/50 px-6 py-4">
              <button
                onClick={() => setGraphImportTarget(null)}
                className="rounded-xl px-4 py-2 text-sm font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

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
