'use client';

import { useAppContext } from '@/lib/store';
import { Database, Trash2, Edit, Search, FileText, BrainCircuit, Network, HardDrive, CheckSquare, Square, Filter, AlertTriangle, Zap, RefreshCw, Layers, ShieldAlert, Sparkles } from 'lucide-react';
import { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { Subject, Link } from '@/lib/types';
import { calculateMetrics } from '@/lib/fsrs';
import { evaluateMemoryQuality, getGraphIntegrityIssueCount, getGraphIntegrityReport, getMemoryQualityLevel } from '@/lib/data/quality';

export function DataManager() {
  const { state, dispatch } = useAppContext();
  const [activeTab, setActiveTab] = useState<'memories' | 'mistakes' | 'rag' | 'links' | 'textbooks' | 'resources' | 'logs'>('memories');
  const [searchQuery, setSearchQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [logTypeFilter, setLogTypeFilter] = useState<string>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryContent, setEditingMemoryContent] = useState('');
  
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingNodeContent, setEditingNodeContent] = useState('');

  const [showBatchEditModal, setShowBatchEditModal] = useState(false);
  const [batchEditSubject, setBatchEditSubject] = useState<string>('');
  const [batchEditFunctionType, setBatchEditFunctionType] = useState<string>('');

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`确定要删除选中的 ${selectedIds.size} 项数据吗？此操作不可撤销。`)) {
      const ids = Array.from(selectedIds);
      if (activeTab === 'memories' || activeTab === 'mistakes') {
        dispatch({ type: 'BATCH_DELETE_MEMORIES', payload: ids });
      } else if (activeTab === 'rag') {
        dispatch({ type: 'BATCH_DELETE_NODES', payload: ids });
      } else if (activeTab === 'links') {
        ids.forEach(id => dispatch({ type: 'DELETE_LINK', payload: id }));
      } else if (activeTab === 'textbooks') {
        dispatch({ type: 'BATCH_DELETE_TEXTBOOKS', payload: ids });
      } else if (activeTab === 'resources') {
        ids.forEach(id => dispatch({ type: 'DELETE_RESOURCE', payload: id }));
      } else if (activeTab === 'logs') {
        // We don't have a batch delete logs action, but we can add one or just clear all
        alert('暂不支持批量删除日志，请使用清空日志功能。');
      }
      setSelectedIds(new Set());
    }
  };

  const handleExportData = () => {
    let dataToExport: any = [];
    let filename = 'export.json';

    if (selectedIds.size > 0) {
      // Export selected items in current tab
      if (activeTab === 'memories') dataToExport = state.memories.filter(m => !m.isMistake && selectedIds.has(m.id));
      else if (activeTab === 'mistakes') dataToExport = state.memories.filter(m => m.isMistake && selectedIds.has(m.id));
      else if (activeTab === 'rag') dataToExport = state.knowledgeNodes.filter(n => selectedIds.has(n.id));
      else if (activeTab === 'links') dataToExport = (state.links || []).filter(l => selectedIds.has(l.id));
      else if (activeTab === 'textbooks') dataToExport = state.textbooks.filter(t => selectedIds.has(t.id));
      else if (activeTab === 'resources') dataToExport = (state.resources || []).filter(r => selectedIds.has(r.id));
      else if (activeTab === 'logs') dataToExport = state.logs.filter(l => selectedIds.has(l.id));
      filename = `${activeTab}_export.json`;
    } else {
      // Export all data in current tab
      if (activeTab === 'memories') dataToExport = state.memories.filter(m => !m.isMistake);
      else if (activeTab === 'mistakes') dataToExport = state.memories.filter(m => m.isMistake);
      else if (activeTab === 'rag') dataToExport = state.knowledgeNodes;
      else if (activeTab === 'links') dataToExport = state.links || [];
      else if (activeTab === 'textbooks') dataToExport = state.textbooks;
      else if (activeTab === 'resources') dataToExport = state.resources || [];
      else if (activeTab === 'logs') dataToExport = state.logs;
      filename = `all_${activeTab}_export.json`;
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(dataToExport, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", filename);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleExportAll = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "full_backup.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleBatchEditSubmit = () => {
    if (selectedIds.size === 0) return;
    
    if (activeTab === 'memories' || activeTab === 'mistakes') {
      selectedIds.forEach(id => {
        const memory = state.memories.find(m => m.id === id);
        if (memory) {
          const updatedMemory = { ...memory };
          if (batchEditSubject) updatedMemory.subject = batchEditSubject as Subject;
          if (batchEditFunctionType) updatedMemory.functionType = batchEditFunctionType;
          dispatch({ type: 'UPDATE_MEMORY', payload: updatedMemory });
        }
      });
    } else if (activeTab === 'rag') {
      selectedIds.forEach(id => {
        const node = state.knowledgeNodes.find(n => n.id === id);
        if (node) {
          const updatedNode = { ...node };
          if (batchEditSubject) updatedNode.subject = batchEditSubject as Subject;
          dispatch({ type: 'UPDATE_NODE', payload: updatedNode });
        }
      });
    }
    
    setShowBatchEditModal(false);
    setBatchEditSubject('');
    setBatchEditFunctionType('');
    setSelectedIds(new Set());
    alert('批量修改成功！');
  };

  const handleClearCache = () => {
    if (confirm('确定要清空所有 AI 日志缓存吗？此操作不可撤销。')) {
      dispatch({ type: 'CLEAR_LOGS' });
    }
  };

  const handleDeleteDuplicates = () => {
    if (confirm('确定要查找并删除内容完全重复的记忆吗？')) {
      const seen = new Set<string>();
      const duplicateIds: string[] = [];
      state.memories.forEach(m => {
        const key = `${m.subject}:${m.content}`;
        if (seen.has(key)) {
          duplicateIds.push(m.id);
        } else {
          seen.add(key);
        }
      });
      if (duplicateIds.length > 0) {
        dispatch({ type: 'BATCH_DELETE_MEMORIES', payload: duplicateIds });
        alert(`成功删除了 ${duplicateIds.length} 条重复记忆。`);
      } else {
        alert('没有发现重复的记忆。');
      }
    }
  };

  const filteredMemories = useMemo(() => {
    return state.memories.filter(m => 
      !m.isMistake &&
      (subjectFilter === 'all' || m.subject === subjectFilter) && 
      (m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [state.memories, subjectFilter, searchQuery]);

  const filteredMistakes = useMemo(() => {
    return state.memories.filter(m => 
      m.isMistake &&
      (subjectFilter === 'all' || m.subject === subjectFilter) && 
      (m.content.toLowerCase().includes(searchQuery.toLowerCase()) || m.subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [state.memories, subjectFilter, searchQuery]);

  const filteredNodes = useMemo(() => {
    return state.knowledgeNodes.filter(n => 
      (subjectFilter === 'all' || n.subject === subjectFilter) && 
      (n.name.toLowerCase().includes(searchQuery.toLowerCase()) || n.subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [state.knowledgeNodes, subjectFilter, searchQuery]);

  const filteredLinks = useMemo(() => {
    const memoryById = new Map(state.memories.map(memory => [memory.id, memory]));
    const nodeById = new Map(state.knowledgeNodes.map(node => [node.id, node]));
    const textbookById = new Map(state.textbooks.map(textbook => [textbook.id, textbook]));
    const resourceById = new Map((state.resources || []).map(resource => [resource.id, resource]));

    const getEntitySubject = (type: Link['fromType'], id: string) => {
      if (type === 'memory') return memoryById.get(id)?.subject;
      if (type === 'node') return nodeById.get(id)?.subject;
      if (type === 'textbook') return textbookById.get(id)?.subject;
      if (type === 'resource') return resourceById.get(id)?.subject;
      return undefined;
    };

    return (state.links || []).filter(link => {
      const subject = getEntitySubject(link.fromType, link.fromId) || getEntitySubject(link.toType, link.toId);
      if (subjectFilter !== 'all' && subject !== subjectFilter) return false;
      const keyword = `${link.relationType} ${link.fromType} ${link.fromId} ${link.toType} ${link.toId}`.toLowerCase();
      return keyword.includes(searchQuery.toLowerCase());
    });
  }, [
    state.links,
    state.memories,
    state.knowledgeNodes,
    state.textbooks,
    state.resources,
    subjectFilter,
    searchQuery
  ]);

  const filteredTextbooks = useMemo(() => {
    return state.textbooks.filter(t => 
      (subjectFilter === 'all' || t.subject === subjectFilter) && 
      (t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [state.textbooks, subjectFilter, searchQuery]);

  const filteredResources = useMemo(() => {
    return (state.resources || []).filter(r => 
      (subjectFilter === 'all' || r.subject === subjectFilter) && 
      (r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.subject.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [state.resources, subjectFilter, searchQuery]);

  const filteredLogs = useMemo(() => {
    return (state.logs || []).filter(l => 
      (logTypeFilter === 'all' || l.type === logTypeFilter) &&
      (l.prompt.toLowerCase().includes(searchQuery.toLowerCase()) || l.response.toLowerCase().includes(searchQuery.toLowerCase()))
    ).sort((a, b) => b.timestamp - a.timestamp);
  }, [state.logs, logTypeFilter, searchQuery]);

  const subjects = Array.from(new Set([
    ...state.memories.map(m => m.subject),
    ...state.knowledgeNodes.map(n => n.subject),
    ...state.textbooks.map(t => t.subject),
    ...(state.resources || []).map(r => r.subject)
  ]));

  const learningGapInsights = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const subjectNodes = state.knowledgeNodes.filter(n => n.subject === state.currentSubject);
    const subjectMemories = state.memories.filter(m => m.subject === state.currentSubject);
    const links = state.links || [];

    const rankedGaps = subjectNodes.map(node => {
      const linkedMemoryIds = new Set(
        links
          .filter(link =>
            link.relationType === 'memory_node' &&
            link.toType === 'node' &&
            link.toId === node.id &&
            link.fromType === 'memory'
          )
          .map(link => link.fromId)
      );
      const relatedMemories = subjectMemories.filter(memory => linkedMemoryIds.has(memory.id));
      const mistakeCount = relatedMemories.filter(m => m.isMistake).length;
      const overdueCount = relatedMemories.filter(m => (m.fsrs?.due || 0) < now).length;
      const avgConfidence = relatedMemories.length > 0
        ? relatedMemories.reduce((sum, memory) => {
            const metrics = calculateMetrics(memory.fsrs, memory.lastReviewed);
            return sum + metrics.confidence;
          }, 0) / relatedMemories.length
        : 0;
      const weakCount = relatedMemories.filter(memory => {
        const metrics = calculateMetrics(memory.fsrs, memory.lastReviewed);
        return metrics.confidence < 45;
      }).length;
      const textbookEvidenceCount = links.filter(link =>
        link.relationType === 'memory_textbook' &&
        link.fromType === 'memory' &&
        linkedMemoryIds.has(link.fromId)
      ).length;
      const resourceEvidenceCount = links.filter(link =>
        link.relationType === 'memory_resource' &&
        link.fromType === 'memory' &&
        linkedMemoryIds.has(link.fromId)
      ).length;
      const gapScore = (100 - avgConfidence) * 0.5 + mistakeCount * 12 + overdueCount * 8 + (relatedMemories.length === 0 ? 20 : 0);

      return {
        nodeId: node.id,
        nodeName: node.name,
        gapScore,
        avgConfidence: Math.round(avgConfidence),
        weakCount,
        mistakeCount,
        overdueCount,
        coverage: relatedMemories.length,
        textbookEvidenceCount,
        resourceEvidenceCount,
      };
    }).sort((a, b) => b.gapScore - a.gapScore);

    const blindSpots = rankedGaps.filter(item => item.coverage === 0).slice(0, 3);
    return {
      topGaps: rankedGaps.slice(0, 3),
      blindSpots,
    };
  }, [state.currentSubject, state.knowledgeNodes, state.memories, state.links]);

  const resourceOrganizationInsights = useMemo(() => {
    const resources = (state.resources || []).filter(r => r.subject === state.currentSubject);
    const files = resources.filter(r => !r.isFolder);
    const unfiled = files.filter(r => !r.parentId);
    const duplicateNames = new Map<string, number>();
    files.forEach(file => {
      const key = file.name.trim().toLowerCase();
      if (!key) return;
      duplicateNames.set(key, (duplicateNames.get(key) || 0) + 1);
    });
    const duplicateCount = Array.from(duplicateNames.values()).filter(count => count > 1).length;
    const typeSummary = files.reduce<Record<string, number>>((acc, file) => {
      const key = file.type || 'other';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const topTypes = Object.entries(typeSummary).sort((a, b) => b[1] - a[1]).slice(0, 3);

    return {
      totalFiles: files.length,
      unfiledCount: unfiled.length,
      duplicateCount,
      topTypes,
    };
  }, [state.currentSubject, state.resources]);

  const memoryQualityInsights = useMemo(() => {
    const subjectMemories = state.memories.filter((memory) => memory.subject === state.currentSubject);
    const lowQuality: Array<{ id: string; score: number; createdAt: number }> = [];
    let missingNodeLinkCount = 0;
    let missingEvidenceCount = 0;
    let withWarningsCount = 0;
    let qualityScoreSum = 0;

    for (const memory of subjectMemories) {
      const quality = evaluateMemoryQuality(memory);
      qualityScoreSum += quality.score;
      const level = getMemoryQualityLevel(quality.score);
      if (level === 'low') {
        lowQuality.push({ id: memory.id, score: quality.score, createdAt: memory.createdAt || 0 });
      }
      if (quality.flags.length > 0) {
        withWarningsCount += 1;
      }
      if (quality.flags.includes('missing_node_link')) {
        missingNodeLinkCount += 1;
      }
      if (quality.flags.includes('missing_evidence')) {
        missingEvidenceCount += 1;
      }
    }

    const averageScore = subjectMemories.length ? Math.round(qualityScoreSum / subjectMemories.length) : 0;
    lowQuality.sort((a, b) => a.score - b.score || b.createdAt - a.createdAt);

    return {
      total: subjectMemories.length,
      averageScore,
      lowQualityCount: lowQuality.length,
      withWarningsCount,
      missingNodeLinkCount,
      missingEvidenceCount,
      sampleLowQualityIds: lowQuality.slice(0, 5).map((item) => item.id),
    };
  }, [state.currentSubject, state.memories]);

  const graphIntegrityInsights = useMemo(() => {
    const subjectNodes = state.knowledgeNodes.filter((node) => node.subject === state.currentSubject);
    const report = getGraphIntegrityReport(subjectNodes);
    return {
      ...report,
      issueCount: getGraphIntegrityIssueCount(report),
    };
  }, [state.currentSubject, state.knowledgeNodes]);

  const handleSaveMemoryEdit = (id: string) => {
    const memory = state.memories.find(m => m.id === id);
    if (memory) {
      dispatch({ type: 'UPDATE_MEMORY', payload: { ...memory, content: editingMemoryContent } });
    }
    setEditingMemoryId(null);
  };

  const handleDeleteMemory = (id: string) => {
    if (confirm('确定要删除这条记忆吗？')) {
      dispatch({ type: 'DELETE_MEMORY', payload: id });
    }
  };

  const handleSaveNodeEdit = (id: string) => {
    const node = state.knowledgeNodes.find(n => n.id === id);
    if (node) {
      dispatch({ type: 'UPDATE_NODE', payload: { ...node, name: editingNodeContent } });
    }
    setEditingNodeId(null);
  };

  const handleDeleteNode = (id: string) => {
    if (confirm('确定要删除这个知识节点吗？')) {
      dispatch({ type: 'DELETE_NODE', payload: id });
    }
  };

  const handleDeleteTextbook = (id: string) => {
    if (confirm('确定要删除这本课本吗？')) {
      dispatch({ type: 'DELETE_TEXTBOOK', payload: id });
    }
  };

  const getStorageSize = () => {
    try {
      const data = JSON.stringify(state);
      const bytes = new Blob([data]).size;
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    } catch (e) {
      return '未知';
    }
  };

  const handleMassDeleteByFunction = (funcType: string) => {
    if (subjectFilter === 'all') {
      alert('请先选择一个具体学科进行批量删除。');
      return;
    }
    if (confirm(`确定要删除【${subjectFilter}】学科下所有功能为【${funcType}】的记忆点吗？此操作不可撤销。`)) {
      dispatch({ type: 'DELETE_MEMORIES_BY_FUNCTION', payload: { subject: subjectFilter, functionType: funcType } });
    }
  };

  const functionTypes = Array.from(new Set(state.memories.map(m => m.functionType)));

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 md:space-y-8 text-slate-200 bg-black">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tighter mb-2 uppercase flex items-center gap-3">
            <Database className="w-6 h-6 md:w-8 md:h-8 text-indigo-500" />
            数据管理中心
          </h2>
          <p className="text-slate-500 text-xs md:text-sm font-medium uppercase tracking-wider">
            管理所有本地存储的数据，当前总占用: <span className="text-indigo-400">{getStorageSize()}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportAll}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Database className="w-4 h-4" />
            导出全部数据
          </button>
          <button
            onClick={handleDeleteDuplicates}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
          >
            <Layers className="w-4 h-4" />
            清理重复数据
          </button>
          <button
            onClick={handleClearCache}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            清空日志缓存
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">学习漏洞雷达</h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{state.currentSubject}</span>
          </div>
          {learningGapInsights.topGaps.length === 0 ? (
            <p className="text-xs text-slate-500">当前学科暂无可分析的知识节点。</p>
          ) : (
            <div className="space-y-2">
              {learningGapInsights.topGaps.map(gap => (
                <div key={gap.nodeId} className="rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-200 font-medium truncate pr-2">{gap.nodeName}</span>
                    <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Score {Math.round(gap.gapScore)}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    置信度 {gap.avgConfidence}% · 错题 {gap.mistakeCount} · 待复习 {gap.overdueCount} · 低置信 {gap.weakCount} · 课本证据 {gap.textbookEvidenceCount} · 资源证据 {gap.resourceEvidenceCount}
                  </p>
                </div>
              ))}
              {learningGapInsights.blindSpots.length > 0 && (
                <p className="text-[11px] text-amber-400">
                  尚未覆盖节点：{learningGapInsights.blindSpots.map(item => item.nodeName).join('、')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest">资源归档建议</h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">{resourceOrganizationInsights.totalFiles} files</span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">未归档</p>
              <p className="text-lg font-black text-amber-400">{resourceOrganizationInsights.unfiledCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">重名组</p>
              <p className="text-lg font-black text-rose-400">{resourceOrganizationInsights.duplicateCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">总文件</p>
              <p className="text-lg font-black text-indigo-400">{resourceOrganizationInsights.totalFiles}</p>
            </div>
          </div>
          {resourceOrganizationInsights.topTypes.length > 0 ? (
            <p className="text-[11px] text-slate-400">
              主要类型：{resourceOrganizationInsights.topTypes.map(([type, count]) => `${type}(${count})`).join(' · ')}
            </p>
          ) : (
            <p className="text-[11px] text-slate-500">当前学科还没有资源文件。</p>
          )}
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              Data Quality Radar
            </h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Avg {memoryQualityInsights.averageScore}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Low Quality</p>
              <p className="text-lg font-black text-rose-400">{memoryQualityInsights.lowQualityCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Warnings</p>
              <p className="text-lg font-black text-amber-400">{memoryQualityInsights.withWarningsCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Total</p>
              <p className="text-lg font-black text-indigo-400">{memoryQualityInsights.total}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Missing node links: {memoryQualityInsights.missingNodeLinkCount} | Missing evidence:{' '}
            {memoryQualityInsights.missingEvidenceCount}
          </p>
          <button
            onClick={() => {
              setActiveTab('memories');
              setSubjectFilter(state.currentSubject);
              setSelectedIds(new Set(memoryQualityInsights.sampleLowQualityIds));
            }}
            disabled={memoryQualityInsights.sampleLowQualityIds.length === 0}
            className="w-full px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Select Low Quality (Top 5)
          </button>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              Graph Integrity
            </h3>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">
              Issues {graphIntegrityInsights.issueCount}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Cycle</p>
              <p className="text-lg font-black text-rose-400">{graphIntegrityInsights.cycleBreakCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Orphan</p>
              <p className="text-lg font-black text-amber-400">{graphIntegrityInsights.orphanParentCount}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-center">
              <p className="text-[10px] text-slate-500 uppercase">Duplicate</p>
              <p className="text-lg font-black text-indigo-400">{graphIntegrityInsights.duplicateSiblingNameCount}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Cross-subject parent: {graphIntegrityInsights.crossSubjectParentCount} | Self-parent:{' '}
            {graphIntegrityInsights.selfParentCount} | Normalized order: {graphIntegrityInsights.normalizedOrderCount}
          </p>
          <button
            onClick={() => dispatch({ type: 'SET_CORRELATIONS', payload: [...state.knowledgeNodes] })}
            className="w-full px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-widest bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-apply Graph Rules
          </button>
        </div>
      </div>

        <div className="flex gap-4 border-b border-slate-800 pb-4 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => { setActiveTab('memories'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'memories' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <BrainCircuit className="w-4 h-4" />
            记忆库 ({filteredMemories.length})
          </button>
          <button
            onClick={() => { setActiveTab('mistakes'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'mistakes' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <AlertTriangle className="w-4 h-4" />
            错题本 ({filteredMistakes.length})
          </button>
          <button
            onClick={() => { setActiveTab('rag'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'rag' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <Network className="w-4 h-4" />
            知识图谱 ({filteredNodes.length})
          </button>
          <button
            onClick={() => { setActiveTab('links'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'links' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <HardDrive className="w-4 h-4" />
            关联 ({filteredLinks.length})
          </button>
          <button
            onClick={() => { setActiveTab('textbooks'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'textbooks' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <FileText className="w-4 h-4" />
            课本 ({filteredTextbooks.length})
          </button>
          <button
            onClick={() => { setActiveTab('resources'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'resources' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <Database className="w-4 h-4" />
            资源 ({filteredResources.length})
          </button>
          <button
            onClick={() => { setActiveTab('logs'); setSelectedIds(new Set()); }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors shrink-0",
              activeTab === 'logs' ? "bg-indigo-600 text-white" : "bg-slate-900 text-slate-400 hover:bg-slate-800"
            )}
          >
            <Zap className="w-4 h-4" />
            AI 日志 ({filteredLogs.length})
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="搜索数据..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="flex gap-2">
              {activeTab === 'logs' ? (
                <select
                  value={logTypeFilter}
                  onChange={(e) => setLogTypeFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="all">所有类型</option>
                  <option value="parse">解析</option>
                  <option value="chat">对话</option>
                  <option value="graph">图谱</option>
                  <option value="review">复习</option>
                </select>
              ) : (
                <select
                  value={subjectFilter}
                  onChange={(e) => setSubjectFilter(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="all">所有学科</option>
                  {subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              )}
              {selectedIds.size > 0 && (
                <>
                  <button
                    onClick={handleExportData}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    导出 ({selectedIds.size})
                  </button>
                  {(activeTab === 'memories' || activeTab === 'mistakes' || activeTab === 'rag') && (
                    <button
                      onClick={() => setShowBatchEditModal(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                    >
                      <Edit className="w-4 h-4" />
                      批量编辑 ({selectedIds.size})
                    </button>
                  )}
                  <button
                    onClick={handleBatchDelete}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                    批量删除 ({selectedIds.size})
                  </button>
                </>
              )}
              {selectedIds.size === 0 && (
                <button
                  onClick={handleExportData}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                >
                  导出当前板块
                </button>
              )}
              {activeTab === 'memories' && subjectFilter !== 'all' && (
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">按功能删除:</span>
              <div className="flex gap-1 overflow-x-auto max-w-[200px] py-1 no-scrollbar">
                {functionTypes.map(ft => (
                  <button
                    key={ft}
                    onClick={() => handleMassDeleteByFunction(ft)}
                    className="px-2 py-0.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded text-[9px] font-bold whitespace-nowrap transition-colors"
                  >
                    {ft}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
        {activeTab === 'memories' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredMemories.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredMemories.map(m => m.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredMemories.length && filteredMemories.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredMemories.map(m => (
              <div key={m.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex gap-4", selectedIds.has(m.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(m.id)}
                  className="mt-1 text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(m.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0" onClick={() => toggleExpand(m.id)}>
                      <div className="flex items-center gap-2 mb-2 cursor-pointer">
                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-bold uppercase tracking-widest">
                          {m.subject}
                        </span>
                        <span className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      {editingMemoryId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingMemoryContent}
                            onChange={(e) => setEditingMemoryContent(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleSaveMemoryEdit(m.id); }} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">保存</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingMemoryId(null); }} className="px-3 py-1.5 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-600">取消</button>
                          </div>
                        </div>
                      ) : (
                        <p className={clsx("text-sm text-slate-300", !expandedItems.has(m.id) ? "line-clamp-1" : "")}>{m.content}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingMemoryId(m.id);
                          setEditingMemoryContent(m.content);
                        }}
                        className="p-2 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-400/10"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredMemories.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的记忆数据</div>
            )}
          </div>
        )}

        {activeTab === 'mistakes' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredMistakes.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredMistakes.map(m => m.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredMistakes.length && filteredMistakes.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredMistakes.map(m => (
              <div key={m.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex gap-4", selectedIds.has(m.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(m.id)}
                  className="mt-1 text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(m.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0" onClick={() => toggleExpand(m.id)}>
                      <div className="flex items-center gap-2 mb-2 cursor-pointer">
                        <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px] font-bold uppercase tracking-widest">
                          {m.subject} 错题
                        </span>
                        <span className="text-xs text-slate-500">{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                      {editingMemoryId === m.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingMemoryContent}
                            onChange={(e) => setEditingMemoryContent(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <button onClick={(e) => { e.stopPropagation(); handleSaveMemoryEdit(m.id); }} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">保存</button>
                            <button onClick={(e) => { e.stopPropagation(); setEditingMemoryId(null); }} className="px-3 py-1.5 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-600">取消</button>
                          </div>
                        </div>
                      ) : (
                        <div className={clsx("space-y-2", !expandedItems.has(m.id) ? "line-clamp-2" : "")}>
                          <p className="text-sm text-slate-300 font-medium">{m.content}</p>
                          {m.wrongAnswer && <p className="text-xs text-red-400">错误答案: {m.wrongAnswer}</p>}
                          {m.errorReason && <p className="text-xs text-orange-400">错误原因: {m.errorReason}</p>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingMemoryId(m.id);
                          setEditingMemoryContent(m.content);
                        }}
                        className="p-2 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-400/10"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMemory(m.id)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredMistakes.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的错题数据</div>
            )}
          </div>
        )}

        {activeTab === 'rag' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredNodes.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredNodes.map(n => n.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredNodes.length && filteredNodes.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredNodes.map(node => (
              <div key={node.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex gap-4", selectedIds.has(node.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(node.id)}
                  className="mt-1 text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(node.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0" onClick={() => toggleExpand(node.id)}>
                      <div className="flex items-center gap-2 mb-1 cursor-pointer">
                        <span className="px-2 py-0.5 bg-purple-500/10 text-purple-400 rounded text-[10px] font-bold uppercase tracking-widest">
                          {node.subject}
                        </span>
                        <span className="text-xs text-slate-500">ID: {node.id}</span>
                      </div>
                      {editingNodeId === node.id ? (
                        <div className="flex gap-2 mt-2">
                          <input
                            value={editingNodeContent}
                            onChange={(e) => setEditingNodeContent(e.target.value)}
                            className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                          />
                          <button onClick={(e) => { e.stopPropagation(); handleSaveNodeEdit(node.id); }} className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700">保存</button>
                          <button onClick={(e) => { e.stopPropagation(); setEditingNodeId(null); }} className="px-3 py-1.5 bg-slate-700 text-white text-xs font-bold rounded-lg hover:bg-slate-600">取消</button>
                        </div>
                      ) : (
                        <p className={clsx("text-sm font-medium text-slate-200", !expandedItems.has(node.id) ? "truncate" : "")}>{node.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setEditingNodeId(node.id);
                          setEditingNodeContent(node.name);
                        }}
                        className="p-2 text-slate-500 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-400/10"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteNode(node.id)}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {filteredNodes.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的知识节点</div>
            )}
          </div>
        )}

        {activeTab === 'links' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredLinks.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredLinks.map(link => link.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredLinks.length && filteredLinks.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredLinks.map(link => (
              <div key={link.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex gap-4", selectedIds.has(link.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(link.id)}
                  className="mt-1 text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(link.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 rounded text-[10px] font-bold uppercase tracking-widest">
                          {link.relationType}
                        </span>
                        <span className={clsx(
                          "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest",
                          link.isDerived ? "bg-slate-800 text-slate-400" : "bg-emerald-500/10 text-emerald-400"
                        )}>
                          {link.isDerived ? 'derived' : 'manual'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-200 break-all">
                        {link.fromType}:{link.fromId} → {link.toType}:{link.toId}
                      </p>
                    </div>
                    {!link.isDerived && (
                      <button
                        onClick={() => dispatch({ type: 'DELETE_LINK', payload: link.id })}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredLinks.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的关联数据</div>
            )}
          </div>
        )}

        {activeTab === 'textbooks' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredTextbooks.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredTextbooks.map(t => t.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredTextbooks.length && filteredTextbooks.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredTextbooks.map(textbook => (
              <div key={textbook.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex items-center gap-4", selectedIds.has(textbook.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(textbook.id)}
                  className="text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(textbook.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex items-center gap-4 flex-1 min-w-0" onClick={() => toggleExpand(textbook.id)}>
                  <div className="w-10 h-10 bg-cyan-500/10 rounded-xl flex items-center justify-center shrink-0 border border-cyan-500/20">
                    <FileText className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div className="cursor-pointer">
                    <h4 className="text-sm font-bold text-slate-200">{textbook.name}</h4>
                    <p className={clsx("text-xs text-slate-500 mt-1 uppercase tracking-widest", !expandedItems.has(textbook.id) ? "hidden" : "block")}>
                      {textbook.subject} · {textbook.pages.length} 页 · {new Date(textbook.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTextbook(textbook.id)}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {filteredTextbooks.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的课本文件</div>
            )}
          </div>
        )}

        {activeTab === 'resources' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredResources.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredResources.map(r => r.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredResources.length && filteredResources.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredResources.map(resource => (
              <div key={resource.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex items-center gap-4", selectedIds.has(resource.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(resource.id)}
                  className="text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(resource.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex items-center gap-4 flex-1 min-w-0" onClick={() => toggleExpand(resource.id)}>
                  <div className="w-10 h-10 bg-teal-500/10 rounded-xl flex items-center justify-center shrink-0 border border-teal-500/20">
                    <Database className="w-5 h-5 text-teal-400" />
                  </div>
                  <div className="cursor-pointer">
                    <h4 className="text-sm font-bold text-slate-200">{resource.name}</h4>
                    <p className={clsx("text-xs text-slate-500 mt-1 uppercase tracking-widest", !expandedItems.has(resource.id) ? "hidden" : "block")}>
                      {resource.subject} · {resource.isFolder ? '文件夹' : '文件'} · {new Date(resource.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if(confirm('确定要删除这个资源吗？')) {
                      dispatch({ type: 'DELETE_RESOURCE', payload: resource.id });
                    }
                  }}
                  className="p-2 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-red-400/10"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {filteredResources.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的资源</div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="divide-y divide-slate-800 max-h-[60vh] overflow-y-auto custom-scrollbar">
            <div className="p-3 bg-slate-900/80 border-b border-slate-800 flex items-center gap-3 sticky top-0 z-10">
              <button
                onClick={() => {
                  if (selectedIds.size === filteredLogs.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(filteredLogs.map(l => l.id)));
                  }
                }}
                className="text-slate-500 hover:text-white transition-colors"
              >
                {selectedIds.size === filteredLogs.length && filteredLogs.length > 0 ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
              </button>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">全选 / 已选 {selectedIds.size} 项</span>
            </div>
            {filteredLogs.map(log => (
              <div key={log.id} className={clsx("p-4 hover:bg-slate-800/50 transition-colors flex gap-4", selectedIds.has(log.id) && "bg-indigo-500/5")}>
                <button
                  onClick={() => toggleSelect(log.id)}
                  className="mt-1 text-slate-700 hover:text-indigo-500 transition-colors shrink-0"
                >
                  {selectedIds.has(log.id) ? <CheckSquare className="w-5 h-5 text-indigo-500" /> : <Square className="w-5 h-5" />}
                </button>
                <div className="flex-1 min-w-0" onClick={() => toggleExpand(log.id)}>
                  <div className="flex items-center gap-2 mb-2 cursor-pointer">
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded text-[10px] font-bold uppercase tracking-widest">
                      {log.type}
                    </span>
                    <span className="text-xs text-slate-500">{new Date(log.timestamp).toLocaleString()}</span>
                    <span className="text-xs text-slate-600 ml-auto">{log.model}</span>
                  </div>
                  {!expandedItems.has(log.id) ? (
                    <p className="text-sm text-slate-300 line-clamp-1">{log.prompt}</p>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <h5 className="text-xs font-bold text-slate-500 mb-1">Prompt:</h5>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950 p-3 rounded-lg border border-slate-800">{log.prompt}</p>
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-500 mb-1">Response:</h5>
                        <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950 p-3 rounded-lg border border-slate-800">{log.response}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filteredLogs.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm">暂无匹配的日志</div>
            )}
          </div>
        )}
      </div>

      {/* Batch Edit Modal */}
      {showBatchEditModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">批量编辑 ({selectedIds.size} 项)</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">修改学科</label>
                <select
                  value={batchEditSubject}
                  onChange={(e) => setBatchEditSubject(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">不修改</option>
                  {subjects.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {(activeTab === 'memories' || activeTab === 'mistakes') && (
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">修改功能类型</label>
                  <select
                    value={batchEditFunctionType}
                    onChange={(e) => setBatchEditFunctionType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">不修改</option>
                    {functionTypes.map(ft => (
                      <option key={ft} value={ft}>{ft}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowBatchEditModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleBatchEditSubmit}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors"
              >
                确认修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
