import { GraphScope, KnowledgeNode, KnowledgeNodeKind, Memory } from '../types';

export interface MemoryQualityResult {
  score: number;
  flags: string[];
}

export const MEMORY_QUALITY_RULE_VERSION = 2;
export const FORMAL_MEMORY_MIN_SCORE = 85;
export const FORMAL_MEMORY_BLOCKING_FLAGS = [
  'empty_content',
  'missing_subject',
  'missing_function_type',
  'missing_purpose_type',
  'missing_node_link',
  'missing_evidence',
  'combined_question_group',
  'missing_question_no',
  'missing_correct_answer',
  'missing_wrong_answer',
  'missing_error_reason',
  'missing_confidence',
  'needs_confirmation',
  'answer_conflict',
  'missing_option_analysis',
  'missing_learning_task',
  'missing_memory_card',
  'missing_error_reason_category',
  'missing_review_priority',
] as const;

const MEMORY_QUALITY_PENALTIES = {
  missingSubject: 20,
  missingFunctionType: 15,
  missingPurposeType: 15,
  emptyContent: 45,
  contentTooShort: 20,
  contentBrief: 8,
  missingNodeLink: 15,
  duplicateNodeRefs: 5,
  tooManyNodeLinks: 6,
  missingEvidence: 10,
  danglingTextbookPage: 8,
  missingImageReference: 20,
  missingQuestionNo: 12,
  combinedQuestionGroup: 24,
  missingCorrectAnswer: 10,
  missingWrongAnswer: 10,
  missingErrorReason: 18,
  missingConfidence: 10,
  needsConfirmation: 18,
  answerConflict: 24,
  missingOptionAnalysis: 12,
  missingLearningTask: 10,
  missingMemoryCard: 8,
  missingErrorReasonCategory: 8,
  missingReviewPriority: 8,
  missingVocabMeaning: 12,
  missingVocabUsage: 6,
  missingVocabContext: 6,
  missingVocabOriginalSentence: 8,
  missingVocabConfusions: 6,
} as const;

export interface GraphIntegrityReport {
  orphanParentCount: number;
  crossSubjectParentCount: number;
  selfParentCount: number;
  cycleBreakCount: number;
  duplicateSiblingNameCount: number;
  renamedNodeCount: number;
  normalizedOrderCount: number;
  duplicateIdCount: number;
  kindNormalizedCount: number;
}

const UNTITLED_NODE_NAME = 'Untitled Node';
export const GRAPH_NODE_KIND_ORDER: KnowledgeNodeKind[] = ['root', 'module', 'topic', 'knowledge', 'method'];
export const GRAPH_NODE_KIND_LABELS: Record<KnowledgeNodeKind, string> = {
  root: '根',
  module: '模块',
  topic: '主题',
  knowledge: '知识点',
  method: '解题方法',
};

