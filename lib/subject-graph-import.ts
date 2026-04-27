import biologySeed from './data/subject-graph-seeds/biology_knowledge.json';
import chemistrySeed from './data/subject-graph-seeds/chemistry_knowledge.json';
import chineseSeed from './data/subject-graph-seeds/chinese_knowledge.json';
import englishSeed from './data/subject-graph-seeds/english_knowledge.json';
import mathSeed from './data/subject-graph-seeds/math_knowledge.json';
import physicsSeed from './data/subject-graph-seeds/physics_knowledge.json';
import type { KnowledgeNode, Subject } from './types';

type RawSubjectGraphNode = {
  id?: string | number;
  parentId?: string | number | null;
  title?: string;
  href?: string;
  treeType?: number;
  isKnowledge?: number;
  bankId?: string | number;
  children?: RawSubjectGraphNode[];
};

type RawSubjectGraphSeedFile = {
  bankId?: string | number;
  subject?: string;
  tree?: RawSubjectGraphNode[];
};

type SourceStatus = 'supported' | 'duplicate';
export type SubjectGraphImportMode = 'fill_missing' | 'rebuild_subject';

export interface SubjectGraphSeedSourceSummary {
  fileName: string;
  resolvedSubject: Subject | null;
  status: SourceStatus;
  reason: string;
  bankId: string;
  validNodeCount: number;
  filteredNodeCount: number;
  skippedReasonCounts: Record<string, number>;
}

export interface SubjectGraphImportOverview {
  availableSubjects: Subject[];
  missingSubjects: Subject[];
  supportedSources: SubjectGraphSeedSourceSummary[];
  skippedSources: SubjectGraphSeedSourceSummary[];
}

export interface SubjectGraphImportPlan {
  subject: Subject;
  mode: SubjectGraphImportMode;
  sourceFileName?: string;
  sourceBankId?: string;
  missingSource: boolean;
  nodes: KnowledgeNode[];
  nodesToAdd: KnowledgeNode[];
  totalSeedNodeCount: number;
  filteredNodeCount: number;
  addedCount: number;
  skippedCount: number;
  skippedReasonCounts: Record<string, number>;
  invalidSources: Array<{ fileName: string; reason: string }>;
}

export interface SubjectGraphMigrationPlan {
  version: string;
  plans: SubjectGraphImportPlan[];
  nodesToAdd: KnowledgeNode[];
  addedCount: number;
  missingSubjects: Subject[];
  invalidSources: Array<{ fileName: string; reason: string }>;
}

interface SubjectGraphSourceDefinition {
  fileName: string;
  resolvedSubject: Subject | null;
  status: SourceStatus;
  reason: string;
  data: RawSubjectGraphSeedFile;
}

interface ConvertedSubjectGraphSource extends SubjectGraphSeedSourceSummary {
  nodes: KnowledgeNode[];
}

const APP_SUBJECTS: Subject[] = ['语文', '数学', '英语', '物理', '化学', '生物'];

export const SUBJECT_GRAPH_SEED_VERSION = 'subject-graph-seed-2026-04-24-v1';

const SOURCE_DEFINITIONS: SubjectGraphSourceDefinition[] = [
  {
    fileName: 'math_knowledge.json',
    resolvedSubject: '数学',
    status: 'supported',
    reason: '识别为数学主树，作为数学导图种子导入。',
    data: mathSeed as RawSubjectGraphSeedFile,
  },
  {
    fileName: 'english_knowledge.json',
    resolvedSubject: '英语',
    status: 'supported',
    reason: '识别为英语主树，作为英语导图种子导入。',
    data: englishSeed as RawSubjectGraphSeedFile,
  },
  {
    fileName: 'physics_knowledge.json',
    resolvedSubject: '物理',
    status: 'supported',
    reason: '识别为物理主树，作为物理导图种子导入。',
    data: physicsSeed as RawSubjectGraphSeedFile,
  },
  {
    fileName: 'chemistry_knowledge.json',
    resolvedSubject: '化学',
    status: 'supported',
    reason: '识别为化学主树，作为化学导图种子导入。',
    data: chemistrySeed as RawSubjectGraphSeedFile,
  },
  {
    fileName: 'biology_knowledge.json',
    resolvedSubject: '生物',
    status: 'supported',
    reason: '识别为生物主树，作为生物导图种子导入。',
    data: biologySeed as RawSubjectGraphSeedFile,
  },
  {
    fileName: 'chinese_knowledge.json',
    resolvedSubject: null,
    status: 'duplicate',
    reason: '内容识别为物理重复源，当前不作为语文导图导入；语文仍缺少有效种子。',
    data: chineseSeed as RawSubjectGraphSeedFile,
  },
];

