import type {
  GraphViewMode,
  GraphViewportTransform,
  KnowledgeNode,
  Subject,
  SubjectGraphViewState,
} from './types';

export const DEFAULT_GRAPH_MAX_VISIBLE_NODES = 100;

export const DEFAULT_GRAPH_VIEW_MODE: GraphViewMode = 'graph';

export function createDefaultSubjectGraphViewState(): SubjectGraphViewState {
  return {
    viewMode: DEFAULT_GRAPH_VIEW_MODE,
    focusNodeId: null,
    includeDescendants: true,
    includeRelated: false,
    collapsedNodeIds: [],
    viewport: null,
    updatedAt: Date.now(),
  };
}

export function normalizeSubjectGraphViewState(
  nodes: KnowledgeNode[],
  state?: Partial<SubjectGraphViewState> | null
): SubjectGraphViewState {
  const defaults = createDefaultSubjectGraphViewState();
  const validNodeIds = new Set(nodes.map((node) => node.id));
  const collapsedNodeIds = Array.from(
    new Set((state?.collapsedNodeIds || []).filter((nodeId) => validNodeIds.has(nodeId)))
  );
  const focusNodeId = state?.focusNodeId && validNodeIds.has(state.focusNodeId) ? state.focusNodeId : null;
  const viewport = normalizeViewport(state?.viewport);

  return {
    viewMode: state?.viewMode === 'outline' ? 'outline' : defaults.viewMode,
    focusNodeId,
    includeDescendants: state?.includeDescendants ?? defaults.includeDescendants,
    includeRelated: state?.includeRelated ?? defaults.includeRelated,
    collapsedNodeIds,
    viewport,
    updatedAt: state?.updatedAt || defaults.updatedAt,
  };
}

function normalizeViewport(viewport: GraphViewportTransform | null | undefined): GraphViewportTransform | null {
  if (!viewport) return null;
  if (![viewport.x, viewport.y, viewport.k].every((value) => Number.isFinite(value))) return null;
  return {
    x: viewport.x,
    y: viewport.y,
    k: viewport.k,
  };
}

type TreeMaps = {
  byId: Map<string, KnowledgeNode>;
  childrenByParent: Map<string | null, KnowledgeNode[]>;
  roots: KnowledgeNode[];
};

type NodeMeta = {
  depth: number;
  pathIds: string[];
  rootId: string;
  orderTrail: number[];
};

export interface GraphCollapsedSummary {
  hiddenDescendantCount: number;
  reason: 'manual' | 'auto';
}

export interface GraphRenderPlan {
  visibleNodes: KnowledgeNode[];
  visibleNodeIdsInPriorityOrder: string[];
  totalNodeCount: number;
  visibleNodeCount: number;
  hiddenNodeCount: number;
  manualCollapsedIds: string[];
  autoCollapsedIds: string[];
  effectiveCollapsedIds: string[];
  collapsedSummaryByNodeId: Record<string, GraphCollapsedSummary>;
  anchorNodeId: string | null;
  preferredFocusNodeId: string | null;
}

function compareNodes(left: KnowledgeNode, right: KnowledgeNode) {
  const orderDiff = left.order - right.order;
  if (orderDiff !== 0) return orderDiff;
  return left.name.localeCompare(right.name);
}

function buildTreeMaps(nodes: KnowledgeNode[]): TreeMaps {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, KnowledgeNode[]>();

  for (const node of nodes) {
    const parentId = node.parentId && byId.has(node.parentId) ? node.parentId : null;
    const existing = childrenByParent.get(parentId);
    if (existing) {
      existing.push(node);
    } else {
      childrenByParent.set(parentId, [node]);
    }
  }

  for (const group of childrenByParent.values()) {
    group.sort(compareNodes);
  }

  return {
    byId,
    childrenByParent,
    roots: childrenByParent.get(null) || [],
  };
}

