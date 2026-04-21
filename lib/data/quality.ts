import { KnowledgeNode, Memory } from '../types';

export interface MemoryQualityResult {
  score: number;
  flags: string[];
}

export const MEMORY_QUALITY_RULE_VERSION = 1;

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
  missingWrongAnswer: 10,
  missingErrorReason: 18,
  missingVocabMeaning: 12,
  missingVocabUsage: 6,
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
}

const UNTITLED_NODE_NAME = 'Untitled Node';

function normalizeText(text?: string): string {
  return (text || '').replace(/\s+/g, ' ').trim();
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
  };
}

export function evaluateMemoryQuality(input: Partial<Memory>): MemoryQualityResult {
  const content = normalizeText(input.content);
  const subject = normalizeText(input.subject);
  const functionType = normalizeText(input.functionType);
  const purposeType = normalizeText(input.purposeType);
  const nodeIds = input.knowledgeNodeIds || [];
  const sourceResourceIds = input.sourceResourceIds || [];
  const flags: string[] = [];
  let score = 100;

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

  if (input.isMistake) {
    if (!normalizeText(input.wrongAnswer)) {
      score -= MEMORY_QUALITY_PENALTIES.missingWrongAnswer;
      flags.push('missing_wrong_answer');
    }
    if (!normalizeText(input.errorReason)) {
      score -= MEMORY_QUALITY_PENALTIES.missingErrorReason;
      flags.push('missing_error_reason');
    }
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