function normalizeText(text?: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function normalizeQuestionNo(value: unknown): string {
  return normalizeText(typeof value === 'string' ? value : '');
}

function normalizeConfidence(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value <= 1 ? value * 100 : value;
}

function countOptionAnalysisEntries(value: unknown) {
  if (!value || typeof value !== 'object') return 0;
  return Object.values(value as Record<string, unknown>).filter((entry) => normalizeText(String(entry || ''))).length;
}

function hasMemoryCard(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const card = value as Record<string, unknown>;
  return Boolean(normalizeText(String(card.front || '')) && normalizeText(String(card.back || '')));
}

function readEvidence(value: unknown) {
  if (!value || typeof value !== 'object') {
    return { sourceText: '', locationHint: '', keySentence: '' };
  }

  const evidence = value as Record<string, unknown>;
  return {
    sourceText: normalizeText(String(evidence.sourceText || '')),
    locationHint: normalizeText(String(evidence.locationHint || '')),
    keySentence: normalizeText(String(evidence.keySentence || '')),
  };
}

function isCombinedQuestionGroup(questionNo: string) {
  return /\d+\s*[-~—]\s*\d+/.test(questionNo);
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function emptyGraphIntegrityReport(): GraphIntegrityReport {
  return {
    orphanParentCount: 0,
    crossSubjectParentCount: 0,
    selfParentCount: 0,
    cycleBreakCount: 0,
    duplicateSiblingNameCount: 0,
    renamedNodeCount: 0,
    normalizedOrderCount: 0,
    duplicateIdCount: 0,
    kindNormalizedCount: 0,
  };
}

export function getKnowledgeNodeDepth(node: KnowledgeNode, nodes: KnowledgeNode[]): number {
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const seen = new Set<string>([node.id]);
  let depth = 1;
  let parentId = node.parentId;

  while (parentId) {
    const parent = byId.get(parentId);
    if (!parent || parent.subject !== node.subject || seen.has(parent.id)) break;
    seen.add(parent.id);
    depth += 1;
    parentId = parent.parentId;
  }

  return depth;
}

export function inferKnowledgeNodeKind(node: KnowledgeNode, nodes: KnowledgeNode[]): KnowledgeNodeKind {
  const depth = getKnowledgeNodeDepth(node, nodes);
  if (depth <= 1) return 'root';
  if (depth === 2) return 'module';
  if (depth === 3) return 'topic';
  if (depth === 4) return 'knowledge';
  return 'method';
}

export function isAttachableKnowledgeNode(node: KnowledgeNode | undefined, nodes: KnowledgeNode[] = []): boolean {
  if (!node) return false;
  const kind = node.kind || inferKnowledgeNodeKind(node, nodes);
  return kind === 'knowledge' || kind === 'method';
}

export function buildKnowledgeNodePath(nodes: KnowledgeNode[], nodeId: string | null | undefined): KnowledgeNode[] {
  if (!nodeId) return [];
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const node = byId.get(nodeId);
  if (!node) return [];

  const path: KnowledgeNode[] = [];
  const seen = new Set<string>();
  let current: KnowledgeNode | undefined = node;

  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return path;
}

export function formatKnowledgeNodePath(nodes: KnowledgeNode[], nodeId: string | null | undefined): string {
  const path = buildKnowledgeNodePath(nodes, nodeId);
  return path.map((node) => node.name).join(' / ');
}

export function collectDescendantNodeIds(
  nodes: KnowledgeNode[],
  nodeId: string | null | undefined,
  includeSelf = true
): string[] {
  if (!nodeId) return [];
  const childrenByParent = new Map<string, KnowledgeNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const children = childrenByParent.get(node.parentId) || [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  const result: string[] = includeSelf ? [nodeId] : [];
  const queue = [...(childrenByParent.get(nodeId) || [])];
  const seen = new Set(result);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || seen.has(current.id)) continue;
    seen.add(current.id);
    result.push(current.id);
    queue.push(...(childrenByParent.get(current.id) || []));
  }

  return result;
}

export function getStructuralRelatedNodeIds(nodes: KnowledgeNode[], nodeId: string | null | undefined): string[] {
  if (!nodeId) return [];
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return [];

  const ids = new Set<string>();
  if (node.parentId) ids.add(node.parentId);
  for (const item of nodes) {
    if (item.id === node.id || item.subject !== node.subject) continue;
    if (item.parentId === node.id) ids.add(item.id);
    if (node.parentId && item.parentId === node.parentId) ids.add(item.id);
  }
  return Array.from(ids);
}

export function getGraphScopeNodeIds(nodes: KnowledgeNode[], scope?: GraphScope | null): string[] {
  if (!scope?.nodeId) return [];
  const node = nodes.find((item) => item.id === scope.nodeId && item.subject === scope.subject);
  if (!node) return [];

  const ids = new Set(
    scope.includeDescendants ? collectDescendantNodeIds(nodes, node.id, true) : [node.id]
  );

  if (scope.includeRelated) {
    getStructuralRelatedNodeIds(nodes.filter((item) => item.subject === node.subject), node.id).forEach((id) => ids.add(id));
  }

  return Array.from(ids);
}

export function getMemoriesForGraphScope(
  memories: Memory[],
  nodes: KnowledgeNode[],
  scope?: GraphScope | null
): Memory[] {
  const scopeNodeIds = new Set(getGraphScopeNodeIds(nodes, scope));
  if (scopeNodeIds.size === 0) return memories;
  return memories.filter((memory) => (memory.knowledgeNodeIds || []).some((id) => scopeNodeIds.has(id)));
}

export function getKnowledgeNodeMastery(
  memories: Memory[],
  nodes: KnowledgeNode[],
  nodeId: string,
  includeDescendants = true
): { mastery: number | null; memoryCount: number; mistakeCount: number } {
  const nodeIds = new Set(includeDescendants ? collectDescendantNodeIds(nodes, nodeId, true) : [nodeId]);
  const scopedMemories = memories.filter((memory) => (memory.knowledgeNodeIds || []).some((id) => nodeIds.has(id)));
  if (scopedMemories.length === 0) {
    return { mastery: null, memoryCount: 0, mistakeCount: 0 };
  }

  const mastery = scopedMemories.reduce((sum, memory) => sum + clampScore(memory.confidence), 0) / scopedMemories.length;
  return {
    mastery,
    memoryCount: scopedMemories.length,
    mistakeCount: scopedMemories.filter((memory) => memory.isMistake).length,
  };
}

export function getRelatedKnowledgeNodes(
  nodes: KnowledgeNode[],
  memories: Memory[],
  nodeId: string,
  limit = 6
): Array<{ node: KnowledgeNode; score: number; reasons: string[] }> {
  const node = nodes.find((item) => item.id === nodeId);
  if (!node) return [];

  const subjectNodes = nodes.filter((item) => item.subject === node.subject);
  const nodeMemoryIds = new Set(
    memories
      .filter((memory) => (memory.knowledgeNodeIds || []).includes(node.id))
      .map((memory) => memory.id)
  );
  const nodeMistakeIds = new Set(
    memories
      .filter((memory) => memory.isMistake && (memory.knowledgeNodeIds || []).includes(node.id))
      .map((memory) => memory.id)
  );

  return subjectNodes
    .filter((candidate) => candidate.id !== node.id)
    .map((candidate) => {
      let score = 0;
      const reasons: string[] = [];

      if (candidate.id === node.parentId || candidate.parentId === node.id) {
        score += 0.35;
        reasons.push('父子关系');
      }
      if (node.parentId && candidate.parentId === node.parentId) {
        score += 0.25;
        reasons.push('兄弟节点');
      }
      const sharedMemoryCount = memories.filter(
        (memory) => nodeMemoryIds.has(memory.id) && (memory.knowledgeNodeIds || []).includes(candidate.id)
      ).length;
      if (sharedMemoryCount > 0) {
        score += Math.min(0.35, sharedMemoryCount * 0.12);
        reasons.push(`共现记忆 ${sharedMemoryCount}`);
      }
      const sharedMistakeCount = memories.filter(
        (memory) => nodeMistakeIds.has(memory.id) && (memory.knowledgeNodeIds || []).includes(candidate.id)
      ).length;
      if (sharedMistakeCount > 0) {
        score += Math.min(0.25, sharedMistakeCount * 0.15);
        reasons.push(`共现错题 ${sharedMistakeCount}`);
      }
      const correlation = node.correlation?.[candidate.id] || candidate.correlation?.[node.id] || 0;
      if (correlation > 0) {
        score += Math.min(0.25, correlation * 0.25);
        reasons.push('历史相关性');
      }

      return { node: candidate, score, reasons };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export function evaluateMemoryQuality(input: Partial<Memory>): MemoryQualityResult {
  const content = normalizeText(input.content);
  const subject = normalizeText(input.subject);
  const functionType = normalizeText(input.functionType);
  const purposeType = normalizeText(input.purposeType);
  const questionNo = normalizeQuestionNo((input as any).questionNo);
  const studentAnswer = normalizeText((input as any).studentAnswer) || normalizeText(input.wrongAnswer);
  const confidence = normalizeConfidence((input as any).confidence);
  const evidence = readEvidence((input as any).evidence);
  const optionAnalysisCount = countOptionAnalysisEntries((input as any).optionAnalysis);
  const learningTask = normalizeText((input as any).learningTask);
  const errorReasonCategory = normalizeText((input as any).errorReasonCategory);
  const reviewPriority = normalizeText((input as any).reviewPriority);
  const needsConfirmation = Boolean((input as any).needsConfirmation);
  const conflict = Boolean((input as any).conflict);
  const nodeIds = input.knowledgeNodeIds || [];
  const sourceResourceIds = input.sourceResourceIds || [];
  const flags: string[] = [];
  let score = 100;
  const isQuestionLike =
    input.type === 'qa' ||
    Boolean(input.isMistake) ||
    Boolean(normalizeText(input.questionType)) ||
    Boolean(normalizeText(input.correctAnswer)) ||
    Boolean(questionNo);

  if (!subject) {
    score -= MEMORY_QUALITY_PENALTIES.missingSubject;
    flags.push('missing_subject');
  }
  if (!functionType) {
    score -= MEMORY_QUALITY_PENALTIES.missingFunctionType;
    flags.push('missing_function_type');
  }
  if (!purposeType) {
    score -= MEMORY_QUALITY_PENALTIES.missingPurposeType;
    flags.push('missing_purpose_type');
  }
  if (!content) {
    score -= MEMORY_QUALITY_PENALTIES.emptyContent;
    flags.push('empty_content');
  } else if (content.length < 6) {
    score -= MEMORY_QUALITY_PENALTIES.contentTooShort;
    flags.push('content_too_short');
  } else if (content.length < 16) {
    score -= MEMORY_QUALITY_PENALTIES.contentBrief;
    flags.push('content_brief');
  }

  if (nodeIds.length === 0) {
    score -= MEMORY_QUALITY_PENALTIES.missingNodeLink;
    flags.push('missing_node_link');
  } else if (nodeIds.length > 10) {
    score -= MEMORY_QUALITY_PENALTIES.tooManyNodeLinks;
    flags.push('too_many_node_links');
  }
  const uniqueNodeIds = Array.from(new Set(nodeIds));
  if (!arraysEqual(uniqueNodeIds, nodeIds)) {
    score -= MEMORY_QUALITY_PENALTIES.duplicateNodeRefs;
    flags.push('duplicate_node_refs');
  }

  const hasTextbookEvidence = Boolean(input.sourceTextbookId);
  const hasResourceEvidence = sourceResourceIds.length > 0;
  const hasSourceEvidence = Boolean(normalizeText(input.source));
  if (!hasTextbookEvidence && !hasResourceEvidence && !hasSourceEvidence) {
    score -= MEMORY_QUALITY_PENALTIES.missingEvidence;
    flags.push('missing_evidence');
  }
  if (!hasTextbookEvidence && Number.isFinite(input.sourceTextbookPage as number)) {
    score -= MEMORY_QUALITY_PENALTIES.danglingTextbookPage;
    flags.push('dangling_textbook_page');
  }

  if (input.sourceType === 'image') {
    const hasImageRef = Boolean(normalizeText(input.imageUrl)) || (input.imageUrls || []).length > 0;
    if (!hasImageRef) {
      score -= MEMORY_QUALITY_PENALTIES.missingImageReference;
      flags.push('missing_image_reference');
    }
  }

  if (isQuestionLike) {
    if (!questionNo) {
      score -= MEMORY_QUALITY_PENALTIES.missingQuestionNo;
      flags.push('missing_question_no');
    } else if (isCombinedQuestionGroup(questionNo)) {
      score -= MEMORY_QUALITY_PENALTIES.combinedQuestionGroup;
      flags.push('combined_question_group');
    }

    if (!normalizeText(input.correctAnswer)) {
      score -= MEMORY_QUALITY_PENALTIES.missingCorrectAnswer;
      flags.push('missing_correct_answer');
    }

    if (confidence === undefined) {
      score -= MEMORY_QUALITY_PENALTIES.missingConfidence;
      flags.push('missing_confidence');
    }

    if (!evidence.sourceText || !evidence.locationHint) {
      score -= MEMORY_QUALITY_PENALTIES.missingEvidence;
      flags.push('missing_evidence');
    }

    if (optionAnalysisCount === 0) {
      score -= MEMORY_QUALITY_PENALTIES.missingOptionAnalysis;
      flags.push('missing_option_analysis');
    }

    if (!learningTask) {
      score -= MEMORY_QUALITY_PENALTIES.missingLearningTask;
      flags.push('missing_learning_task');
    }

    if (!hasMemoryCard((input as any).memoryCard)) {
      score -= MEMORY_QUALITY_PENALTIES.missingMemoryCard;
      flags.push('missing_memory_card');
    }

    if (!reviewPriority) {
      score -= MEMORY_QUALITY_PENALTIES.missingReviewPriority;
      flags.push('missing_review_priority');
    }
  }

  if (input.isMistake) {
    if (!studentAnswer) {
      score -= MEMORY_QUALITY_PENALTIES.missingWrongAnswer;
      flags.push('missing_wrong_answer');
    }
    if (!normalizeText(input.errorReason)) {
      score -= MEMORY_QUALITY_PENALTIES.missingErrorReason;
      flags.push('missing_error_reason');
    }
    if (!errorReasonCategory) {
      score -= MEMORY_QUALITY_PENALTIES.missingErrorReasonCategory;
      flags.push('missing_error_reason_category');
    }
  }

  if (needsConfirmation) {
    score -= MEMORY_QUALITY_PENALTIES.needsConfirmation;
    flags.push('needs_confirmation');
  }

  if (conflict) {
    score -= MEMORY_QUALITY_PENALTIES.answerConflict;
    flags.push('answer_conflict');
  }

  if (input.type === 'vocabulary') {
    if (!normalizeText(input.vocabularyData?.meaning)) {
      score -= MEMORY_QUALITY_PENALTIES.missingVocabMeaning;
      flags.push('missing_vocab_meaning');
    }
    if (!normalizeText(input.vocabularyData?.usage)) {
      score -= MEMORY_QUALITY_PENALTIES.missingVocabUsage;
      flags.push('missing_vocab_usage');
    }
    if (!normalizeText(input.vocabularyData?.context)) {
      score -= MEMORY_QUALITY_PENALTIES.missingVocabContext;
      flags.push('missing_vocab_context');
    }
    if (!normalizeText(input.vocabularyData?.originalSentence)) {
      score -= MEMORY_QUALITY_PENALTIES.missingVocabOriginalSentence;
      flags.push('missing_vocab_original_sentence');
    }
    if ((input.vocabularyData?.confusions || []).length === 0) {
      score -= MEMORY_QUALITY_PENALTIES.missingVocabConfusions;
      flags.push('missing_vocab_confusions');
    }
  }

  return {
    score: clampScore(score),
    flags: Array.from(new Set(flags)),
  };
}

export function getMemoryQualityLevel(score?: number): 'high' | 'medium' | 'low' {
  if ((score ?? 0) >= 85) return 'high';
  if ((score ?? 0) >= 60) return 'medium';
  return 'low';
}

export function isFormalMemoryEligible(input: Partial<Memory>, quality = evaluateMemoryQuality(input)) {
  return (
    quality.score >= FORMAL_MEMORY_MIN_SCORE &&
    !quality.flags.some((flag) => (FORMAL_MEMORY_BLOCKING_FLAGS as readonly string[]).includes(flag))
  );
}

export function normalizeKnowledgeNodes(nodes: KnowledgeNode[]): {
  nodes: KnowledgeNode[];
  report: GraphIntegrityReport;
} {
  const report = emptyGraphIntegrityReport();
  const seenIds = new Set<string>();
  const dedupedNodes: KnowledgeNode[] = [];

  for (const node of nodes || []) {
    if (!node?.id || seenIds.has(node.id)) {
      if (node?.id) report.duplicateIdCount += 1;
      continue;
    }
    seenIds.add(node.id);
    const normalizedName = normalizeText(node.name) || UNTITLED_NODE_NAME;
    dedupedNodes.push({
      ...node,
      name: normalizedName,
    });
  }

  const workingNodes = dedupedNodes.map((node) => ({ ...node }));
  const nodeById = new Map(workingNodes.map((node) => [node.id, node]));

  for (const node of workingNodes) {
    if (!node.parentId) continue;
    if (node.parentId === node.id) {
      node.parentId = null;
      report.selfParentCount += 1;
      continue;
    }
    const parentNode = nodeById.get(node.parentId);
    if (!parentNode) {
      node.parentId = null;
      report.orphanParentCount += 1;
      continue;
    }
    if (parentNode.subject !== node.subject) {
      node.parentId = null;
      report.crossSubjectParentCount += 1;
    }
  }

  for (const node of workingNodes) {
    const visited = new Set<string>([node.id]);
    let parentId = node.parentId;

    while (parentId) {
      if (visited.has(parentId)) {
        node.parentId = null;
        report.cycleBreakCount += 1;
        break;
      }
      visited.add(parentId);
      const parentNode = nodeById.get(parentId);
      if (!parentNode) break;
      parentId = parentNode.parentId;
    }
  }

  const groups = new Map<string, KnowledgeNode[]>();
  for (const node of workingNodes) {
    const key = `${node.subject}::${node.parentId || 'root'}`;
    const group = groups.get(key);
    if (group) {
      group.push(node);
    } else {
      groups.set(key, [node]);
    }
  }

  for (const group of groups.values()) {
    group.sort((left, right) => {
      const leftOrder = Number.isFinite(left.order) ? left.order : Number.MAX_SAFE_INTEGER;
      const rightOrder = Number.isFinite(right.order) ? right.order : Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
      const nameDiff = left.name.localeCompare(right.name);
      if (nameDiff !== 0) return nameDiff;
      return left.id.localeCompare(right.id);
    });

    const siblingNameCounts = new Map<string, number>();
    group.forEach((node, index) => {
      const baseName = normalizeText(node.name) || UNTITLED_NODE_NAME;
      const normalizedKey = baseName.toLowerCase();
      const currentCount = (siblingNameCounts.get(normalizedKey) || 0) + 1;
      siblingNameCounts.set(normalizedKey, currentCount);

      const nextName = currentCount === 1 ? baseName : `${baseName} (${currentCount})`;
      if (currentCount > 1) {
        report.duplicateSiblingNameCount += 1;
      }
      if (node.name !== nextName) {
        node.name = nextName;
        report.renamedNodeCount += 1;
      }

      const expectedOrder = index + 1;
      if (node.order !== expectedOrder) {
        node.order = expectedOrder;
        report.normalizedOrderCount += 1;
      }
    });
  }

  for (const node of workingNodes) {
    const nextKind = inferKnowledgeNodeKind(node, workingNodes);
    if (node.kind !== nextKind) {
      node.kind = nextKind;
      report.kindNormalizedCount += 1;
    }
  }

  return {
    nodes: workingNodes,
    report,
  };
}

export function getGraphIntegrityReport(nodes: KnowledgeNode[]): GraphIntegrityReport {
  return normalizeKnowledgeNodes(nodes).report;
}

export function getGraphIntegrityIssueCount(report: GraphIntegrityReport): number {
  return (
    report.orphanParentCount +
    report.crossSubjectParentCount +
    report.selfParentCount +
    report.cycleBreakCount +
    report.duplicateSiblingNameCount +
    report.duplicateIdCount
  );
}