function buildNodeMetaMaps(
  roots: KnowledgeNode[],
  childrenByParent: Map<string | null, KnowledgeNode[]>
) {
  const metaById = new Map<string, NodeMeta>();
  const rootOrderById = new Map<string, number>();

  const visit = (node: KnowledgeNode, depth: number, pathIds: string[], orderTrail: number[], rootId: string) => {
    metaById.set(node.id, {
      depth,
      pathIds,
      rootId,
      orderTrail,
    });
    const children = childrenByParent.get(node.id) || [];
    for (const child of children) {
      visit(child, depth + 1, [...pathIds, child.id], [...orderTrail, child.order], rootId);
    }
  };

  roots.forEach((root, index) => {
    rootOrderById.set(root.id, index);
    visit(root, 0, [root.id], [root.order], root.id);
  });

  return { metaById, rootOrderById };
}

function buildFocusPath(metaById: Map<string, NodeMeta>, focusNodeId: string | null): string[] {
  if (!focusNodeId) return [];
  return metaById.get(focusNodeId)?.pathIds || [];
}

function collectDescendantIds(nodeId: string, childrenByParent: Map<string | null, KnowledgeNode[]>) {
  const descendantIds: string[] = [];
  const queue = [...(childrenByParent.get(nodeId) || [])];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    descendantIds.push(current.id);
    queue.push(...(childrenByParent.get(current.id) || []));
  }

  return descendantIds;
}

function getCommonPrefixLength(left: string[], right: string[]) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function compareOrderTrail(left: number[], right: number[]) {
  const limit = Math.min(left.length, right.length);
  for (let index = 0; index < limit; index += 1) {
    const diff = left[index] - right[index];
    if (diff !== 0) return diff;
  }
  return left.length - right.length;
}

function getTreeDistance(anchor: NodeMeta, current: NodeMeta) {
  const commonPrefixLength = getCommonPrefixLength(anchor.pathIds, current.pathIds);
  return anchor.depth + current.depth - (commonPrefixLength - 1) * 2;
}