function normalizeBankId(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) return value.trim();
  return 'unknown';
}

function buildStableSeedId(subject: Subject, bankId: string, sourceNodeId: string): string {
  return `seed:${subject}:${bankId}:${sourceNodeId}`;
}

function withCount(reasonCounts: Record<string, number>, reason: string): void {
  reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
}

function convertSource(definition: SubjectGraphSourceDefinition): ConvertedSubjectGraphSource {
  const bankId = normalizeBankId(definition.data.bankId);
  if (!definition.resolvedSubject || definition.status !== 'supported') {
    return {
      fileName: definition.fileName,
      resolvedSubject: definition.resolvedSubject,
      status: definition.status,
      reason: definition.reason,
      bankId,
      validNodeCount: 0,
      filteredNodeCount: 0,
      skippedReasonCounts: {},
      nodes: [],
    };
  }

  const subject = definition.resolvedSubject;
  const nodes: KnowledgeNode[] = [];
  const skippedReasonCounts: Record<string, number> = {};

  const walk = (rawNodes: RawSubjectGraphNode[] | undefined, parentId: string | null) => {
    let siblingOrder = 0;

    for (const rawNode of rawNodes || []) {
      const treeType = Number(rawNode.treeType);
      const isKnowledge = Number(rawNode.isKnowledge);
      const title = typeof rawNode.title === 'string' ? rawNode.title.trim() : '';
      const href = typeof rawNode.href === 'string' ? rawNode.href.trim() : '';

      if (treeType === 4 || treeType === 5) {
        withCount(skippedReasonCounts, 'experimental_branch');
        continue;
      }

      if (rawNode.isKnowledge === 0) {
        withCount(skippedReasonCounts, 'non_knowledge_branch');
        continue;
      }

      const canCreateNode = treeType === 1 && isKnowledge === 1 && title.length > 0 && href.length > 0;
      let nextParentId = parentId;

      if (canCreateNode) {
        siblingOrder += 1;
        const sourceNodeId = String(rawNode.id ?? `${nodes.length + 1}`);
        const stableId = buildStableSeedId(subject, bankId, sourceNodeId);
        nodes.push({
          id: stableId,
          subject,
          name: title,
          parentId,
          order: siblingOrder,
          dataSource: 'import',
        });
        nextParentId = stableId;
      } else {
        if (treeType === 1 && isKnowledge === 1 && title.length === 0) {
          withCount(skippedReasonCounts, 'empty_title');
        } else if (treeType === 1 && isKnowledge === 1 && href.length === 0) {
          withCount(skippedReasonCounts, 'empty_href');
        }
      }

      walk(rawNode.children, nextParentId);
    }
  };

  walk(definition.data.tree, null);

  const filteredNodeCount = Object.values(skippedReasonCounts).reduce((sum, count) => sum + count, 0);
  return {
    fileName: definition.fileName,
    resolvedSubject: definition.resolvedSubject,
    status: definition.status,
    reason: definition.reason,
    bankId,
    validNodeCount: nodes.length,
    filteredNodeCount,
    skippedReasonCounts,
    nodes,
  };
}

const CONVERTED_SOURCES = SOURCE_DEFINITIONS.map(convertSource);
const SUPPORTED_SOURCES = CONVERTED_SOURCES.filter(
  (source): source is ConvertedSubjectGraphSource & { resolvedSubject: Subject } =>
    source.status === 'supported' && !!source.resolvedSubject
);
const SOURCE_BY_SUBJECT = new Map<Subject, ConvertedSubjectGraphSource & { resolvedSubject: Subject }>(
  SUPPORTED_SOURCES.map((source) => [source.resolvedSubject, source])
);

