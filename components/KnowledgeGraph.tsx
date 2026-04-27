'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../lib/store';
import { GraphOperation, inferModelProvider, resolveAIPresetSettings } from '../lib/ai';
import { buildGraphRenderPlan, DEFAULT_GRAPH_MAX_VISIBLE_NODES, getGraphViewStateForSubject } from '../lib/graph-view';
import { Loader2, Send, Wand2, X, BrainCircuit, Target, BookOpen, UploadCloud, Check, RotateCcw, AlertCircle, Maximize, GitBranch, Link2, Brain, MessageSquare, ThumbsUp, ThumbsDown } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import * as d3 from 'd3';
import { clsx } from 'clsx';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { useGlobalAIChat } from '../lib/ai-chat-context';
import { FEEDBACK_QUICK_TAGS } from '../lib/feedback';
import { buildKnowledgeNodePath, collectDescendantNodeIds, formatKnowledgeNodePath, getKnowledgeNodeMastery, getRelatedKnowledgeNodes, GRAPH_NODE_KIND_LABELS } from '../lib/data/quality';
import type { GraphViewMode, GraphViewportTransform, SubjectGraphViewState } from '../lib/types';

export function KnowledgeGraph() {
  const { state, dispatch } = useAppContext();
  const { startGraphAnalysis } = useGlobalAIChat();
  const effectiveSettings = useMemo(() => resolveAIPresetSettings(state.settings), [state.settings]);
  const subjectNodes = useMemo(
    () => state.knowledgeNodes.filter((node) => node.subject === state.currentSubject),
    [state.currentSubject, state.knowledgeNodes]
  );
  const subjectMemories = useMemo(
    () => state.memories.filter((memory) => memory.subject === state.currentSubject),
    [state.currentSubject, state.memories]
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const collapsedIds = useRef<Set<string>>(new Set());
  const latestViewportRef = useRef<GraphViewportTransform | null>(null);
  const persistedViewportRef = useRef<GraphViewportTransform | null>(null);
  const restoreViewportRef = useRef(true);
  const fitToAnchorRef = useRef(false);
  const viewportPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedSubjectRef = useRef<string | null>(null);
  const lastFocusedNodeRef = useRef<string | null>(null);
  
  const [command, setCommand] = useState('');
  const [loading, setLoading] = useState(false);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editNodeName, setEditNodeName] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [previewFeedback, setPreviewFeedback] = useState<{ sentiment: 'positive' | 'negative'; tag?: string } | null>(null);
  const subjectGraphView = useMemo(
    () => getGraphViewStateForSubject(state.graphViewBySubject, state.currentSubject, subjectNodes),
    [state.currentSubject, state.graphViewBySubject, subjectNodes]
  );
  const [viewMode, setViewMode] = useState<GraphViewMode>(subjectGraphView.viewMode);
  const selectedNodeId =
    state.activeGraphScope?.subject === state.currentSubject ? state.activeGraphScope.nodeId : null;
  
  // Use global draft state for preview instead of local state
  const previewResult = state.draftGraphProposal || null;
  const setPreviewResult = (val: any) => {
    dispatch({ type: 'UPDATE_DRAFT', payload: { draftGraphProposal: val } });
    setPreviewFeedback(null);
  };
  const [isDragging, setIsDragging] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scopeDefaultsRef = useRef({
    includeDescendants: state.activeGraphScope?.includeDescendants ?? true,
    includeRelated: state.activeGraphScope?.includeRelated ?? false,
  });

  useEffect(() => {
    scopeDefaultsRef.current = {
      includeDescendants: state.activeGraphScope?.includeDescendants ?? true,
      includeRelated: state.activeGraphScope?.includeRelated ?? false,
    };
  }, [state.activeGraphScope?.includeDescendants, state.activeGraphScope?.includeRelated]);

  const persistSubjectGraphView = useCallback((patch: Partial<SubjectGraphViewState>) => {
    dispatch({
      type: 'UPDATE_SUBJECT_GRAPH_VIEW',
      payload: {
        subject: state.currentSubject,
        patch,
      },
    });
  }, [dispatch, state.currentSubject]);

  const persistViewport = useCallback((transform: d3.ZoomTransform | GraphViewportTransform | null) => {
    if (!transform) return;
    const viewport = 'apply' in transform
      ? { x: transform.x, y: transform.y, k: transform.k }
      : transform;
    latestViewportRef.current = viewport;
    if (viewportPersistTimerRef.current) {
      clearTimeout(viewportPersistTimerRef.current);
    }
    viewportPersistTimerRef.current = setTimeout(() => {
      persistSubjectGraphView({ viewport });
    }, 180);
  }, [persistSubjectGraphView]);

  useEffect(() => {
    return () => {
      if (viewportPersistTimerRef.current) {
        clearTimeout(viewportPersistTimerRef.current);
      }
    };
  }, []);

  const selectGraphNode = useCallback((nodeId: string | null, overrides?: { includeDescendants?: boolean; includeRelated?: boolean }) => {
    const defaults = scopeDefaultsRef.current;
    dispatch({
      type: 'SET_ACTIVE_GRAPH_SCOPE',
      payload: {
        nodeId,
        subject: state.currentSubject,
        includeDescendants: overrides?.includeDescendants ?? defaults.includeDescendants,
        includeRelated: overrides?.includeRelated ?? defaults.includeRelated,
      },
    });
  }, [dispatch, state.currentSubject]);

  const sendScopeQuestionToChat = () => {
    if (!selectedNodeId) return;
    const path = formatKnowledgeNodePath(subjectNodes, selectedNodeId);
    dispatch({
      type: 'UPDATE_DRAFT',
      payload: {
        draftChatQuery: `请围绕导图节点“${path}”进行讲解：梳理核心知识点、常见题型、易错点，以及对应的解题方法。优先结合当前节点与子树中的记忆来回答。`,
      },
    });
    window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'chat' } }));
  };

  const recordPreviewFeedback = (sentiment: 'positive' | 'negative', feedbackTag?: string) => {
    if (!previewResult) return;
    dispatch({
      type: 'ADD_FEEDBACK_EVENT',
      payload: {
        id: uuidv4(),
        timestamp: Date.now(),
        subject: state.currentSubject,
        targetType: 'graph',
        targetId: `graph-preview:${selectedNodeId || 'global'}`,
        signalType: sentiment === 'positive' ? 'graph_helpful' : 'graph_inaccurate',
        sentiment,
        note: sentiment === 'positive' ? '导图建议有帮助' : '导图建议需要调整',
        metadata: {
          workflow: 'graph-preview',
          preset: effectiveSettings.aiPreset || 'balanced',
          provider: inferModelProvider(effectiveSettings.graphModel, state.settings),
          model: effectiveSettings.graphModel,
          graphScopeNodeId: selectedNodeId,
          graphScopePath: selectedNodeId ? formatKnowledgeNodePath(subjectNodes, selectedNodeId) : null,
          feedbackTag,
        },
      },
    });
    setPreviewFeedback({ sentiment, tag: feedbackTag });
  };

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

  const nodeMasteryMap = useMemo(() => {
    const bucket = new Map<string, { sum: number; count: number }>();
    for (const memory of subjectMemories) {
      for (const nodeId of memory.knowledgeNodeIds || []) {
        const existing = bucket.get(nodeId) || { sum: 0, count: 0 };
        existing.sum += memory.confidence;
        existing.count += 1;
        bucket.set(nodeId, existing);
      }
    }

    const masteryMap = new Map<string, number | null>();
    for (const node of subjectNodes) {
      const value = bucket.get(node.id);
      masteryMap.set(node.id, value ? value.sum / value.count : null);
    }
    return masteryMap;
  }, [subjectMemories, subjectNodes]);

  const subjectChildrenByParent = useMemo(() => {
    const childrenByParent = new Map<string | null, typeof subjectNodes>();
    for (const node of subjectNodes) {
      const key = node.parentId;
      const existing = childrenByParent.get(key);
      if (existing) {
        existing.push(node);
      } else {
        childrenByParent.set(key, [node]);
      }
    }
    for (const group of childrenByParent.values()) {
      group.sort((left, right) => left.order - right.order);
    }
    return childrenByParent;
  }, [subjectNodes]);

  const graphRenderPlan = useMemo(
    () => {
      void renderTrigger;
      return buildGraphRenderPlan(subjectNodes, {
        focusNodeId: selectedNodeId || subjectGraphView.focusNodeId,
        collapsedNodeIds: Array.from(collapsedIds.current),
        maxVisibleNodes: DEFAULT_GRAPH_MAX_VISIBLE_NODES,
      });
    },
    [renderTrigger, selectedNodeId, subjectGraphView.focusNodeId, subjectNodes]
  );
  const effectiveCollapsedSet = useMemo(
    () => new Set(graphRenderPlan.effectiveCollapsedIds),
    [graphRenderPlan.effectiveCollapsedIds]
  );
  const visibleNodesById = useMemo(
    () => new Map(graphRenderPlan.visibleNodes.map((node) => [node.id, node])),
    [graphRenderPlan.visibleNodes]
  );
  const visibleChildrenByParent = useMemo(() => {
    const childrenByParent = new Map<string | null, typeof graphRenderPlan.visibleNodes>();
    for (const node of graphRenderPlan.visibleNodes) {
      const parentId = node.parentId && visibleNodesById.has(node.parentId) ? node.parentId : null;
      const current = childrenByParent.get(parentId);
      if (current) {
        current.push(node);
      } else {
        childrenByParent.set(parentId, [node]);
      }
    }
    for (const children of childrenByParent.values()) {
      children.sort((left, right) => left.order - right.order);
    }
    return childrenByParent;
  }, [graphRenderPlan, visibleNodesById]);
  const graphAnchorNodeId = graphRenderPlan.anchorNodeId;
  const focusPathIds = useMemo(
    () => new Set(buildKnowledgeNodePath(subjectNodes, graphAnchorNodeId).map((node) => node.id)),
    [graphAnchorNodeId, subjectNodes]
  );

  // Restore per-subject graph view when subject changes
  useEffect(() => {
    if (hydratedSubjectRef.current === state.currentSubject) return;
    hydratedSubjectRef.current = state.currentSubject;
    collapsedIds.current = new Set(subjectGraphView.collapsedNodeIds);
    latestViewportRef.current = subjectGraphView.viewport || null;
    persistedViewportRef.current = subjectGraphView.viewport || null;
    restoreViewportRef.current = true;
    fitToAnchorRef.current = false;
    lastFocusedNodeRef.current = subjectGraphView.focusNodeId;
    setViewMode(subjectGraphView.viewMode);
    selectGraphNode(subjectGraphView.focusNodeId, {
      includeDescendants: subjectGraphView.includeDescendants,
      includeRelated: subjectGraphView.includeRelated,
    });
    setEditingNodeId(null);
    setRenderTrigger(prev => prev + 1);
  }, [
    selectGraphNode,
    state.currentSubject,
    subjectGraphView.collapsedNodeIds,
    subjectGraphView.focusNodeId,
    subjectGraphView.includeDescendants,
    subjectGraphView.includeRelated,
    subjectGraphView.viewMode,
    subjectGraphView.viewport,
  ]);

  useEffect(() => {
    if (lastFocusedNodeRef.current === null) {
      lastFocusedNodeRef.current = selectedNodeId;
      return;
    }
    if (lastFocusedNodeRef.current === selectedNodeId) return;
    lastFocusedNodeRef.current = selectedNodeId;
    fitToAnchorRef.current = true;
  }, [selectedNodeId]);

  useEffect(() => {
    persistedViewportRef.current = subjectGraphView.viewport || null;
  }, [subjectGraphView.viewport]);

  const toggleCollapsedNode = useCallback((nodeId: string) => {
    const nextCollapsed = new Set(collapsedIds.current);
    if (nextCollapsed.has(nodeId)) nextCollapsed.delete(nodeId);
    else nextCollapsed.add(nodeId);
    collapsedIds.current = nextCollapsed;
    persistSubjectGraphView({
      collapsedNodeIds: Array.from(nextCollapsed),
      viewport: latestViewportRef.current,
    });
    setRenderTrigger((prev) => prev + 1);
  }, [persistSubjectGraphView]);

  useEffect(() => {
    if (viewMode !== 'graph') return;
    if (!svgRef.current || !containerRef.current) return;
    if (graphRenderPlan.visibleNodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height);

    const currentTransform = latestViewportRef.current;

    let g = svg.select<SVGGElement>('g.main-group');
    if (g.empty()) {
      g = svg.append('g').attr('class', 'main-group');
      g.append('g').attr('class', 'links');
      g.append('g').attr('class', 'nodes');
      g.append('g').attr('class', 'errors');
      const zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.1, 4])
        .on('zoom', (e) => {
          g.attr('transform', e.transform);
          persistViewport(e.transform);
        });
      svg.call(zoom);
      zoomRef.current = zoom;
    }
    const linksLayer = g.select<SVGGElement>('g.links');
    const nodesLayer = g.select<SVGGElement>('g.nodes');
    const errorsLayer = g.select<SVGGElement>('g.errors');
    errorsLayer.selectAll('*').remove();

    // Prepare hierarchy for tree layout
    let root: d3.HierarchyNode<any>;
    try {
      const nodeIds = new Set(graphRenderPlan.visibleNodes.map(n => n.id));
      
      if (graphRenderPlan.visibleNodes.length === 0) return;

      // Map missing parents to null (root) to prevent stratification errors
      const safeNodes = graphRenderPlan.visibleNodes.map(n => ({
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
    } catch (err) {
      console.error("Stratification failed:", err);
      // If stratification fails, we might have a cycle or other data issue
      errorsLayer.append('text')
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

    const getNodeColor = (mastery: number | null) => {
      if (mastery === null) return '#475569';
      if (mastery < 40) return '#ef4444';
      if (mastery < 70) return '#f59e0b';
      return '#22c55e';
    };
    const anchorRootId = graphRenderPlan.anchorNodeId
      ? buildKnowledgeNodePath(subjectNodes, graphRenderPlan.anchorNodeId)[0]?.id || null
      : null;
    const getNodeOpacity = (nodeId: string) => {
      if (nodeId === selectedNodeId || focusPathIds.has(nodeId)) return 1;
      const nodeRootId = buildKnowledgeNodePath(subjectNodes, nodeId)[0]?.id || null;
      return nodeRootId && nodeRootId === anchorRootId ? 0.82 : 0.56;
    };

    const linkGenerator = d3.linkHorizontal<any, any>()
      .x((item: any) => item.y)
      .y((item: any) => item.x);

    const linkSelection = linksLayer
      .selectAll<SVGPathElement, any>('path.graph-link')
      .data(linksData, (item: any) => `${item.source.data.id}->${item.target.data.id}`);

    linkSelection
      .exit()
      .transition()
      .duration(180)
      .attr('opacity', 0)
      .remove();

    const linkEnter = linkSelection
      .enter()
      .append('path')
      .attr('class', 'graph-link')
      .attr('fill', 'none')
      .attr('stroke-width', 1.5)
      .attr('opacity', 0);

    linkEnter
      .merge(linkSelection as any)
      .transition()
      .duration(220)
      .attr('d', linkGenerator as any)
      .attr('stroke', (item: any) => {
        const sourceId = item.source.data?.id;
        const targetId = item.target.data?.id;
        return focusPathIds.has(sourceId) && focusPathIds.has(targetId) ? '#6366f1' : '#334155';
      })
      .attr('opacity', (item: any) => {
        const sourceId = item.source.data?.id;
        const targetId = item.target.data?.id;
        return focusPathIds.has(sourceId) && focusPathIds.has(targetId) ? 0.9 : 0.35;
      });

    const nodeSelection = nodesLayer
      .selectAll<SVGGElement, any>('g.graph-node')
      .data(nodesData, (item: any) => item.data.id);

    nodeSelection
      .exit()
      .transition()
      .duration(180)
      .attr('opacity', 0)
      .remove();

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'graph-node')
      .attr('opacity', 0)
      .attr('transform', (item: any) => `translate(${item.y},${item.x})`);

    nodeEnter.append('rect').attr('class', 'node-box');
    nodeEnter.append('circle').attr('class', 'node-indicator');
    nodeEnter.append('text').attr('class', 'node-label');
    nodeEnter.append('title');
    const toggleEnter = nodeEnter.append('g').attr('class', 'node-toggle');
    toggleEnter.append('circle').attr('class', 'toggle-circle');
    toggleEnter.append('text').attr('class', 'toggle-symbol');
    toggleEnter.append('text').attr('class', 'toggle-count');

    const nodeMerge = nodeEnter.merge(nodeSelection as any);

    nodeMerge
      .style('cursor', 'pointer')
      .on('click', (event, item: any) => {
        event.stopPropagation();
        if (item.data.isVirtual) return;
        selectGraphNode(item.data.id);
      })
      .on('dblclick', (event, item: any) => {
        event.stopPropagation();
        if (!zoomRef.current || !svgRef.current) return;
        const transform = d3.zoomTransform(svgRef.current);
        const scale = transform.k;
        d3.select(svgRef.current).transition().duration(320).call(
          zoomRef.current.transform,
          d3.zoomIdentity.translate(width / 2 - item.y * scale, height / 2 - item.x * scale).scale(scale)
        );
      })
      .transition()
      .duration(220)
      .attr('opacity', 1)
      .attr('transform', (item: any) => `translate(${item.y},${item.x})`);

    nodeMerge
      .select<SVGRectElement>('rect.node-box')
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('y', -14)
      .attr('x', -56)
      .attr('width', 112)
      .attr('height', 28)
      .attr('fill', (item: any) => item.data.isVirtual ? '#1e293b' : '#0f172a')
      .attr('stroke', (item: any) => {
        if (item.data.id === selectedNodeId) return '#3b82f6';
        if (focusPathIds.has(item.data.id)) return '#6366f1';
        return '#334155';
      })
      .attr('stroke-width', (item: any) => item.data.id === selectedNodeId ? 2.2 : focusPathIds.has(item.data.id) ? 1.4 : 1)
      .attr('opacity', (item: any) => getNodeOpacity(item.data.id));

    nodeMerge
      .select<SVGCircleElement>('circle.node-indicator')
      .attr('r', 4)
      .attr('cx', -56)
      .attr('cy', 0)
      .attr('fill', (item: any) => item.data.isVirtual ? '#64748b' : getNodeColor(nodeMasteryMap.get(item.data.id) ?? null))
      .attr('stroke', '#0f172a')
      .attr('stroke-width', 1.5)
      .attr('opacity', (item: any) => item.data.isVirtual ? 0 : 1);

    nodeMerge
      .select<SVGTextElement>('text.node-label')
      .attr('dy', '.35em')
      .attr('text-anchor', 'middle')
      .attr('fill', (item: any) => item.data.isVirtual ? '#94a3b8' : '#f1f5f9')
      .attr('class', 'node-label text-[10px] font-medium select-none pointer-events-none')
      .attr('opacity', (item: any) => getNodeOpacity(item.data.id))
      .text((item: any) => {
        const name = item.data.name;
        return name.length > 8 ? name.substring(0, 7) + '...' : name;
      });

    nodeMerge.select('title').text((item: any) => item.data.name);

    const toggleMerge = nodeMerge
      .select<SVGGElement>('g.node-toggle')
      .attr('transform', 'translate(50, 0)')
      .style('cursor', 'pointer')
      .style('display', (item: any) => {
        const childCount = subjectChildrenByParent.get(item.data.id)?.length || 0;
        const hiddenCount = graphRenderPlan.collapsedSummaryByNodeId[item.data.id]?.hiddenDescendantCount || 0;
        return !item.data.isVirtual && (childCount > 0 || hiddenCount > 0) ? null : 'none';
      })
      .on('click', (event, item: any) => {
        event.stopPropagation();
        if (item.data.isVirtual) return;
        toggleCollapsedNode(item.data.id);
      });

    toggleMerge
      .select<SVGCircleElement>('circle.toggle-circle')
      .attr('r', 7)
      .attr('fill', '#1e293b')
      .attr('stroke', (item: any) => focusPathIds.has(item.data.id) ? '#6366f1' : '#334155')
      .attr('stroke-width', 1.4);

    toggleMerge
      .select<SVGTextElement>('text.toggle-symbol')
      .attr('dy', '0.3em')
      .attr('text-anchor', 'middle')
      .attr('fill', '#cbd5e1')
      .attr('class', 'toggle-symbol text-[10px] select-none font-bold pointer-events-none')
      .text((item: any) => effectiveCollapsedSet.has(item.data.id) ? '+' : '-');

    toggleMerge
      .select<SVGTextElement>('text.toggle-count')
      .attr('x', 12)
      .attr('y', 4)
      .attr('fill', '#94a3b8')
      .attr('class', 'toggle-count text-[9px] font-semibold pointer-events-none')
      .text((item: any) => {
        const hiddenCount = graphRenderPlan.collapsedSummaryByNodeId[item.data.id]?.hiddenDescendantCount || 0;
        return hiddenCount > 0 ? `${hiddenCount}` : '';
      });

    const getSmartTransform = () => {
      const preferredFocusNodeId = graphRenderPlan.preferredFocusNodeId;
      const focusNode = preferredFocusNodeId
        ? nodesData.find((node: any) => !node.data?.isVirtual && node.data.id === preferredFocusNodeId)
        : null;

      if (focusNode) {
        const scale = nodesData.length <= 36 ? 1 : nodesData.length <= 72 ? 0.84 : 0.7;
        return d3.zoomIdentity
          .translate(width / 2 - (focusNode.y ?? 0) * scale, height / 2 - (focusNode.x ?? 0) * scale)
          .scale(scale);
      }

      const minX = d3.min(nodesData, (node: any) => node.x) ?? 0;
      const maxX = d3.max(nodesData, (node: any) => node.x) ?? 0;
      const minY = d3.min(nodesData, (node: any) => node.y) ?? 0;
      const maxY = d3.max(nodesData, (node: any) => node.y) ?? 0;
      const graphWidth = Math.max(1, maxY - minY + 180);
      const graphHeight = Math.max(1, maxX - minX + 120);
      const scale = Math.max(0.24, Math.min(1, Math.min((width - 48) / graphWidth, (height - 48) / graphHeight)));
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      return d3.zoomIdentity
        .translate(width / 2 - centerY * scale, height / 2 - centerX * scale)
        .scale(scale);
    };

    const shouldFitToAnchor = fitToAnchorRef.current;
    const targetTransform =
      restoreViewportRef.current && persistedViewportRef.current && !shouldFitToAnchor
        ? d3.zoomIdentity.translate(persistedViewportRef.current.x, persistedViewportRef.current.y).scale(persistedViewportRef.current.k)
        : currentTransform && !shouldFitToAnchor
          ? d3.zoomIdentity.translate(currentTransform.x, currentTransform.y).scale(currentTransform.k)
          : getSmartTransform();

    if (zoomRef.current) {
      const zoomTarget = shouldFitToAnchor || restoreViewportRef.current
        ? svg.transition().duration(260)
        : svg;
      zoomTarget.call(zoomRef.current.transform, targetTransform);
    } else {
      g.attr('transform', targetTransform.toString());
    }
    latestViewportRef.current = { x: targetTransform.x, y: targetTransform.y, k: targetTransform.k };
    if (restoreViewportRef.current) {
      restoreViewportRef.current = false;
    }
    if (fitToAnchorRef.current) {
      fitToAnchorRef.current = false;
    }

    // No simulation needed for tree layout

    return () => {
      // Cleanup
    };
  }, [
    graphRenderPlan,
    nodeMasteryMap,
    persistViewport,
    selectGraphNode,
    selectedNodeId,
    subjectChildrenByParent,
    subjectNodes,
    toggleCollapsedNode,
    effectiveCollapsedSet,
    focusPathIds,
    state.currentSubject,
    viewMode,
  ]);

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

  const selectedNode = subjectNodes.find((node) => node.id === selectedNodeId);
  const selectedNodePath = selectedNodeId ? formatKnowledgeNodePath(subjectNodes, selectedNodeId) : '';
  const scopeNodeIds = selectedNodeId
    ? collectDescendantNodeIds(subjectNodes, selectedNodeId, state.activeGraphScope?.includeDescendants ?? true)
    : [];
  const nodeMemories = selectedNode
    ? subjectMemories.filter((memory) => (memory.knowledgeNodeIds || []).some((id) => scopeNodeIds.includes(id)))
    : [];
  const directNodeMemories = selectedNode
    ? subjectMemories.filter((memory) => (memory.knowledgeNodeIds || []).includes(selectedNode.id))
    : [];
  const masterySummary = selectedNode
    ? getKnowledgeNodeMastery(subjectMemories, subjectNodes, selectedNode.id, state.activeGraphScope?.includeDescendants ?? true)
    : { mastery: null, memoryCount: 0, mistakeCount: 0 };
  const nodeMastery = masterySummary.mastery;
  const relatedNodes = selectedNode ? getRelatedKnowledgeNodes(subjectNodes, subjectMemories, selectedNode.id, 6) : [];
  const masteryBuckets = nodeMemories.reduce(
    (acc, memory) => {
      if (memory.confidence >= 75) acc.strong += 1;
      else if (memory.confidence >= 45) acc.mid += 1;
      else acc.weak += 1;
      return acc;
    },
    { strong: 0, mid: 0, weak: 0 }
  );

  const renderOutline = (parentId: string | null, depth: number = 0) => {
    const children = visibleChildrenByParent.get(parentId) || [];
    return children.map(node => (
      <div key={node.id} style={{ marginLeft: `${depth * 20}px` }} className="group">
        <div className={clsx(
          "flex items-center gap-2 py-1 px-2 rounded transition-colors hover:bg-slate-800 cursor-pointer",
          selectedNodeId === node.id && "bg-indigo-500/20 text-indigo-300",
          focusPathIds.has(node.id) && selectedNodeId !== node.id && "bg-indigo-500/10 text-indigo-100"
        )} onClick={() => selectGraphNode(node.id)}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              const childCount = subjectChildrenByParent.get(node.id)?.length || 0;
              const hiddenCount = graphRenderPlan.collapsedSummaryByNodeId[node.id]?.hiddenDescendantCount || 0;
              if (childCount === 0 && hiddenCount === 0) return;
              toggleCollapsedNode(node.id);
            }}
            className={clsx(
              "relative inline-flex h-5 w-5 items-center justify-center rounded border text-[10px] font-bold text-transparent transition-colors",
              (subjectChildrenByParent.get(node.id)?.length || 0) > 0 || (graphRenderPlan.collapsedSummaryByNodeId[node.id]?.hiddenDescendantCount || 0) > 0
                ? "border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-500/50"
                : "border-transparent text-slate-700"
            )}
          >
            {state.knowledgeNodes.some(n => n.parentId === node.id) ? '▾' : '•'}
            <span className="absolute inset-0 flex items-center justify-center text-slate-300">
              {effectiveCollapsedSet.has(node.id) ? '+' : '−'}
            </span>
          </button>
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
          {(graphRenderPlan.collapsedSummaryByNodeId[node.id]?.hiddenDescendantCount || 0) > 0 && (
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
              +{graphRenderPlan.collapsedSummaryByNodeId[node.id].hiddenDescendantCount}
            </span>
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
        {!effectiveCollapsedSet.has(node.id) && renderOutline(node.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="p-0 sm:p-2 h-full flex flex-col bg-black text-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-900 bg-slate-950/50 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <h2 className="text-sm md:text-base font-bold text-white flex items-center gap-2 uppercase tracking-tight">
            <BrainCircuit className="w-4 h-4 text-indigo-400" />
            <span className="truncate">{state.currentSubject} 知识导图</span>
          </h2>
          {graphRenderPlan.hiddenNodeCount > 0 && (
            <span className="hidden rounded-full border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] font-semibold text-slate-400 md:inline-flex">
              已自动折叠 {graphRenderPlan.hiddenNodeCount} 个节点
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-slate-900/50 border border-slate-800 p-0.5 rounded-lg">
            {viewMode === 'graph' && (
              <button
                onClick={() => {
                  latestViewportRef.current = null;
                  restoreViewportRef.current = true;
                  fitToAnchorRef.current = true;
                  persistSubjectGraphView({ viewport: null });
                  setRenderTrigger((prev) => prev + 1);
                }}
                className="hidden md:flex items-center gap-1 px-2 py-1 text-[9px] font-black text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest"
                title="重置视图"
              >
                <Maximize className="w-3 h-3" />
                重置
              </button>
            )}
            {state.lastNodesState && (
              <button
                onClick={() => dispatch({ type: 'UNDO_NODES' })}
                className="flex items-center gap-1 px-2 py-1 text-[9px] font-black text-amber-500 hover:text-amber-400 transition-colors uppercase tracking-widest"
                title="撤销上次 AI 调整"
              >
                <RotateCcw className="w-3 h-3" />
                撤销
              </button>
            )}
            <button
              onClick={() => {
                setViewMode('graph');
                restoreViewportRef.current = true;
                fitToAnchorRef.current = false;
                persistSubjectGraphView({ viewMode: 'graph' });
                setRenderTrigger((prev) => prev + 1);
              }}
              className={clsx(
                "px-2 md:px-3 py-1 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-md transition-all",
                viewMode === 'graph' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
              )}
            >
              导图
            </button>
            <button
              onClick={() => {
                setViewMode('outline');
                fitToAnchorRef.current = false;
                persistSubjectGraphView({ viewMode: 'outline' });
                setRenderTrigger((prev) => prev + 1);
              }}
              className={clsx(
                "px-2 md:px-3 py-1 text-[9px] md:text-[10px] font-black uppercase tracking-widest rounded-md transition-all",
                viewMode === 'outline' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-500 hover:text-slate-300"
              )}
            >
              大纲
            </button>
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden relative">
        <div 
          ref={containerRef}
          className="flex-1 bg-slate-950 border-b lg:border-b-0 border-slate-900 overflow-hidden relative min-h-[50vh] lg:min-h-0"
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
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2 text-[10px] text-slate-500">
                  <span>反馈</span>
                  <button
                    onClick={() => recordPreviewFeedback('positive')}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-1',
                      previewFeedback?.sentiment === 'positive'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-slate-700 bg-slate-950 text-slate-400'
                    )}
                  >
                    <ThumbsUp className="h-3 w-3" />
                    有用
                  </button>
                  <button
                    onClick={() => recordPreviewFeedback('negative')}
                    className={clsx(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-1',
                      previewFeedback?.sentiment === 'negative'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                        : 'border-slate-700 bg-slate-950 text-slate-400'
                    )}
                  >
                    <ThumbsDown className="h-3 w-3" />
                    需调整
                  </button>
                  {previewFeedback?.sentiment === 'negative' &&
                    FEEDBACK_QUICK_TAGS.map((tag) => (
                      <button
                        key={`graph-preview-${tag}`}
                        onClick={() => recordPreviewFeedback('negative', tag)}
                        className={clsx(
                          'rounded-full border px-2 py-1',
                          previewFeedback.tag === tag
                            ? 'border-rose-500/40 bg-rose-500/10 text-rose-200'
                            : 'border-slate-700 bg-slate-950 text-slate-400'
                        )}
                      >
                        {tag}
                      </button>
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
                    <img src={image} alt="结构图预览" className="w-full h-full object-cover" />
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
                              selectGraphNode(null);
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
                    <button onClick={() => selectGraphNode(null)} className="text-slate-500 hover:text-slate-300">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
            <div className="px-4 pb-4 space-y-3">
              <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                  <GitBranch className="h-3.5 w-3.5" />
                  节点路径
                </div>
                <div className="mt-2 text-xs leading-5 text-slate-300">{selectedNodePath || selectedNode.name}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
                    {GRAPH_NODE_KIND_LABELS[selectedNode.kind || 'knowledge']}
                  </span>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-400">
                    范围节点 {scopeNodeIds.length}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => selectGraphNode(selectedNode.id, { includeDescendants: !(state.activeGraphScope?.includeDescendants ?? true) })}
                  className={clsx(
                    'rounded-full border px-2 py-1 text-[10px]',
                    state.activeGraphScope?.includeDescendants ?? true
                      ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                      : 'border-slate-700 bg-slate-950 text-slate-400'
                  )}
                >
                  子树范围
                </button>
                <button
                  onClick={() => selectGraphNode(selectedNode.id, { includeRelated: !(state.activeGraphScope?.includeRelated ?? false) })}
                  className={clsx(
                    'rounded-full border px-2 py-1 text-[10px]',
                    state.activeGraphScope?.includeRelated
                      ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                      : 'border-slate-700 bg-slate-950 text-slate-400'
                  )}
                >
                  关联扩展
                </button>
                <button
                  onClick={sendScopeQuestionToChat}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200"
                >
                  <MessageSquare className="h-3 w-3" />
                  基于当前节点问 AI
                </button>
              </div>
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
              <div className="grid grid-cols-3 gap-2 mb-4 text-[10px]">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center text-slate-400">
                  <div className="text-emerald-300">{masteryBuckets.strong}</div>
                  <div>熟练</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center text-slate-400">
                  <div className="text-amber-300">{masteryBuckets.mid}</div>
                  <div>待巩固</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center text-slate-400">
                  <div className="text-rose-300">{masteryBuckets.weak}</div>
                  <div>薄弱</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] text-slate-400">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <div className="text-slate-200">{nodeMemories.length}</div>
                  <div>子树记忆</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <div className="text-slate-200">{directNodeMemories.length}</div>
                  <div>直接挂载</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-center">
                  <div className="text-slate-200">{masterySummary.mistakeCount}</div>
                  <div>相关错题</div>
                </div>
              </div>
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
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Link2 className="w-3 h-3" />
                  相关节点
                </h4>
                <div className="space-y-2">
                  {relatedNodes.length === 0 ? (
                    <p className="text-xs text-slate-500">暂无相关节点</p>
                  ) : (
                    relatedNodes.map((item) => (
                      <button
                        key={item.node.id}
                        onClick={() => selectGraphNode(item.node.id)}
                        className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-left hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-xs text-slate-200">{item.node.name}</div>
                            <div className="mt-1 truncate text-[10px] text-slate-500">{item.reasons.slice(0, 2).join(' · ')}</div>
                          </div>
                          <span className="text-[10px] text-indigo-300">{Math.round(item.score * 100)}%</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
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
