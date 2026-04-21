'use client';

import { useEffect, useRef, useState } from 'react';
import { useAppContext } from '../lib/store';
import { adjustKnowledgeGraph, GraphOperation } from '../lib/ai';
import { Loader2, Send, Wand2, X, BrainCircuit, Target, BookOpen, UploadCloud, Check, RotateCcw, AlertCircle, Maximize } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as d3 from 'd3';
import { clsx } from 'clsx';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useGlobalAIChat } from '../lib/ai-chat-context';

export function KnowledgeGraph() {
  const { state, dispatch } = useAppContext();
  const { startGraphAnalysis } = useGlobalAIChat();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const collapsedIds = useRef<Set<string>>(new Set());
  
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editNodeName, setEditNodeName] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'graph' | 'outline'>('graph');
  
  // Use global draft state for preview instead of local state
  const previewResult = state.draftGraphProposal || null;
  const setPreviewResult = (val: any) => {
    dispatch({ type: 'UPDATE_DRAFT', payload: { draftGraphProposal: val } });
  };
  const [isDragging, setIsDragging] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Reset collapsed state and selection when subject changes
  useEffect(() => {
    collapsedIds.current.clear();
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setRenderTrigger(prev => prev + 1);
  }, [state.currentSubject]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return;

    const subjectNodes = state.knowledgeNodes.filter(n => n.subject === state.currentSubject);
    if (subjectNodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    let g = svg.select<SVGGElement>('g.main-group');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'main-group');
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (e) => {
          g.attr('transform', e.transform);
        });
      svg.call(zoom);
      zoomRef.current = zoom;
    }

    g.selectAll('*').remove();

    // Prepare hierarchy for tree layout
    let root: d3.HierarchyNode<any>;
    try {
      const nodeIds = new Set(subjectNodes.map(n => n.id));
      
      if (subjectNodes.length === 0) return;

      // Map missing parents to null (root) to prevent stratification errors
      const safeNodes = subjectNodes.map(n => ({
        ...n,
        parentId: (n.parentId && nodeIds.has(n.parentId)) ? n.parentId : null
      }));

      // Find roots
      const roots = safeNodes.filter(n => !n.parentId);
      
      if (roots.length > 1) {
        // Multiple roots, create a virtual root
        const virtualRoot = { id: 'VIRTUAL_ROOT', name: state.currentSubject, parentId: null, isVirtual: true };
        const treeData = [
          virtualRoot,
          ...safeNodes.map(n => ({
            ...n,
            parentId: n.parentId === null ? 'VIRTUAL_ROOT' : n.parentId
          }))
        ];
        root = d3.stratify<any>()
          .id((d: any) => d.id)
          .parentId((d: any) => d.parentId)
          (treeData);
      } else if (roots.length === 1) {
        root = d3.stratify<any>()
          .id((d: any) => d.id)
          .parentId((d: any) => d.parentId)
          (safeNodes);
      } else {
        return;
      }
      
      // Pre-process children for collapsible state
      root.each((d: any) => {
        if (d.children) {
          d._children = d.children;
        }
      });
      
      root.each((d: any) => {
        if (d.data && d.data.id && collapsedIds.current.has(d.data.id)) {
          d.children = null;
        } else {
          d.children = d._children;
        }
      });
      
    } catch (err) {
      console.error("Stratification failed:", err);
      // If stratification fails, we might have a cycle or other data issue
      g.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('fill', '#ef4444')
        .text('知识图谱数据异常，请在数据管理中修复。');
      return;
    }

    // Tree layout settings
    const nodeWidth = 120;
    const nodeHeight = 40;
    const treeLayout = d3.tree<any>().nodeSize([nodeHeight, nodeWidth + 60]);
    treeLayout(root);

    const nodesData = root.descendants();
    const linksData = root.links();

    // Center the tree initially
    const initialTransform = d3.zoomIdentity.translate(width / 4, height / 2);
    svg.call(zoomRef.current!.transform, initialTransform);
    g.attr('transform', initialTransform.toString());

    // Helper for mastery color
    const getNodeMastery = (nodeId: string) => {
      const mems = state.memories.filter(m => m.knowledgeNodeIds.includes(nodeId));
      if (mems.length === 0) return null;
      const sum = mems.reduce((acc, m) => acc + m.confidence, 0);
      return sum / mems.length;
    };

    const getNodeColor = (mastery: number | null) => {
      if (mastery === null) return '#475569'; // slate-600
      if (mastery < 40) return '#ef4444'; // red-500
      if (mastery < 70) return '#f59e0b'; // amber-500
      return '#22c55e'; // green-500
    };

    // Draw links (using curves for tree)
    const linkGenerator = d3.linkHorizontal<any, any>()
      .x((d: any) => d.y)
      .y((d: any) => d.x);

    g.append('g')
      .attr('class', 'links')
      .selectAll('path')
      .data(linksData)
      .enter()
      .append('path')
      .attr('d', linkGenerator as any)
      .attr('fill', 'none')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0.6);

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodesData)
      .enter()
      .append('g')
      .attr('transform', (d: any) => `translate(${d.y},${d.x})`)
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => {
        event.stopPropagation();
        if (d.data.isVirtual) return;
        setSelectedNodeId(d.data.id);
      })
      .on('dblclick', (event, d: any) => {
        event.stopPropagation();
        if (zoomRef.current && svgRef.current) {
          const currentTransform = d3.zoomTransform(svgRef.current);
          const scale = currentTransform.k;
          d3.select(svgRef.current).transition().duration(750).call(
            zoomRef.current.transform,
            d3.zoomIdentity.translate(width / 2 - d.y * scale, height / 2 - d.x * scale).scale(scale)
          );
        }
      });

    // Node Background Box
    node.append('rect')
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('y', -14)
      .attr('x', -50)
      .attr('width', 100)
      .attr('height', 28)
      .attr('fill', (d: any) => d.data.isVirtual ? '#1e293b' : '#0f172a')
      .attr('stroke', (d: any) => d.data.id === selectedNodeId ? '#3b82f6' : '#334155')
      .attr('stroke-width', (d: any) => d.data.id === selectedNodeId ? 2 : 1)
      .attr('class', 'node-box');

    // Node Mastery Indicator
    node.filter((d: any) => !d.data.isVirtual).append('circle')
      .attr('r', 4)
      .attr('cx', -50)
      .attr('cy', 0)
      .attr('fill', (d: any) => getNodeColor(getNodeMastery(d.data.id)))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5);

    // Text inside the box
    node.append('text')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', (d: any) => d.data.isVirtual ? '#94a3b8' : '#f1f5f9')
      .attr('class', 'text-[10px] font-medium select-none pointer-events-none')
      .text((d: any) => {
        const name = d.data.name;
        return name.length > 8 ? name.substring(0, 7) + '...' : name;
      });

    // Tooltip
    node.append('title')
      .text((d: any) => d.data.name);

    // Expand/Collapse Button
    const toggleBtn = node.filter((d: any) => d._children && d._children.length > 0)
      .append('g')
      .attr('transform', 'translate(50, 0)')
      .style('cursor', 'pointer')
      .on('click', (event, d: any) => {
        event.stopPropagation();
        if (collapsedIds.current.has(d.data.id)) {
          collapsedIds.current.delete(d.data.id);
        } else {
          collapsedIds.current.add(d.data.id);
        }
        setRenderTrigger(prev => prev + 1);
      });

    toggleBtn.append('circle')
      .attr('r', 6)
      .attr('fill', '#1e293b')
      .attr('stroke', '#334155')
      .attr('stroke-width', 1.5)
      .on('mouseover', function() { d3.select(this).attr('stroke', '#3b82f6') })
      .on('mouseout', function() { d3.select(this).attr('stroke', '#334155') });

    toggleBtn.append('text')
      .attr('dy', '0.3em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#94a3b8')
      .attr('class', 'text-[10px] select-none font-bold pointer-events-none')
      .text((d: any) => collapsedIds.current.has(d.data.id) ? '+' : '-');

    // No simulation needed for tree layout

    return () => {
      // Cleanup
    };
  }, [state.knowledgeNodes, state.memories, state.currentSubject, renderTrigger, selectedNodeId]);

  const handleAdjust = async () => {
    if (!command.trim() && !image) return;

    try {
      startGraphAnalysis(
        `指令: ${command}\n当前知识图谱结构: ${JSON.stringify(state.knowledgeNodes.filter(n => n.subject === state.currentSubject))}`, 
        image ? [image] : undefined
      );
      setCommand('');
      setImage(null);
    } catch (error) {
      console.error('Failed to adjust graph:', error);
      alert('调整失败，请检查网络。');
    }
  };

  const handleAutoReorganize = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const subjectNodes = state.knowledgeNodes.filter(n => n.subject === state.currentSubject);
      const { reorganizeKnowledgeGraph } = await import('@/lib/ai');
      const operations = await reorganizeKnowledgeGraph(state.settings, state.currentSubject, subjectNodes);
      
      if (operations.length === 0) {
        alert('图谱结构已经很完善，无需调整。');
        return;
      }

      // Convert to format expected by preview
      const previewOps: GraphOperation[] = operations.map(op => {
        if (op.action === 'add') return { action: 'add', name: op.node.name, parentId: op.node.parentId };
        if (op.action === 'update') return { action: 'rename', nodeId: op.node.id, name: op.node.name };
        if (op.action === 'move') return { action: 'move', nodeId: op.node.id, parentId: op.node.parentId };
        if (op.action === 'delete') return { action: 'delete', nodeId: op.nodeId };
        return null;
      }).filter(Boolean) as GraphOperation[];

      setPreviewResult({
        reasoning: 'AI 自动分析了当前孤立节点和层级关系，并进行了重新组织。',
        operations: previewOps
      });
    } catch (error) {
      console.error('Failed to reorganize graph:', error);
      alert('自动整理失败，请检查网络或API Key配置。');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreview = () => {
    if (!previewResult) return;

    dispatch({ type: 'SAVE_NODES_STATE' });
    const tempIdMap: Record<string, string> = {};

    for (const op of previewResult.operations) {
      if (op.action === 'add') {
        const newId = uuidv4();
        // Ensure parentId is either a temporary ID from this batch or an existing node ID
        let parentId = op.parentId;
        if (parentId && tempIdMap[parentId]) {
          parentId = tempIdMap[parentId];
        } else if (parentId && !state.knowledgeNodes.some(n => n.id === parentId)) {
          // If parentId is not found in existing nodes, it might be a name or invalid ID
          // Try to find by name as a fallback, or set to null
          const foundNode = state.knowledgeNodes.find(n => n.name === parentId && n.subject === state.currentSubject);
          parentId = foundNode ? foundNode.id : null;
        }
        
        const siblings = state.knowledgeNodes.filter(n => n.parentId === parentId && n.subject === state.currentSubject);
        const order = siblings.length + 1;
        
        dispatch({
          type: 'ADD_NODE',
          payload: { id: newId, subject: state.currentSubject, name: op.name, parentId, order }
        });
        
        // Map any potential temporary ID (if AI used one) to the new real UUID
        // AI might use the name as a temporary ID in its response
        tempIdMap[op.name] = newId;
        if (op.nodeId) tempIdMap[op.nodeId] = newId;
      } else if (op.action === 'delete') {
        dispatch({ type: 'DELETE_NODE', payload: op.nodeId });
      } else if (op.action === 'rename') {
        const node = state.knowledgeNodes.find(n => n.id === op.nodeId);
        if (node) {
          dispatch({ type: 'UPDATE_NODE', payload: { ...node, name: op.name } });
        }
      } else if (op.action === 'move') {
        const nodeId = tempIdMap[op.nodeId] || op.nodeId;
        const node = state.knowledgeNodes.find(n => n.id === nodeId);
        if (node) {
          let parentId = op.parentId;
          if (parentId && tempIdMap[parentId]) {
            parentId = tempIdMap[parentId];
          } else if (parentId && !state.knowledgeNodes.some(n => n.id === parentId)) {
            const foundNode = state.knowledgeNodes.find(n => n.name === parentId && n.subject === state.currentSubject);
            parentId = foundNode ? foundNode.id : null;
          }
          dispatch({ type: 'UPDATE_NODE', payload: { ...node, parentId } });
        }
      }
    }
    setPreviewResult(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectedNode = state.knowledgeNodes.find(n => n.id === selectedNodeId);
  const nodeMemories = selectedNode 
    ? state.memories.filter(m => m.knowledgeNodeIds.includes(selectedNode.id))
    : [];
  const nodeMastery = nodeMemories.length > 0 
    ? nodeMemories.reduce((acc, m) => acc + m.confidence, 0) / nodeMemories.length 
    : null;

  const renderOutline = (parentId: string | null, depth: number = 0) => {
    const children = state.knowledgeNodes.filter(n => n.subject === state.currentSubject && n.parentId === parentId);
    return children.map(node => (
      <div key={node.id} style={{ marginLeft: `${depth * 20}px` }} className="group">
        <div className={clsx(
          "flex items-center gap-2 py-1 px-2 rounded hover:bg-slate-800 cursor-pointer",
          selectedNodeId === node.id && "bg-indigo-500/20 text-indigo-400"
        )} onClick={() => setSelectedNodeId(node.id)}>
          <span className="text-slate-500">
            {state.knowledgeNodes.some(n => n.parentId === node.id) ? '▾' : '•'}
          </span>
          {editingNodeId === node.id ? (
            <input
              type="text"
              value={editNodeName}
              onChange={(e) => setEditNodeName(e.target.value)}
              onBlur={() => {
                dispatch({ type: 'UPDATE_NODE', payload: { ...node, name: editNodeName } });
                setEditingNodeId(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              className="flex-1 bg-slate-800 border border-indigo-500/50 rounded px-1 outline-none text-slate-200"
              autoFocus
            />
          ) : (
            <span className="flex-1" onDoubleClick={() => {
              setEditingNodeId(node.id);
              setEditNodeName(node.name);
            }}>{node.name}</span>
          )}
          <button 
            onClick={(e) => {
              e.stopPropagation();
              const name = prompt('输入子节点名称：');
              if (name) {
                const siblings = state.knowledgeNodes.filter(n => n.parentId === node.id && n.subject === state.currentSubject);
                const order = siblings.length + 1;
                dispatch({
                  type: 'ADD_NODE',
                  payload: { id: uuidv4(), subject: state.currentSubject, name, parentId: node.id, order }
                });
              }
            }}
            className="opacity-0 group-hover:opacity-100 text-xs text-indigo-400 hover:underline"
          >
            添加子节点
          </button>
        </div>
        {renderOutline(node.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="p-4 h-full flex flex-col bg-black text-slate-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-indigo-400" />
            {state.currentSubject} 知识图谱
            <span className="text-[10px] font-normal text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">支持拖拽、滚轮缩放、点击折叠</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-800 p-1 rounded-lg">
            {viewMode === 'graph' && (
              <button
                onClick={() => {
                  if (svgRef.current && zoomRef.current) {
                    d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, d3.zoomIdentity);
                  }
                }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-300 transition-colors"
                title="重置缩放和位置"
              >
                <Maximize className="w-3 h-3" />
                重置视图
              </button>
            )}
            {state.lastNodesState && (
              <button
                onClick={() => dispatch({ type: 'UNDO_NODES' })}
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
                title="撤销上次 AI 调整"
              >
                <RotateCcw className="w-3 h-3" />
                撤销调整
              </button>
            )}
            <button
              onClick={() => setViewMode('graph')}
              className={clsx(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                viewMode === 'graph' ? "bg-slate-700 shadow-sm text-indigo-400" : "text-slate-400 hover:text-slate-300"
              )}
            >
              导图视图
            </button>
            <button
              onClick={() => setViewMode('outline')}
              className={clsx(
                "px-3 py-1 text-xs font-medium rounded-md transition-all",
                viewMode === 'outline' ? "bg-slate-700 shadow-sm text-indigo-400" : "text-slate-400 hover:text-slate-300"
              )}
            >
              大纲视图
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex gap-4 overflow-hidden">
        <div 
          ref={containerRef}
          className="flex-1 bg-slate-900 rounded-2xl shadow-sm border border-slate-800 overflow-hidden relative"
        >
          {viewMode === 'graph' ? (
            state.knowledgeNodes.filter(n => n.subject === state.currentSubject).length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/50">
                <BrainCircuit className="w-16 h-16 text-slate-800 mb-4" />
                <p className="text-slate-500 mb-6 text-sm font-medium uppercase tracking-widest">当前科目暂无知识节点</p>
                <button
                  onClick={() => {
                    const name = prompt('输入根节点名称：');
                    if (name) {
                      dispatch({
                        type: 'ADD_NODE',
                        payload: { id: uuidv4(), subject: state.currentSubject, name, parentId: null, order: 1 }
                      });
                    }
                  }}
                  className="px-6 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 rounded-xl text-xs font-bold uppercase tracking-widest transition-all"
                >
                  + 添加根节点
                </button>
              </div>
            ) : (
              <svg ref={svgRef} className="w-full h-full cursor-grab active:cursor-grabbing"></svg>
            )
          ) : (
            <div className="w-full h-full overflow-y-auto p-6">
              {renderOutline(null)}
              <button
                onClick={() => {
                  const name = prompt('输入根节点名称：');
                  if (name) {
                    const siblings = state.knowledgeNodes.filter(n => n.parentId === null && n.subject === state.currentSubject);
                    const order = siblings.length + 1;
                    dispatch({
                      type: 'ADD_NODE',
                      payload: { id: uuidv4(), subject: state.currentSubject, name, parentId: null, order }
                    });
                  }
                }}
                className="mt-4 text-sm text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1"
              >
                + 添加根节点
              </button>
            </div>
          )}
          
          {/* AI Adjustment Bar */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10">
            {previewResult ? (
              <div className="bg-slate-900/95 backdrop-blur-md border-2 border-purple-900/50 shadow-xl rounded-xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-purple-400 font-semibold">
                    <Wand2 className="w-4 h-4" />
                    AI 调整预览
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewResult(null)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      放弃
                    </button>
                    <button
                      onClick={handleApplyPreview}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg shadow-sm transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      应用修改
                    </button>
                  </div>
                </div>
                
                <div className="text-sm text-slate-300 bg-purple-950/30 p-3 rounded-lg border border-purple-900/30">
                  <span className="font-semibold text-purple-400">修改逻辑：</span>
                  {previewResult.reasoning}
                </div>

                <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                  {previewResult.operations.map((op, idx) => (
                    <div key={idx} className="text-xs flex items-center gap-2 py-1 border-b border-slate-800 last:border-0">
                      <span className={clsx(
                        "px-1.5 py-0.5 rounded font-medium",
                        op.action === 'add' ? "bg-green-900/50 text-green-400" :
                        op.action === 'delete' ? "bg-red-900/50 text-red-400" :
                        op.action === 'rename' ? "bg-blue-900/50 text-blue-400" :
                        "bg-amber-900/50 text-amber-400"
                      )}>
                        {op.action === 'add' ? '添加' : op.action === 'delete' ? '删除' : op.action === 'rename' ? '重命名' : '移动'}
                      </span>
                      <span className="text-slate-400">
                        {op.action === 'add' ? `节点 "${op.name}"` : 
                         op.action === 'delete' ? `节点 ID: ${op.nodeId}` :
                         op.action === 'rename' ? `节点 ID: ${op.nodeId} -> "${op.name}"` :
                         `节点 ID: ${op.nodeId} 移动到父节点 ID: ${op.parentId}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={clsx(
                  "bg-slate-900/90 backdrop-blur-md border shadow-lg rounded-xl p-2 flex flex-col gap-2 transition-all duration-200",
                  isDragging ? "border-purple-500 bg-purple-900/20 scale-105" : "border-slate-800"
                )}
              >
                {image && (
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700 ml-10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="Preview" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setImage(null)}
                      className="absolute top-1 right-1 bg-black/50 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs"
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-purple-900/50 flex items-center justify-center shrink-0">
                    <Wand2 className="w-4 h-4 text-purple-400" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-400 hover:text-purple-400 transition-colors"
                    title="上传结构图 (支持拖拽)"
                  >
                    <UploadCloud className="w-5 h-5" />
                  </button>
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdjust()}
                    placeholder={isDragging ? "松开鼠标以上传图片..." : "AI 助手：输入指令或上传结构图调整图谱..."}
                    className="flex-1 bg-transparent border-none outline-none text-sm text-slate-200 placeholder:text-slate-500"
                  />
                  <button
                    onClick={handleAdjust}
                    disabled={(!command.trim() && !image) || loading}
                    className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Side Panel for Selected Node */}
        {selectedNode && (
          <div className="w-80 bg-slate-900 rounded-2xl shadow-sm border border-slate-800 flex flex-col overflow-hidden shrink-0">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
              {editingNodeId === selectedNode.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editNodeName}
                    onChange={(e) => setEditNodeName(e.target.value)}
                    className="flex-1 p-1.5 text-sm border border-slate-700 bg-slate-800 text-slate-200 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      dispatch({ type: 'UPDATE_NODE', payload: { ...selectedNode, name: editNodeName } });
                      setEditingNodeId(null);
                    }}
                    className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingNodeId(null)}
                    className="text-xs px-2 py-1 bg-slate-800 text-slate-400 rounded hover:bg-slate-700"
                  >
                    取消
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-slate-200 flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-500" />
                    {selectedNode.name}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingNodeId(selectedNode.id);
                        setEditNodeName(selectedNode.name);
                      }}
                      className="text-slate-500 hover:text-blue-400"
                      title="编辑节点名称"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    </button>
                    {selectedNode.parentId !== null && (
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: '删除节点',
                            message: '确定要删除此节点吗？相关的记忆将失去此节点的关联。',
                            onConfirm: () => {
                              dispatch({ type: 'DELETE_NODE', payload: selectedNode.id });
                              setSelectedNodeId(null);
                              setConfirmModal(null);
                            }
                          });
                        }}
                        className="text-slate-500 hover:text-red-400"
                        title="删除节点"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                      </button>
                    )}
                    <button onClick={() => setSelectedNodeId(null)} className="text-slate-500 hover:text-slate-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
            
            <div className="p-4 border-b border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-400">知识掌握度</span>
                <span className={clsx(
                  "text-sm font-bold",
                  nodeMastery === null ? "text-slate-500" :
                  nodeMastery < 40 ? "text-red-400" :
                  nodeMastery < 70 ? "text-amber-400" : "text-green-400"
                )}>
                  {nodeMastery === null ? '暂无数据' : `${Math.round(nodeMastery)}%`}
                </span>
              </div>
              {nodeMastery !== null && (
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden mb-4 border border-slate-700">
                  <div 
                    className={clsx(
                      "h-full transition-all duration-500",
                      nodeMastery < 40 ? "bg-red-500" :
                      nodeMastery < 70 ? "bg-amber-500" : "bg-green-500"
                    )}
                    style={{ width: `${nodeMastery}%` }}
                  />
                </div>
              )}
              {selectedNode.testingMethods && selectedNode.testingMethods.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">常见考法</h4>
                  <ul className="space-y-1">
                    {selectedNode.testingMethods.map((method, idx) => (
                      <li key={idx} className="text-xs text-slate-400 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50">
                        • {method}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <BookOpen className="w-3 h-3" />
                关联记忆 ({nodeMemories.length})
              </h4>
              <div className="space-y-3">
                {nodeMemories.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">暂无关联记忆</p>
                ) : (
                  nodeMemories.map(m => (
                    <div key={m.id} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50 text-sm">
                      <div className="text-slate-300 line-clamp-3 mb-2 prose prose-invert prose-sm max-w-none">
                        <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.content}</Markdown>
                      </div>
                      {m.analysisProcess && (
                        <div className="mt-2 p-2 bg-blue-900/20 border border-blue-800/50 rounded text-xs text-blue-300 whitespace-pre-wrap leading-relaxed mb-2 prose prose-invert prose-sm max-w-none">
                          <span className="font-semibold text-blue-400">AI 分析：</span>
                          <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{m.analysisProcess}</Markdown>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs mt-2">
                        <span className={clsx(
                          "px-2 py-0.5 rounded-full font-medium",
                          m.isMistake ? "bg-red-900/30 text-red-400 border border-red-800/50" : "bg-blue-900/30 text-blue-400 border border-blue-800/50"
                        )}>
                          {m.isMistake ? '错题' : m.functionType}
                        </span>
                        <span className="text-slate-400 font-medium">{Math.round(m.confidence)}% 掌握</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {confirmModal && confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-slate-200 mb-2">{confirmModal.title}</h3>
            <p className="text-sm text-slate-400 mb-6">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
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