function dedupeOrderedIds(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

export function buildGraphRenderPlan(
  nodes: KnowledgeNode[],
  options?: {
    focusNodeId?: string | null;
    collapsedNodeIds?: string[];
    maxVisibleNodes?: number;
  }
): GraphRenderPlan {
  const { byId, childrenByParent, roots } = buildTreeMaps(nodes);
  const { metaById, rootOrderById } = buildNodeMetaMaps(roots, childrenByParent);
  const totalNodeCount = nodes.length;
  const maxVisibleNodes = Math.max(6, Math.min(options?.maxVisibleNodes || DEFAULT_GRAPH_MAX_VISIBLE_NODES, 100));
  const anchorNodeId = options?.focusNodeId && byId.has(options.focusNodeId) ? options.focusNodeId : roots[0]?.id || null;
  const focusPath = buildFocusPath(metaById, anchorNodeId);
  const focusPathSet = new Set(focusPath);
  const anchorMeta = anchorNodeId ? metaById.get(anchorNodeId) || null : null;

  const manualCollapsedIds = Array.from(
    new Set((options?.collapsedNodeIds || []).filter((nodeId) => byId.has(nodeId) && !focusPathSet.has(nodeId)))
  );
  const blockedByManualCollapse = new Set<string>();
  for (const nodeId of manualCollapsedIds) {
    for (const descendantId of collectDescendantIds(nodeId, childrenByParent)) {
      blockedByManualCollapse.add(descendantId);
    }
  }

  const requiredVisibleIds = dedupeOrderedIds(focusPath.length > 0 ? focusPath : roots[0] ? [roots[0].id] : []);
  const visibleIdSet = new Set(requiredVisibleIds);
  const candidateNodes = nodes.filter((node) => !visibleIdSet.has(node.id) && !blockedByManualCollapse.has(node.id));
  const anchorPath = anchorMeta?.pathIds || [];

  candidateNodes.sort((left, right) => {
    const leftMeta = metaById.get(left.id);
    const rightMeta = metaById.get(right.id);
    if (!leftMeta || !rightMeta) return compareNodes(left, right);

    const leftSameRoot = anchorMeta ? leftMeta.rootId === anchorMeta.rootId : false;
    const rightSameRoot = anchorMeta ? rightMeta.rootId === anchorMeta.rootId : false;
    if (leftSameRoot !== rightSameRoot) return leftSameRoot ? -1 : 1;

    const leftDistance = anchorMeta && leftSameRoot
      ? getTreeDistance(anchorMeta, leftMeta)
      : 10000 + (rootOrderById.get(leftMeta.rootId) || 0) * 100 + leftMeta.depth;
    const rightDistance = anchorMeta && rightSameRoot
      ? getTreeDistance(anchorMeta, rightMeta)
      : 10000 + (rootOrderById.get(rightMeta.rootId) || 0) * 100 + rightMeta.depth;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;

    const leftCommonPrefix = getCommonPrefixLength(leftMeta.pathIds, anchorPath);
    const rightCommonPrefix = getCommonPrefixLength(rightMeta.pathIds, anchorPath);
    if (leftCommonPrefix !== rightCommonPrefix) return rightCommonPrefix - leftCommonPrefix;

    const parentOrderDiff = compareOrderTrail(leftMeta.orderTrail, rightMeta.orderTrail);
    if (parentOrderDiff !== 0) return parentOrderDiff;

    return left.name.localeCompare(right.name);
  });

  for (const node of candidateNodes) {
    if (visibleIdSet.size >= maxVisibleNodes) break;
    visibleIdSet.add(node.id);
    requiredVisibleIds.push(node.id);
  }

  const collapsedSummaryByNodeId: Record<string, GraphCollapsedSummary> = {};
  for (const nodeId of manualCollapsedIds) {
    collapsedSummaryByNodeId[nodeId] = {
      hiddenDescendantCount: 0,
      reason: 'manual',
    };
  }

  const hiddenNodes = nodes.filter((node) => !visibleIdSet.has(node.id));
  for (const hiddenNode of hiddenNodes) {
    let currentParentId = hiddenNode.parentId && byId.has(hiddenNode.parentId) ? hiddenNode.parentId : null;
    while (currentParentId && !visibleIdSet.has(currentParentId)) {
      currentParentId = byId.get(currentParentId)?.parentId || null;
    }
    if (!currentParentId) continue;

    const existing = collapsedSummaryByNodeId[currentParentId];
    collapsedSummaryByNodeId[currentParentId] = {
      hiddenDescendantCount: (existing?.hiddenDescendantCount || 0) + 1,
      reason: existing?.reason || (manualCollapsedIds.includes(currentParentId) ? 'manual' : 'auto'),
    };
  }

  const autoCollapsedIds = Object.entries(collapsedSummaryByNodeId)
    .filter(([, summary]) => summary.reason === 'auto' && summary.hiddenDescendantCount > 0)
    .map(([nodeId]) => nodeId);
  const effectiveCollapsedIds = dedupeOrderedIds([
    ...manualCollapsedIds,
    ...Object.entries(collapsedSummaryByNodeId)
      .filter(([, summary]) => summary.hiddenDescendantCount > 0)
      .map(([nodeId]) => nodeId),
  ]);

  const visibleNodeIdsInPriorityOrder = requiredVisibleIds.filter((nodeId) => visibleIdSet.has(nodeId));
  const visibleNodes = visibleNodeIdsInPriorityOrder
    .map((nodeId) => byId.get(nodeId))
    .filter((node): node is KnowledgeNode => Boolean(node));
  const hiddenNodeCount = Math.max(0, totalNodeCount - visibleNodes.length);
  const preferredFocusNodeId =
    (anchorNodeId && visibleIdSet.has(anchorNodeId) ? anchorNodeId : null) ||
    visibleNodes[0]?.id ||
    null;

  return {
    visibleNodes,
    visibleNodeIdsInPriorityOrder,
    totalNodeCount,
    visibleNodeCount: visibleNodes.length,
    hiddenNodeCount,
    manualCollapsedIds,
    autoCollapsedIds,
    effectiveCollapsedIds,
    collapsedSummaryByNodeId,
    anchorNodeId,
    preferredFocusNodeId,
  };
}

export function getGraphViewStateForSubject(
  graphViewBySubject: Record<Subject, SubjectGraphViewState> | undefined,
  subject: Subject,
  nodes: KnowledgeNode[]
): SubjectGraphViewState {
  return normalizeSubjectGraphViewState(nodes, graphViewBySubject?.[subject]);
}