export const SUBJECT_GRAPH_IMPORT_OVERVIEW: SubjectGraphImportOverview = {
  availableSubjects: SUPPORTED_SOURCES.map((source) => source.resolvedSubject),
  missingSubjects: APP_SUBJECTS.filter((subject) => !SOURCE_BY_SUBJECT.has(subject)),
  supportedSources: SUPPORTED_SOURCES.map(({ nodes: _nodes, ...summary }) => summary),
  skippedSources: CONVERTED_SOURCES.filter((source) => source.status !== 'supported').map(({ nodes: _nodes, ...summary }) => summary),
};

export function getSubjectGraphImportOverview(): SubjectGraphImportOverview {
  return SUBJECT_GRAPH_IMPORT_OVERVIEW;
}

function cloneSeedNodes(nodes: KnowledgeNode[]): KnowledgeNode[] {
  const now = Date.now();
  return nodes.map((node) => ({
    ...node,
    updatedAt: now,
  }));
}

export function getSubjectGraphSeedSubjects(): Subject[] {
  return SUBJECT_GRAPH_IMPORT_OVERVIEW.availableSubjects;
}

export function buildSubjectGraphImportPlan(
  existingNodes: KnowledgeNode[],
  subject: Subject,
  mode: SubjectGraphImportMode
): SubjectGraphImportPlan {
  const source = SOURCE_BY_SUBJECT.get(subject);
  const invalidSources = SUBJECT_GRAPH_IMPORT_OVERVIEW.skippedSources.map((item) => ({
    fileName: item.fileName,
    reason: item.reason,
  }));

  if (!source) {
    return {
      subject,
      mode,
      missingSource: true,
      nodes: [],
      nodesToAdd: [],
      totalSeedNodeCount: 0,
      filteredNodeCount: 0,
      addedCount: 0,
      skippedCount: 0,
      skippedReasonCounts: { missing_source: 1 },
      invalidSources,
    };
  }

  const nodes = cloneSeedNodes(source.nodes);
  const existingNodeIds = new Set(existingNodes.map((node) => node.id));
  const nodesToAdd = mode === 'fill_missing' ? nodes.filter((node) => !existingNodeIds.has(node.id)) : nodes;
  const existingDuplicateCount = mode === 'fill_missing' ? nodes.length - nodesToAdd.length : 0;
  const skippedReasonCounts = {
    ...source.skippedReasonCounts,
    ...(existingDuplicateCount > 0 ? { existing_seed_node: existingDuplicateCount } : {}),
  };

  return {
    subject,
    mode,
    sourceFileName: source.fileName,
    sourceBankId: source.bankId,
    missingSource: false,
    nodes,
    nodesToAdd,
    totalSeedNodeCount: nodes.length,
    filteredNodeCount: source.filteredNodeCount,
    addedCount: nodesToAdd.length,
    skippedCount: source.filteredNodeCount + existingDuplicateCount,
    skippedReasonCounts,
    invalidSources,
  };
}

export function buildSubjectGraphMigrationPlan(existingNodes: KnowledgeNode[]): SubjectGraphMigrationPlan {
  const plans = getSubjectGraphSeedSubjects().map((subject) =>
    buildSubjectGraphImportPlan(existingNodes, subject, 'fill_missing')
  );

  return {
    version: SUBJECT_GRAPH_SEED_VERSION,
    plans,
    nodesToAdd: plans.flatMap((plan) => plan.nodesToAdd),
    addedCount: plans.reduce((sum, plan) => sum + plan.addedCount, 0),
    missingSubjects: SUBJECT_GRAPH_IMPORT_OVERVIEW.missingSubjects,
    invalidSources: SUBJECT_GRAPH_IMPORT_OVERVIEW.skippedSources.map((item) => ({
      fileName: item.fileName,
      reason: item.reason,
    })),
  };
}

export function getSubjectGraphImportModeLabel(mode: SubjectGraphImportMode): string {
  return mode === 'fill_missing' ? '仅补缺' : '整科重建';
}
