'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  Check,
  CheckCircle2,
  Gauge,
  History,
  KeyRound,
  Layers3,
  Loader2,
  ScanLine,
  Sparkles,
  Trash2,
  UploadCloud,
  WifiOff,
  Wand2,
} from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { clsx } from 'clsx';
import { v4 as uuidv4 } from 'uuid';

import { useAppContext } from '@/lib/store';
import { inferModelProvider, parseNotes, resolveAIPresetSettings } from '@/lib/ai';
import { getInitialFSRSData } from '@/lib/fsrs';
import { createMemoryPayload } from '@/lib/data/commands';
import { buildKnowledgeNodePath, formatKnowledgeNodePath, inferKnowledgeNodeKind, isAttachableKnowledgeNode, isFormalMemoryEligible } from '@/lib/data/quality';
import { FEEDBACK_QUICK_TAGS, getAutoExpireAt } from '@/lib/feedback';
import { normalizeInputHistoryItem, normalizeInputHistoryWorkflow } from '@/lib/input-history';
import { GraphScope, InputHistoryItem, IngestionMode, KnowledgeNode, Memory, UserFeedbackEvent } from '@/lib/types';
import { ModelSelector } from '@/components/ModelSelector';
import { ImageAnnotator, ImageAnnotation } from '@/components/ImageAnnotator';

type DraftAsset = {
  resourceId: string;
  name: string;
  preview: string;
  annotatedPreview?: string;
  visualAnnotations?: ImageAnnotation[];
  type: string;
  size: number;
};

type ManualHighlightKind = 'mistake' | 'memory' | 'explain' | 'focus' | 'custom';

type ManualHighlight = {
  id: string;
  scope: 'text' | 'image';
  kind: ManualHighlightKind;
  resourceId?: string;
  note: string;
  customLabel?: string;
};

type ReviewItem = {
  content: string;
  type?: 'concept' | 'qa' | 'vocabulary';
  questionNo?: string;
  questionType?: string;
  studentAnswer?: string;
  correctAnswer?: string;
  notes?: string;
  nodeIds?: string[];
  isMistake?: boolean;
  wrongAnswer?: string;
  confidence?: number;
  needsConfirmation?: boolean;
  conflict?: boolean;
  errorReason?: string;
  errorReasonCategory?: string;
  evidence?: {
    sourceText?: string;
    locationHint?: string;
    keySentence?: string;
  };
  optionAnalysis?: Record<string, string>;
  learningTask?: string;
  transferExercises?: string[];
  memoryCard?: {
    front?: string;
    back?: string;
  };
  reviewPriority?: 'high' | 'medium' | 'low' | 'summary_only';
  vocabularyData?: {
    meaning?: string;
    usage?: string;
    context?: string;
    mnemonics?: string;
    synonyms?: string[];
    originalSentence?: string;
    confusions?: string[];
  };
  visualDescription?: string;
  functionType?: string;
  purposeType?: string;
  source?: string;
  region?: string;
};

type PendingReview = {
  id: string;
  workflow: IngestionMode;
  parsedItems: ReviewItem[];
  resourceIds: string[];
  newNodes: any[];
  deletedNodeIds: string[];
  aiAnalysis: string;
  identifiedSubject: string;
  options: Record<string, unknown>;
};

type ParseErrorCategory = 'network' | 'auth' | 'rate_limit' | 'unknown';

type TaskDiagnostic = {
  category: ParseErrorCategory;
  title: string;
  hint: string;
  retryable: boolean;
};

type AnchorPreview = {
  itemIndex: number;
  status: 'ok' | 'blocked';
  nodeIds: string[];
  path: string;
  note: string;
  reason?: string;
  createdNodes: KnowledgeNode[];
};

type AnchoringPlan = {
  items: ReviewItem[];
  previews: AnchorPreview[];
  nodesToCreate: KnowledgeNode[];
};

type WorkflowMeta = {
  label: string;
  subtitle: string;
  icon: typeof Wand2;
  accent: string;
  hint: string;
};

const WORKFLOW_META: Record<IngestionMode, WorkflowMeta> = {
  quick: {
    label: '常规快速录入',
    subtitle: '文本为主，适合知识点、错因、方法论快速入库',
    icon: Sparkles,
    accent: 'emerald',
    hint: '优先少步骤、快整理，适合零散笔记和口述补充。',
  },
  image_pro: {
    label: '图片专业处理',
    subtitle: '保留批注语义，强化图像清晰度与题目拆分',
    icon: ScanLine,
    accent: 'amber',
    hint: '适合拍照错题、作业批注、手写笔记和需要精准保留视觉信息的材料。',
  },
  exam: {
    label: '整卷分析',
    subtitle: '针对试卷、答题卡和整套资料做系统拆解',
    icon: Layers3,
    accent: 'indigo',
    hint: '适合整页、多题场景，会更关注分布、薄弱点和高频考法。',
  },
};

const DEFAULT_FUNCTIONS = ['细碎记忆', '方法论', '关联型记忆', '系统型'];
const DEFAULT_PURPOSES = ['记忆型', '内化型', '补充知识型', '系统型'];
const MANUAL_HIGHLIGHT_ORDER: ManualHighlightKind[] = ['mistake', 'memory', 'explain', 'focus', 'custom'];
const MANUAL_HIGHLIGHT_META: Record<
  ManualHighlightKind,
  { label: string; shortLabel: string; badgeClass: string; placeholder: string; promptLabel: string }
> = {
  mistake: {
    label: '错题',
    shortLabel: '错题',
    badgeClass: 'border-rose-500/30 bg-rose-500/10 text-rose-200',
    placeholder: '补充错题位置或范围，例如：第34题、左上角红叉题',
    promptLabel: '错题',
  },
  memory: {
    label: '添加记忆',
    shortLabel: '记忆',
    badgeClass: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
    placeholder: '补充要记住的内容，例如：定义、结论、易混点',
    promptLabel: '加入记忆',
  },
  explain: {
    label: '需要解释',
    shortLabel: '解释',
    badgeClass: 'border-amber-500/30 bg-amber-500/10 text-amber-100',
    placeholder: '补充需要讲解的点，例如：为什么选 C、这一步怎么推',
    promptLabel: '需要解释',
  },
  focus: {
    label: '重点',
    shortLabel: '重点',
    badgeClass: 'border-sky-500/30 bg-sky-500/10 text-sky-100',
    placeholder: '补充重点区域，例如：第二段定义、图中公式、圈出的单词',
    promptLabel: '重点',
  },
  custom: {
    label: '自定义',
    shortLabel: '自定义',
    badgeClass: 'border-violet-500/30 bg-violet-500/10 text-violet-100',
    placeholder: '输入自定义标注说明，例如：保留原题、只做翻译、关注批改语气',
    promptLabel: '自定义',
  },
};

const INGESTION_TEMPLATES: Array<{
  id: string;
  label: string;
  workflow: IngestionMode;
  seedInput: string;
  supplementaryInstruction: string;
}> = [
  {
    id: 'mistake-fast',
    label: '错题录入',
    workflow: 'image_pro',
    seedInput: '题目：\n我的答案：\n正确答案：\n错因：',
    supplementaryInstruction: '优先提取错题、错误原因和对应知识点，输出可直接复习的记忆项。',
  },
  {
    id: 'exam-analysis',
    label: '整卷分析',
    workflow: 'exam',
    seedInput: '请按整卷视角分析：题型分布、薄弱点、优先复习顺序。',
    supplementaryInstruction: '请对整套资料做结构化分析，输出薄弱知识点与一周复习优先级建议。',
  },
  {
    id: 'vocab-extract',
    label: '单词提取',
    workflow: 'image_pro',
    seedInput: '请提取图片/文本中的生词或短语，并给出 context/meaning/usage/mnemonics。',
    supplementaryInstruction: '仅输出高价值词汇，避免泛化；优先保留用户手写标注和下划线词。',
  },
];

const FEEDBACK_RULE_HELPFUL = '最近反馈：解析结果有用。保持结构化分点、结论先行、可直接复习。';
const FEEDBACK_RULE_INACCURATE = '最近反馈：解析结果不准。减少猜测，证据不足时明确标注不确定并列出待确认项。';

function createFeedbackEvent(
  partial: Omit<UserFeedbackEvent, 'id' | 'timestamp'>
): UserFeedbackEvent {
  return {
    id: uuidv4(),
    timestamp: Date.now(),
    ...partial,
  };
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function modeBadgeClass(mode: IngestionMode, active: boolean) {
  if (!active) return 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200';

  if (mode === 'quick') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
  if (mode === 'image_pro') return 'border-amber-500/30 bg-amber-500/10 text-amber-200';
  return 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200';
}

async function enhanceDocumentImage(base64: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      const maxDimension = 2400;
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        
        let factor = 1.0;
        if (lum > 130) {
          factor = 1.35;
        } else if (lum < 110) {
          factor = 0.95;
        }

        data[i] = Math.max(0, Math.min(255, (r - 128) * factor + 128 + 15));
        data[i + 1] = Math.max(0, Math.min(255, (g - 128) * factor + 128 + 15));
        data[i + 2] = Math.max(0, Math.min(255, (b - 128) * factor + 128 + 15));

        const gray = lum;
        data[i] = gray + 1.2 * (data[i] - gray);
        data[i+1] = gray + 1.2 * (data[i+1] - gray);
        data[i+2] = gray + 1.2 * (data[i+2] - gray);
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.9));
    };

    img.onerror = () => resolve(base64);
    img.src = base64;
  });
}

function buildWorkflowInstruction(
  workflow: IngestionMode,
  options: Record<string, boolean>,
  supplementaryInstruction: string
) {
  const lines: string[] = [];
  if (workflow === 'quick') lines.push('【常规快速录入】优先快速拆解为准确、可复习的独立记忆项，避免冗长总结。');
  if (workflow === 'image_pro') {
    lines.push('【图片专业处理】重点保留批注、手写标记、题干边界、错因线索与视觉上下文。');
    if (options.enhanceImage) lines.push('- 已启用图片增强，请优先利用清晰度提升后的细节。');
    if (options.preserveAnnotations) lines.push('- 请把用户的圈点、箭头、问号、打叉等视觉标记作为高优先级信号。');
    if (options.splitQuestions) lines.push('- 若一张图中包含多题，请按题目边界自动拆分。');
    if (options.extractVocabulary) lines.push('- 对英语或语言类材料中的标注词汇，优先提取为 vocabulary。');
  }
  if (workflow === 'exam') lines.push('【整卷分析】请从整套材料中提取错题、薄弱知识点、常考题型和高频失误。');
  if (supplementaryInstruction.trim()) lines.push(`【用户补充说明】${supplementaryInstruction.trim()}`);
  return lines.join('\n');
}

function pickPrimaryPreview(assets: DraftAsset[]) {
  return assets.find((asset) => asset.type.startsWith('image/'))?.preview || assets[0]?.preview;
}

function toDisplayText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(toDisplayText).filter(Boolean).join('\n').trim();
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'content', 'analysisProcess', 'analysis', 'message', 'value']) {
      if (key in record) {
        const normalized = toDisplayText(record[key]);
        if (normalized) return normalized;
      }
    }
    const flattened = Object.values(record).map(toDisplayText).filter(Boolean);
    if (flattened.length > 0) return flattened.join('\n').trim();
    try { return JSON.stringify(value); } catch { return ''; }
  }
  return '';
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => toStringArray(entry));
  const normalized = toDisplayText(value);
  return normalized ? [normalized] : [];
}

function normalizeConfidenceValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value <= 1 ? Math.round(value * 100) : Math.round(value);
  if (typeof value === 'string') {
    const parsed = Number(value.replace('%', '').trim());
    if (Number.isFinite(parsed)) return parsed <= 1 ? Math.round(parsed * 100) : Math.round(parsed);
  }
  return undefined;
}

function normalizeStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => [key.trim(), toDisplayText(val)] as const)
    .filter(([key, val]) => key.length > 0 && val.length > 0);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeEvidence(value: unknown): ReviewItem['evidence'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const evidence = {
    sourceText: toDisplayText(record.sourceText) || undefined,
    locationHint: toDisplayText(record.locationHint) || undefined,
    keySentence: toDisplayText(record.keySentence) || undefined,
  };
  return evidence.sourceText || evidence.locationHint || evidence.keySentence ? evidence : undefined;
}

function normalizeMemoryCard(value: unknown): ReviewItem['memoryCard'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const card = {
    front: toDisplayText(record.front) || undefined,
    back: toDisplayText(record.back) || undefined,
  };
  return card.front || card.back ? card : undefined;
}

function normalizeReviewPriority(value: unknown): ReviewItem['reviewPriority'] | undefined {
  const normalized = toDisplayText(value).toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low' || normalized === 'summary_only') {
    return normalized;
  }
  return undefined;
}

function normalizeVocabularyDetails(value: unknown): ReviewItem['vocabularyData'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const normalized = {
    meaning: toDisplayText(record.meaning) || undefined,
    usage: toDisplayText(record.usage) || undefined,
    context: toDisplayText(record.context) || undefined,
    mnemonics: toDisplayText(record.mnemonics) || undefined,
    synonyms: Array.from(new Set(toStringArray(record.synonyms))),
    originalSentence: toDisplayText(record.originalSentence) || undefined,
    confusions: Array.from(new Set(toStringArray(record.confusions))),
  };
  return (
    normalized.meaning ||
    normalized.usage ||
    normalized.context ||
    normalized.mnemonics ||
    normalized.synonyms.length > 0 ||
    normalized.originalSentence ||
    normalized.confusions.length > 0
  )
    ? normalized
    : undefined;
}

function normalizeReviewItem(value: unknown): ReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { content: toDisplayText(value) || '未命名内容' };
  const record = value as Record<string, unknown>;
  const type = record.type === 'concept' || record.type === 'qa' || record.type === 'vocabulary' ? record.type : undefined;
  return {
    content: toDisplayText(record.content) || toDisplayText(record.notes) || toDisplayText(record.correctAnswer) || '未命名内容',
    type,
    questionNo: toDisplayText(record.questionNo) || undefined,
    questionType: toDisplayText(record.questionType) || undefined,
    studentAnswer: toDisplayText(record.studentAnswer) || undefined,
    correctAnswer: toDisplayText(record.correctAnswer) || undefined,
    notes: toDisplayText(record.notes) || undefined,
    nodeIds: Array.from(new Set(toStringArray(record.nodeIds))),
    isMistake: record.isMistake === true || toDisplayText(record.isMistake).toLowerCase() === 'true',
    wrongAnswer: toDisplayText(record.wrongAnswer) || undefined,
    confidence: normalizeConfidenceValue(record.confidence),
    needsConfirmation: record.needsConfirmation === true || toDisplayText(record.needsConfirmation).toLowerCase() === 'true',
    conflict: record.conflict === true || toDisplayText(record.conflict).toLowerCase() === 'true',
    errorReason: toDisplayText(record.errorReason) || undefined,
    errorReasonCategory: toDisplayText(record.errorReasonCategory) || undefined,
    evidence: normalizeEvidence(record.evidence),
    optionAnalysis: normalizeStringRecord(record.optionAnalysis),
    learningTask: toDisplayText(record.learningTask) || undefined,
    transferExercises: Array.from(new Set(toStringArray(record.transferExercises))),
    memoryCard: normalizeMemoryCard(record.memoryCard),
    reviewPriority: normalizeReviewPriority(record.reviewPriority),
    vocabularyData: normalizeVocabularyDetails(record.vocabularyData),
    visualDescription: toDisplayText(record.visualDescription) || undefined,
    functionType: toDisplayText(record.functionType) || undefined,
    purposeType: toDisplayText(record.purposeType) || undefined,
    source: toDisplayText(record.source) || undefined,
    region: toDisplayText(record.region) || undefined,
  };
}

function normalizePendingReviewState(review: any, fallbackSubject: string): PendingReview {
  const parsedItems = (Array.isArray(review.parsedItems) ? review.parsedItems : [])
    .map((item: unknown) => normalizeReviewItem(item))
    .filter((item: ReviewItem) => Boolean(item.content));
  return {
    id: review.id,
    workflow: review.workflow,
    parsedItems,
    resourceIds: Array.from(new Set(toStringArray(review.resourceIds))),
    newNodes: Array.isArray(review.newNodes) ? review.newNodes : [],
    deletedNodeIds: Array.from(new Set(toStringArray(review.deletedNodeIds))),
    aiAnalysis: toDisplayText(review.aiAnalysis),
    identifiedSubject: toDisplayText(review.identifiedSubject) || fallbackSubject,
    options: review.options || {},
  };
}

function evaluateReviewItemForSave(args: {
  item: ReviewItem;
  pendingReview: PendingReview;
  subject: string;
  explicitFunction: string;
  explicitPurpose: string;
  markAsMistake: boolean;
  now: number;
}): { memory: Memory | null; score: number; flags: string[]; eligible: boolean } {
  const { item, pendingReview, subject, explicitFunction, explicitPurpose, markAsMistake, now } = args;
  const isMistake = item.isMistake || markAsMistake;
  const payload = {
    id: uuidv4(),
    subject,
    content: item.content,
    correctAnswer: item.correctAnswer,
    questionNo: item.questionNo,
    questionType: item.questionType,
    studentAnswer: item.studentAnswer,
    source: item.source,
    sourceResourceIds: pendingReview.resourceIds,
    region: item.region,
    notes: item.notes,
    functionType: explicitFunction !== 'auto' ? explicitFunction : item.functionType || DEFAULT_FUNCTIONS[0],
    purposeType: explicitPurpose !== 'auto' ? explicitPurpose : item.purposeType || DEFAULT_PURPOSES[0],
    knowledgeNodeIds: item.nodeIds || [],
    confidence: item.confidence ?? 50,
    mastery: 0,
    createdAt: now,
    updatedAt: now,
    sourceType: 'text' as const,
    isMistake,
    wrongAnswer: item.wrongAnswer || item.studentAnswer,
    errorReason: item.errorReason,
    visualDescription: item.visualDescription,
    analysisProcess: pendingReview.aiAnalysis,
    needsConfirmation: item.needsConfirmation,
    conflict: item.conflict,
    errorReasonCategory: item.errorReasonCategory,
    evidence: item.evidence,
    optionAnalysis: item.optionAnalysis,
    learningTask: item.learningTask,
    transferExercises: item.transferExercises,
    memoryCard: item.memoryCard,
    reviewPriority: item.reviewPriority,
    fsrs: item.reviewPriority === 'summary_only' ? undefined : getInitialFSRSData(),
    type: item.type,
    vocabularyData: item.vocabularyData,
    dataSource: 'ai_parse' as const,
    ingestionMode: pendingReview.workflow,
    ingestionSessionId: pendingReview.id,
  };

  const result = createMemoryPayload(payload);
  if (!result.ok) {
    return { memory: null, score: 0, flags: ['invalid_payload'], eligible: false };
  }

  const quality = {
    score: result.value.qualityScore ?? 0,
    flags: result.value.qualityFlags || [],
  };
  const eligible = item.reviewPriority !== 'summary_only' && isFormalMemoryEligible(result.value, quality);
  return { memory: result.value, score: quality.score, flags: quality.flags, eligible };
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function classifyTaskError(error: unknown): TaskDiagnostic {
  const message = String((error as any)?.message || error || '').toLowerCase();

  if (
    message.includes('api key') ||
    message.includes('unauthorized') ||
    message.includes('invalid key') ||
    message.includes('401') ||
    message.includes('403')
  ) {
    return {
      category: 'auth',
      title: '密钥或权限异常',
      hint: '请检查当前解析模型对应的 API Key、供应商配置及权限范围。',
      retryable: false,
    };
  }

  if (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('quota') ||
    message.includes('429')
  ) {
    return {
      category: 'rate_limit',
      title: '请求限流',
      hint: '请求过于频繁或额度不足。系统会自动退避重试，建议稍后再试。',
      retryable: true,
    };
  }

  if (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('econn') ||
    message.includes('dns')
  ) {
    return {
      category: 'network',
      title: '网络连接异常',
      hint: '网络不稳定或上游服务不可达。系统会自动重试；若持续失败请检查网络。',
      retryable: true,
    };
  }

  return {
    category: 'unknown',
    title: '未知错误',
    hint: '建议先重试一次；若持续失败，请查看日志并检查模型与输入内容。',
    retryable: false,
  };
}

function appendFeedbackLearningNotes(existing: string | undefined, mode: 'helpful' | 'inaccurate') {
  const rule = mode === 'helpful' ? FEEDBACK_RULE_HELPFUL : FEEDBACK_RULE_INACCURATE;
  const lines = (existing || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.includes(rule)) {
    lines.unshift(rule);
  }
  return lines.slice(0, 6).join('\n');
}

function normalizeNodeName(value: string) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function deriveAnchorName(item: ReviewItem) {
  const base =
    item.learningTask ||
    item.questionType ||
    item.questionNo ||
    item.content ||
    item.notes ||
    '待细化知识点';
  return base.replace(/\s+/g, ' ').trim().slice(0, 24) || '待细化知识点';
}

function inferAnchorLeafKind(item: ReviewItem) {
  const text = [item.functionType, item.purposeType, item.learningTask, item.content, item.notes].filter(Boolean).join(' ');
  return /方法|解题|步骤|策略|技巧|模型|套路/.test(text) ? 'method' : 'knowledge';
}

function makeChildNode(parent: KnowledgeNode, name: string, nodes: KnowledgeNode[], subject: string): KnowledgeNode {
  const siblings = nodes.filter((node) => node.subject === subject && node.parentId === parent.id);
  return {
    id: uuidv4(),
    subject,
    name,
    parentId: parent.id,
    order: siblings.length + 1,
    kind: inferKnowledgeNodeKind({ id: uuidv4(), subject, name, parentId: parent.id, order: siblings.length + 1 }, [...nodes]),
    dataSource: 'ai_parse',
    status: 'active',
    version: 1,
    updatedAt: Date.now(),
  };
}

function ensureAttachableNodeUnderParent(args: {
  parent: KnowledgeNode;
  item: ReviewItem;
  subject: string;
  nodes: KnowledgeNode[];
  createdNodes: KnowledgeNode[];
}): { node: KnowledgeNode | null; createdNodes: KnowledgeNode[]; note: string } {
  const { parent, item, subject } = args;
  let nodes = [...args.nodes, ...args.createdNodes];
  const createdNodes = [...args.createdNodes];
  const targetKind = inferAnchorLeafKind(item);
  let current = parent;
  let currentKind = current.kind || inferKnowledgeNodeKind(current, nodes);
  const baseName = deriveAnchorName(item);

  if (currentKind === 'knowledge' || currentKind === 'method') {
    return { node: current, createdNodes, note: '复用当前可挂载节点' };
  }

  const descendants = nodes.filter((node) => buildKnowledgeNodePath(nodes, node.id).some((pathNode) => pathNode.id === parent.id));
  const sameNameLeaf = descendants.find(
    (node) =>
      isAttachableKnowledgeNode(node, nodes) &&
      (normalizeNodeName(baseName).includes(normalizeNodeName(node.name)) || normalizeNodeName(node.name).includes(normalizeNodeName(baseName)))
  );
  if (sameNameLeaf) {
    return { node: sameNameLeaf, createdNodes, note: '复用当前子树同名叶子节点' };
  }

  while (currentKind !== 'knowledge' && currentKind !== 'method') {
    const nextName =
      currentKind === 'root'
        ? item.region || item.functionType || '综合模块'
        : currentKind === 'module'
          ? item.questionType || item.purposeType || '待细分主题'
          : targetKind === 'method'
            ? `${baseName}方法`
            : baseName;
    const existing = nodes.find(
      (node) =>
        node.subject === subject &&
        node.parentId === current.id &&
        normalizeNodeName(node.name) === normalizeNodeName(nextName)
    );
    const child = existing || makeChildNode(current, nextName, nodes, subject);
    if (!existing) {
      createdNodes.push(child);
      nodes = [...nodes, child];
    }
    current = child;
    currentKind = current.kind || inferKnowledgeNodeKind(current, nodes);
  }

  return {
    node: current,
    createdNodes,
    note: createdNodes.length > args.createdNodes.length ? '已自动补齐中间层级' : '复用已有层级',
  };
}

function buildAnchoringPlan(args: {
  pendingReview: PendingReview;
  currentNodes: KnowledgeNode[];
  activeScope: GraphScope;
}): AnchoringPlan {
  const { pendingReview, currentNodes, activeScope } = args;
  const subject = pendingReview.identifiedSubject;
  const subjectNodes = currentNodes.filter((node) => node.subject === subject);
  const generatedNodes = (pendingReview.newNodes || [])
    .filter((node: any) => node?.id && node?.name)
    .map((node: any) => ({
      ...node,
      subject,
      kind: node.kind || inferKnowledgeNodeKind(node as KnowledgeNode, [...subjectNodes, ...(pendingReview.newNodes || [])]),
      dataSource: 'ai_parse' as const,
      status: 'active' as const,
      version: 1,
      updatedAt: Date.now(),
    })) as KnowledgeNode[];
  let workingNodes = [...subjectNodes, ...generatedNodes];
  const nodesToCreate: KnowledgeNode[] = [];
  const previews: AnchorPreview[] = [];
  const items: ReviewItem[] = [];

  pendingReview.parsedItems.forEach((item, itemIndex) => {
    const candidateIds = Array.from(new Set(item.nodeIds || []));
    const existingLeafIds = candidateIds.filter((id) => {
      const node = workingNodes.find((candidate) => candidate.id === id);
      return isAttachableKnowledgeNode(node, workingNodes);
    });

    if (existingLeafIds.length > 0) {
      items.push({ ...item, nodeIds: existingLeafIds });
      previews.push({
        itemIndex,
        status: 'ok',
        nodeIds: existingLeafIds,
        path: formatKnowledgeNodePath(workingNodes, existingLeafIds[0]),
        note: '复用已有 knowledge/method 节点',
        createdNodes: [],
      });
      return;
    }

    const activeNode = activeScope.subject === subject && activeScope.nodeId
      ? workingNodes.find((node) => node.id === activeScope.nodeId)
      : undefined;
    const sameNameLeaf = workingNodes.find(
      (node) =>
        node.subject === subject &&
        isAttachableKnowledgeNode(node, workingNodes) &&
        normalizeNodeName(item.content).includes(normalizeNodeName(node.name))
    );
    const parent = activeNode || sameNameLeaf;

    if (!parent) {
      items.push({ ...item, nodeIds: [] });
      previews.push({
        itemIndex,
        status: 'blocked',
        nodeIds: [],
        path: '',
        note: '未入库',
        reason: '缺少当前导图节点或可复用叶子节点，无法确定父级',
        createdNodes: [],
      });
      return;
    }

    const result = ensureAttachableNodeUnderParent({
      parent,
      item,
      subject,
      nodes: workingNodes,
      createdNodes: nodesToCreate,
    });

    nodesToCreate.splice(0, nodesToCreate.length, ...result.createdNodes);
    workingNodes = [...subjectNodes, ...generatedNodes, ...nodesToCreate];

    if (!result.node) {
      items.push({ ...item, nodeIds: [] });
      previews.push({
        itemIndex,
        status: 'blocked',
        nodeIds: [],
        path: '',
        note: '未入库',
        reason: '自动补层失败，无法生成 knowledge/method 叶子',
        createdNodes: [],
      });
      return;
    }

    items.push({ ...item, nodeIds: [result.node.id] });
    previews.push({
      itemIndex,
      status: 'ok',
      nodeIds: [result.node.id],
      path: formatKnowledgeNodePath(workingNodes, result.node.id),
      note: result.note,
      createdNodes: result.createdNodes,
    });
  });

  return { items, previews, nodesToCreate };
}

function buildManualHighlightsInstruction(highlights: ManualHighlight[], assets: DraftAsset[]) {
  const assetNameMap = new Map(assets.map((asset) => [asset.resourceId, asset.name]));
  const lines = ['【用户手动重点标注】'];
  highlights.forEach((highlight, index) => {
    const label = MANUAL_HIGHLIGHT_META[highlight.kind].label;
    const note = highlight.note.trim() || (highlight.scope === 'text' ? '请按该标注处理。' : '请结合图片处理。');
    if (highlight.scope === 'text') lines.push(`${index+1}. 文本标注 [${label}]：${note}`);
    else lines.push(`${index+1}. 图片标注 [${assetNameMap.get(highlight.resourceId || '') || '未命名图片'}] [${label}]：${note}`);
  });
  assets.filter(a => a.visualAnnotations?.length).forEach(asset => {
    lines.push(`\n图片 [${asset.name}] 上的视觉标点:`);
    asset.visualAnnotations!.forEach(a => lines.push(`- 标号 ${a.number} [${MANUAL_HIGHLIGHT_META[a.kind as ManualHighlightKind]?.label || a.kind}]：${a.note || '重点关注'}`));
  });
  return lines.length > 1 ? lines.join('\n') : '';
}

type ParseTask = {
  id: string;
  createdAt: number;
  status: 'processing' | 'completed' | 'failed';
  workflow: IngestionMode;
  inputExcerpt: string;
  pendingReview?: PendingReview;
  error?: string;
  diagnostic?: TaskDiagnostic;
  retryCount?: number;
  maxRetries?: number;
  isNew: boolean;
  feedbackStatus?: 'helpful' | 'inaccurate';
  feedbackTag?: string;
};

type WorkspacePage = 'compose' | 'history';

export function InputSection() {
  const { state, dispatch } = useAppContext();
  const effectiveSettings = useMemo(() => resolveAIPresetSettings(state.settings), [state.settings]);
  const maxAutoRetries = 2;
  const [workflow, setWorkflow] = useState<IngestionMode>('quick');
  const [input, setInput] = useState(state.draftInput || '');
  const [supplementaryInstruction, setSupplementaryInstruction] = useState('');
  const [manualHighlights, setManualHighlights] = useState<ManualHighlight[]>([]);
  const [draftAssets, setDraftAssets] = useState<DraftAsset[]>([]);
  
  const [tasks, setTasks] = useState<ParseTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState<WorkspacePage>('compose');
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState(state.settings.parseModel);
  const [explicitFunction, setExplicitFunction] = useState<string>('auto');
  const [explicitPurpose, setExplicitPurpose] = useState<string>('auto');
  const [markAsMistake, setMarkAsMistake] = useState(false);
  const [annotatorAssetId, setAnnotatorAssetId] = useState<string | null>(null);
  const [isDragOverUpload, setIsDragOverUpload] = useState(false);
  const [isUploadingAssets, setIsUploadingAssets] = useState(false);
  const [isPendingAssetTransition, startAssetTransition] = useTransition();
  const [imageOptions, setImageOptions] = useState({
    enhanceImage: true,
    preserveAnnotations: true,
    splitQuestions: true,
    extractVocabulary: true,
    prioritizeAccuracy: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentScope = useMemo(
    () => (state.activeGraphScope?.subject === state.currentSubject ? state.activeGraphScope : null),
    [state.activeGraphScope, state.currentSubject]
  );
  const currentScopePath = useMemo(
    () =>
      currentScope?.nodeId
        ? formatKnowledgeNodePath(
            state.knowledgeNodes.filter((node) => node.subject === state.currentSubject),
            currentScope.nodeId
          )
        : '',
    [currentScope, state.currentSubject, state.knowledgeNodes]
  );

  useEffect(() => { setSelectedModel(state.settings.parseModel); }, [state.settings.parseModel]);

  const functionOptions = useMemo(() => Array.from(new Set([...DEFAULT_FUNCTIONS, ...state.memories.map(m => m.functionType)])).filter(Boolean), [state.memories]);
  const purposeOptions = useMemo(() => Array.from(new Set([...DEFAULT_PURPOSES, ...state.memories.map(m => m.purposeType)])).filter(Boolean), [state.memories]);

  const applyTemplate = useCallback((templateId: string) => {
    const template = INGESTION_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    setWorkflow(template.workflow);
    setSupplementaryInstruction(template.supplementaryInstruction);
    setInput((prev) => (prev.trim() ? prev : template.seedInput));
  }, []);

  const processFiles = useCallback(async (rawFiles: File[]) => {
    const files = rawFiles.filter((file) => {
      if (file.type.startsWith('image/')) return true;
      if (file.type === 'application/pdf') return true;
      if (file.type === 'text/plain') return true;
      return file.name.toLowerCase().endsWith('.txt') || file.name.toLowerCase().endsWith('.pdf');
    });
    if (files.length === 0) return;

    setIsUploadingAssets(true);
    try {
      const now = Date.now();
      const processed = await Promise.all(
        files.map(async (file) => {
          const preview = await readAsDataUrl(file);
          const resourceId = uuidv4();
          const resourcePayload = {
            id: resourceId,
            name: file.name,
            type: file.type,
            size: file.size,
            createdAt: now,
            updatedAt: now,
            data: preview,
            subject: state.currentSubject,
            origin: 'input_upload' as const,
            retentionPolicy: 'auto' as const,
            expiresAt: getAutoExpireAt(21),
            tags: [workflow],
            isFolder: false,
            parentId: null,
          };
          const draftAsset: DraftAsset = {
            resourceId,
            name: file.name,
            preview,
            type: file.type,
            size: file.size,
          };
          return { resourcePayload, draftAsset };
        })
      );

      dispatch({ type: 'BATCH_ADD_RESOURCES', payload: processed.map((item) => item.resourcePayload) });
      startAssetTransition(() => {
        setDraftAssets((prev) => [...prev, ...processed.map((item) => item.draftAsset)]);
      });
    } finally {
      setIsUploadingAssets(false);
    }
  }, [dispatch, state.currentSubject, workflow]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    await processFiles(Array.from(event.target.files));
    event.target.value = '';
  }, [processFiles]);

  const handleUploadDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOverUpload(true);
  }, []);

  const handleUploadDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOverUpload(false);
  }, []);

  const handleUploadDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOverUpload(false);
    const files = Array.from(event.dataTransfer?.files || []);
    if (files.length > 0) {
      await processFiles(files);
    }
  }, [processFiles]);

  const handleAnalyze = useCallback(() => {
    if (!input.trim() && draftAssets.length === 0) return;

    const taskId = uuidv4();
    const excerpt = input.trim().slice(0, 40) || (draftAssets.length > 0 ? `[包含 ${draftAssets.length} 份图片/文档]` : '无文本内容');
    
    const newTask: ParseTask = {
      id: taskId,
      createdAt: Date.now(),
      status: 'processing',
      workflow,
      inputExcerpt: excerpt,
      retryCount: 0,
      maxRetries: maxAutoRetries,
      isNew: true,
    };
    
    setTasks(prev => [newTask, ...prev]);
    setSelectedTaskId(taskId);
    setActivePage('history');

    const promptText = [
      buildWorkflowInstruction(workflow, imageOptions, supplementaryInstruction), 
      buildManualHighlightsInstruction(manualHighlights, draftAssets), 
      input
    ].filter(Boolean).join('\n\n');

    const snapshots = {
      subject: state.currentSubject,
      knowledgeNodes: state.knowledgeNodes,
      settings: { ...state.settings, parseModel: selectedModel },
      assets: draftAssets.map(a => a.annotatedPreview || a.preview),
      imgResourceIds: draftAssets.map(a => a.resourceId),
      options: { ...imageOptions, manualHighlights },
      funcOptions: functionOptions,
      purpOptions: purposeOptions,
      expFunc: explicitFunction,
      expPurp: explicitPurpose,
      workflow: workflow,
      input: input,
      supp: supplementaryInstruction
    };

    // Clear input for next task
    setInput('');
    setDraftAssets([]);
    setSupplementaryInstruction('');
    setManualHighlights([]);

    (async () => {
      const parseAssets = imageOptions.enhanceImage
        ? await Promise.all(
            snapshots.assets.map(async (asset) => {
              if (asset.startsWith('data:image/')) {
                return enhanceDocumentImage(asset);
              }
              return asset;
            })
          )
        : snapshots.assets;

      let attempt = 0;
      while (attempt <= maxAutoRetries) {
        try {
          if (attempt > 0) {
            setTasks((prev) =>
              prev.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      retryCount: attempt,
                    }
                  : task
              )
            );
          }

          const result = await parseNotes(
            promptText, 
            snapshots.subject, 
            snapshots.knowledgeNodes, 
            snapshots.settings, 
            parseAssets, 
            snapshots.expFunc !== 'auto' ? snapshots.expFunc : undefined, 
            snapshots.expPurp !== 'auto' ? snapshots.expPurp : undefined, 
            undefined, 
            undefined, 
            snapshots.funcOptions, 
            snapshots.purpOptions,
            (log) =>
              dispatch({
                type: 'ADD_LOG',
                payload: {
                  ...log,
                  targetId: log.targetId || taskId,
                  sessionId: log.sessionId || taskId,
                  subject: log.subject || snapshots.subject,
                  workflow: log.workflow || snapshots.workflow,
                  resourceIds: log.resourceIds || snapshots.imgResourceIds,
                  metadata: {
                    ...(log.metadata || {}),
                    targetId: taskId,
                    sessionId: taskId,
                    workflow: snapshots.workflow,
                    resourceIds: snapshots.imgResourceIds,
                    imageCount: parseAssets.length,
                    options: snapshots.options,
                  },
                },
              })
          );
          
          const historyItem: InputHistoryItem = { 
            id: taskId, 
            timestamp: Date.now(), 
            subject: snapshots.subject, 
            workflow: snapshots.workflow, 
            input: snapshots.input, 
            images: parseAssets, 
            imageResourceIds: snapshots.imgResourceIds, 
            supplementaryInstruction: snapshots.supp, 
            parsedItems: result.parsedItems, 
            newNodes: result.newNodes, 
            deletedNodeIds: result.deletedNodeIds, 
            aiAnalysis: result.analysisProcess, 
            identifiedSubject: result.identifiedSubject, 
            options: snapshots.options 
          };
          
          dispatch({ type: 'ADD_INPUT_HISTORY', payload: historyItem });
          
          setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status: 'completed',
            error: undefined,
            diagnostic: undefined,
            pendingReview: normalizePendingReviewState(
              { id: taskId, workflow: snapshots.workflow, resourceIds: snapshots.imgResourceIds, ...result, options: snapshots.options },
              result.identifiedSubject || snapshots.subject
            )
          } : t));
          return;
        } catch (error: any) {
          const diagnostic = classifyTaskError(error);
          if (diagnostic.retryable && attempt < maxAutoRetries) {
            const delayMs = Math.min(5000, 1000 * (attempt + 1));
            setTasks((prev) =>
              prev.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      status: 'processing',
                      retryCount: attempt + 1,
                      diagnostic,
                      error: `${diagnostic.title}，${Math.round(delayMs / 1000)} 秒后自动重试`,
                    }
                  : task
              )
            );
            await wait(delayMs);
            attempt += 1;
            continue;
          }

          setTasks(prev => prev.map(t => t.id === taskId ? {
            ...t,
            status: 'failed',
            diagnostic,
            error: String(error?.message || error || '解析失败'),
            retryCount: attempt,
          } : t));
          return;
        }
      }
    })();
  }, [input, draftAssets, workflow, imageOptions, supplementaryInstruction, manualHighlights, state.currentSubject, state.knowledgeNodes, state.settings, selectedModel, explicitFunction, explicitPurpose, functionOptions, purposeOptions, dispatch, maxAutoRetries]);

  const persistParsedItems = useCallback(async (task: ParseTask) => {
    if (!task.pendingReview) return;
    const { pendingReview } = task;

    const anchoringPlan = buildAnchoringPlan({
      pendingReview,
      currentNodes: state.knowledgeNodes,
      activeScope: state.activeGraphScope,
    });
    const anchoredPendingReview = { ...pendingReview, parsedItems: anchoringPlan.items };

    if (pendingReview.identifiedSubject !== state.currentSubject) dispatch({ type: 'SET_SUBJECT', payload: pendingReview.identifiedSubject });
    if (anchoringPlan.nodesToCreate.length > 0) dispatch({ type: 'BATCH_ADD_NODES', payload: anchoringPlan.nodesToCreate });
    if (pendingReview.deletedNodeIds.length > 0) dispatch({ type: 'BATCH_DELETE_NODES', payload: pendingReview.deletedNodeIds });
    const now = Date.now();

    const evaluations = anchoringPlan.items.map((item) =>
      evaluateReviewItemForSave({
        item,
        pendingReview: anchoredPendingReview,
        subject: pendingReview.identifiedSubject,
        explicitFunction,
        explicitPurpose,
        markAsMistake,
        now,
      })
    );

    const memories = evaluations
      .filter((evaluation): evaluation is typeof evaluation & { memory: Memory } => Boolean(evaluation.eligible && evaluation.memory))
      .map((evaluation) => evaluation.memory);
    const retainedItems = anchoringPlan.items.filter((_, index) => !evaluations[index]?.eligible);

    if (memories.length > 0) dispatch({ type: 'BATCH_ADD_MEMORIES', payload: memories } as any);

    if (retainedItems.length > 0) {
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        pendingReview: { ...pendingReview, parsedItems: retainedItems, newNodes: [] },
      } : t));
      return;
    }

    setTasks(prev => prev.filter(t => t.id !== task.id));
    setSelectedTaskId(null);
  }, [dispatch, explicitFunction, explicitPurpose, markAsMistake, state.activeGraphScope, state.currentSubject, state.knowledgeNodes]);

  const handleTaskFeedback = useCallback((taskId: string, mode: 'helpful' | 'inaccurate', feedbackTag?: string) => {
    const targetTask = tasks.find((task) => task.id === taskId);
    if (!targetTask) return;

    const nextFeedbackTag = mode === 'inaccurate' ? feedbackTag || targetTask.feedbackTag : undefined;
    const isSameFeedback =
      targetTask.feedbackStatus === mode &&
      (mode === 'helpful' || targetTask.feedbackTag === nextFeedbackTag);
    if (isSameFeedback) return;

    const sentiment = mode === 'helpful' ? 'positive' : 'negative';
    dispatch({
      type: 'ADD_FEEDBACK_EVENT',
      payload: createFeedbackEvent({
        subject: state.currentSubject,
        targetType: 'ingestion',
        targetId: taskId,
        signalType: mode === 'helpful' ? 'workflow_used' : 'ingestion_regenerated',
        sentiment,
        note:
          mode === 'helpful'
            ? '解析结果有帮助'
            : nextFeedbackTag
              ? `解析结果需要调整：${nextFeedbackTag}`
              : '解析结果不准',
        metadata: {
          workflow: targetTask.workflow,
          preset: effectiveSettings.aiPreset || 'balanced',
          provider: inferModelProvider(selectedModel, state.settings),
          model: selectedModel,
          graphScopeNodeId: currentScope?.nodeId || null,
          graphScopePath: currentScopePath || null,
          feedbackTag: nextFeedbackTag,
        },
      }),
    });

    const nextLearningNotes = appendFeedbackLearningNotes(state.settings.feedbackLearningNotes, mode);
    dispatch({
      type: 'UPDATE_SETTINGS',
      payload: {
        feedbackLearningNotes: nextLearningNotes,
      },
    });

    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? {
              ...task,
              feedbackStatus: mode,
              feedbackTag: nextFeedbackTag,
            }
          : task
      )
    );
  }, [
    currentScope?.nodeId,
    currentScopePath,
    dispatch,
    effectiveSettings.aiPreset,
    selectedModel,
    state.currentSubject,
    state.settings,
    tasks,
  ]);

  const viewTask = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isNew: false } : t));
    setSelectedTaskId(taskId);
  };

  const restoreHistoryItem = useCallback((item: InputHistoryItem) => {
    const norm = normalizeInputHistoryItem(item, state.currentSubject) || item;
    setWorkflow(normalizeInputHistoryWorkflow(norm.workflow, norm.images?.length || 0, norm.parsedItems?.length || 0));
    setInput(toDisplayText(norm.input));
    setSupplementaryInstruction(toDisplayText(norm.supplementaryInstruction));
    if (norm.options && typeof norm.options === 'object') {
      setImageOptions((prev) => ({
        ...prev,
        enhanceImage: typeof norm.options?.enhanceImage === 'boolean' ? norm.options.enhanceImage : prev.enhanceImage,
        preserveAnnotations: typeof norm.options?.preserveAnnotations === 'boolean' ? norm.options.preserveAnnotations : prev.preserveAnnotations,
        splitQuestions: typeof norm.options?.splitQuestions === 'boolean' ? norm.options.splitQuestions : prev.splitQuestions,
        extractVocabulary: typeof norm.options?.extractVocabulary === 'boolean' ? norm.options.extractVocabulary : prev.extractVocabulary,
      }));
    }
    setDraftAssets((norm.images || []).map((img, i) => ({ resourceId: norm.imageResourceIds?.[i] || uuidv4(), name: `Hist-${i+1}`, preview: toDisplayText(img), type: 'image/*', size: 0 })));
    setActivePage('compose');
  }, [state.currentSubject]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const historyItems = useMemo(() => {
    return [...state.inputHistory]
      .reverse()
      .map((item) => normalizeInputHistoryItem(item, state.currentSubject) || item);
  }, [state.inputHistory, state.currentSubject]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId);
  const selectedHistoryItem = historyItems.find((item) => item.id === selectedHistoryId) || historyItems[0] || null;
  const selectedTaskReviewEvaluations = useMemo(() => {
    if (!selectedTask?.pendingReview) return [];
    const anchoringPlan = buildAnchoringPlan({
      pendingReview: selectedTask.pendingReview,
      currentNodes: state.knowledgeNodes,
      activeScope: state.activeGraphScope,
    });
    return anchoringPlan.items.map((item) =>
      evaluateReviewItemForSave({
        item,
        pendingReview: { ...selectedTask.pendingReview!, parsedItems: anchoringPlan.items },
        subject: selectedTask.pendingReview!.identifiedSubject,
        explicitFunction,
        explicitPurpose,
        markAsMistake,
        now: Date.now(),
      })
    );
  }, [selectedTask, explicitFunction, explicitPurpose, markAsMistake, state.knowledgeNodes, state.activeGraphScope]);

  const selectedTaskAnchorPreviews = useMemo(() => {
    if (!selectedTask?.pendingReview) return [];
    return buildAnchoringPlan({
      pendingReview: selectedTask.pendingReview,
      currentNodes: state.knowledgeNodes,
      activeScope: state.activeGraphScope,
    }).previews;
  }, [selectedTask, state.knowledgeNodes, state.activeGraphScope]);

  const selectedTaskSaveStats = useMemo(() => {
    return selectedTaskReviewEvaluations.reduce(
      (stats, evaluation) => ({
        approved: stats.approved + (evaluation.eligible ? 1 : 0),
        pending: stats.pending + (evaluation.eligible ? 0 : 1),
      }),
      { approved: 0, pending: 0 }
    );
  }, [selectedTaskReviewEvaluations]);

  return (
    <div className="flex flex-col h-full bg-black select-none overflow-hidden sm:flex-row">
      <div className="w-full sm:w-16 md:w-20 lg:w-24 bg-slate-900 border-b sm:border-b-0 sm:border-r border-slate-800 flex sm:flex-col items-center py-2 sm:py-4 gap-3 px-4 sm:px-0 shrink-0">
        <div className="p-2 bg-indigo-500/10 rounded-xl hidden sm:block"><BrainCircuit className="w-6 h-6 text-indigo-400" /></div>
        {([
          { id: 'compose' as const, label: '录入', icon: Wand2 },
          { id: 'history' as const, label: '历史', icon: History, count: sortedTasks.length + state.inputHistory.length },
        ]).map((page) => {
          const Icon = page.icon;
          const isActive = activePage === page.id;
          return (
            <button
              key={page.id}
              onClick={() => setActivePage(page.id)}
              title={page.label}
              className={clsx('group relative p-2 md:p-3 rounded-2xl transition-all flex items-center gap-1.5 sm:block', isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300')}
            >
              <Icon className="w-5 h-5 md:w-6 md:h-6" />
              <span className="text-[10px] font-bold block sm:hidden">{page.label}</span>
              {Boolean(page.count) && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-emerald-500 text-[9px] font-black text-white flex items-center justify-center">{page.count}</span>}
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden">
        <div className="h-12 border-b border-slate-900 flex items-center justify-between px-4 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 shadow-xl" />
              {activePage === 'compose' ? '新建录入' : '历史与状态'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {activePage === 'compose' && (
              <>
                <ModelSelector value={selectedModel} onChange={setSelectedModel} />
                <button disabled={!input.trim() && draftAssets.length === 0} onClick={handleAnalyze} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-black transition-all flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"><Sparkles className="w-3 h-3" />创建解析任务</button>
              </>
            )}
            {activePage !== 'compose' && (
              <button onClick={() => setActivePage('compose')} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-black transition-all flex items-center gap-2"><Wand2 className="w-3 h-3" />新建录入</button>
            )}
          </div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          <div className={clsx("flex-1 flex flex-col min-w-0", activePage === 'compose' ? '' : 'hidden')}>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="p-4 bg-gradient-to-br from-slate-900/80 to-slate-950 border border-slate-800 rounded-3xl shadow-2xl">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">录入模式</div>
                    <p className="text-xs text-slate-500">{WORKFLOW_META[workflow].hint}</p>
                  </div>
                  <div className="hidden sm:block text-[10px] text-slate-600 font-bold">选择模板或直接输入</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                  {(Object.keys(WORKFLOW_META) as IngestionMode[]).map((mode) => {
                    const meta = WORKFLOW_META[mode];
                    const Icon = meta.icon;
                    const isActive = workflow === mode;
                    return (
                      <button key={mode} onClick={() => setWorkflow(mode)} className={clsx("text-left rounded-2xl border p-3 transition-all", isActive ? "border-indigo-500/50 bg-indigo-500/10 text-white" : "border-slate-800 bg-black/20 text-slate-400 hover:border-slate-700 hover:text-slate-200")}>
                        <Icon className="w-4 h-4 mb-2 text-indigo-300" />
                        <div className="text-xs font-black">{meta.label}</div>
                        <div className="text-[10px] mt-1 leading-relaxed opacity-70">{meta.subtitle}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">输入任务模板库</div>
                <div className="flex flex-wrap gap-2">
                  {INGESTION_TEMPLATES.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => applyTemplate(template.id)}
                      className="px-3 py-1.5 bg-slate-950 border border-slate-800 hover:border-indigo-500/40 hover:text-indigo-300 rounded-lg text-xs text-slate-300 transition-colors"
                    >
                      {template.label}
                    </button>
                  ))}
                </div>
              </div>

              <div
                onDragOver={handleUploadDragOver}
                onDragLeave={handleUploadDragLeave}
                onDrop={handleUploadDrop}
                className={clsx(
                  "relative bg-slate-900/30 border rounded-2xl p-2 transition-all",
                  isDragOverUpload
                    ? "border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/30"
                    : "border-slate-800 focus-within:border-indigo-500/50"
                )}
              >
                {isDragOverUpload && (
                  <div className="absolute inset-0 z-10 rounded-2xl border-2 border-dashed border-indigo-400/60 bg-indigo-500/10 flex items-center justify-center pointer-events-none">
                    <div className="text-xs font-bold text-indigo-200">松开鼠标即可上传文件</div>
                  </div>
                )}
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="在此输入文本内容，或上传素材辅助解析..." className="w-full bg-transparent p-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none min-h-[160px] md:min-h-[220px] resize-none" />
                <div className="flex items-center justify-between px-2 pb-2">
                  <div className="flex gap-4 items-center">
                    <button onClick={() => fileInputRef.current?.click()} className="p-1 text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-2">
                      <UploadCloud className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">上传素材</span>
                    </button>
                    <span className="text-[10px] text-slate-500">支持拖拽上传（图片 / PDF / TXT）</span>
                    {(isUploadingAssets || isPendingAssetTransition) && (
                      <span className="text-[10px] text-indigo-300 font-medium animate-pulse">处理中...</span>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,.pdf,.txt" onChange={handleFileUpload} />
                  <div className="text-[10px] font-bold text-slate-600 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">智能录入模式</div>
                </div>
              </div>

              {draftAssets.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  {draftAssets.map((asset) => (
                    <div key={asset.resourceId} className="group relative aspect-video bg-slate-900 rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500">
                      <img src={asset.annotatedPreview || asset.preview} alt={asset.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => setAnnotatorAssetId(asset.resourceId)} className="p-2 bg-indigo-600 text-white rounded-lg"><ScanLine className="w-4 h-4" /></button>
                        <button onClick={() => setDraftAssets(prev => prev.filter(a => a.resourceId !== asset.resourceId))} className="p-2 bg-rose-600 text-white rounded-lg"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-8">
                <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-3">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">解析设置</div>
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={imageOptions.enhanceImage} onChange={(e) => setImageOptions(prev => ({ ...prev, enhanceImage: e.target.checked }))} className="hidden" /><div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-all", imageOptions.enhanceImage ? "bg-indigo-600 border-indigo-600" : "border-slate-700 bg-slate-950")}>{imageOptions.enhanceImage && <Check className="w-3 h-3 text-white" />}</div><span className="text-xs text-slate-400">智能文档增强</span></label>
                    <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={imageOptions.extractVocabulary} onChange={(e) => setImageOptions(prev => ({ ...prev, extractVocabulary: e.target.checked }))} className="hidden" /><div className={clsx("w-4 h-4 rounded border flex items-center justify-center transition-all", imageOptions.extractVocabulary ? "bg-indigo-600 border-indigo-600" : "border-slate-700 bg-slate-950")}>{imageOptions.extractVocabulary && <Check className="w-3 h-3 text-white" />}</div><span className="text-xs text-slate-400">专业词汇提取</span></label>
                  </div>
                </div>
                <div className="p-3 bg-slate-900/40 border border-slate-800 rounded-2xl space-y-2">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-1">补充处理提示</div>
                  <textarea value={supplementaryInstruction} onChange={(e) => setSupplementaryInstruction(e.target.value)} placeholder="说明特殊处理要求..." className="w-full bg-slate-950/50 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-400 min-h-[50px] resize-none" />
                </div>
              </div>
            </div>
          </div>

          {activePage === 'history' && (
            <div className="flex-1 grid grid-cols-1 xl:grid-cols-[380px_1fr] overflow-hidden bg-slate-950">
              <div className="border-r border-slate-900 p-4 overflow-y-auto custom-scrollbar">
                <div className="mb-4">
                  <h3 className="text-sm font-black text-white">历史与状态</h3>
                  <p className="text-xs text-slate-500 mt-1">任务状态、待确认结果和历史导入统一在这里处理。</p>
                </div>
                <div className="mb-5">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">解析任务</div>
                  <div className="space-y-2">
                    {sortedTasks.length === 0 ? (
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 text-xs text-slate-600">暂无运行或待确认任务</div>
                    ) : (
                      sortedTasks.map((task) => (
                        <div
                          key={task.id}
                          onClick={() => { viewTask(task.id); setSelectedHistoryId(null); }}
                          className={clsx("rounded-2xl border p-4 transition-all relative cursor-pointer", selectedTask?.id === task.id ? "border-indigo-500/50 bg-indigo-500/10" : "border-slate-800 bg-slate-900/40 hover:border-slate-700")}
                        >
                          {task.isNew && task.status === 'completed' && <div className="absolute top-3 right-3 w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,1)]" />}
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <span className="text-[9px] font-black uppercase text-indigo-300">{WORKFLOW_META[task.workflow].label}</span>
                            <span className="text-[10px] font-bold text-slate-600">{new Date(task.createdAt).toLocaleTimeString()}</span>
                          </div>
                          <div className="text-sm text-slate-200 line-clamp-2">{task.inputExcerpt}</div>
                          <div className="mt-3 flex items-center justify-between">
                            {task.status === 'processing' && <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" />处理中</span>}
                            {task.status === 'completed' && <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1.5"><Check className="w-3 h-3" />待确认</span>}
                            {task.status === 'failed' && <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1.5"><AlertCircle className="w-3 h-3" />失败</span>}
                            {(task.status === 'completed' || task.status === 'failed') && (
                              <button onClick={(event) => { event.stopPropagation(); setTasks(prev => prev.filter(t => t.id !== task.id)); }} className="text-slate-600 hover:text-rose-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">历史录入</div>
                  {historyItems.length === 0 ? (
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-center text-xs text-slate-600">暂无历史记录</div>
                  ) : (
                    historyItems.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => { setSelectedTaskId(null); setSelectedHistoryId(item.id); }}
                        className={clsx("w-full text-left rounded-2xl border p-4 transition-all", !selectedTask && selectedHistoryItem?.id === item.id ? "border-indigo-500/50 bg-indigo-500/10" : "border-slate-800 bg-slate-900/40 hover:border-slate-700")}
                      >
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <span className="text-[9px] font-black uppercase text-indigo-300">{WORKFLOW_META[item.workflow]?.label || item.workflow}</span>
                          <span className="text-[10px] font-bold text-slate-600">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-slate-200 line-clamp-2">{toDisplayText(item.input) || `素材录入（${item.images?.length || 0} 个附件）`}</div>
                        <div className="mt-2 text-[10px] text-slate-500">{item.parsedItems?.length || 0} 条解析结果</div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar">
                {selectedTask ? (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-1">{WORKFLOW_META[selectedTask.workflow].label}</div>
                        <h3 className="text-lg font-black text-white">{selectedTask.status === 'failed' ? '任务失败' : '任务详情'}</h3>
                      </div>
                      <button onClick={() => setSelectedTaskId(null)} className="text-[10px] text-slate-500 hover:text-indigo-400 font-bold uppercase tracking-widest">查看历史</button>
                    </div>

                    {selectedTask.status === 'processing' ? (
                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6 text-sm text-amber-100 flex items-center gap-3">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        正在解析中，完成后会在这里显示待确认结果。
                      </div>
                    ) : selectedTask.status === 'failed' ? (
                      <div className="space-y-3">
                        <div className="text-rose-400 text-xs p-4 bg-rose-500/10 rounded-xl border border-rose-500/20">{selectedTask.error}</div>
                        {selectedTask.diagnostic && (
                          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                            <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                              {selectedTask.diagnostic.category === 'network' && <WifiOff className="w-4 h-4 text-amber-400" />}
                              {selectedTask.diagnostic.category === 'auth' && <KeyRound className="w-4 h-4 text-rose-400" />}
                              {selectedTask.diagnostic.category === 'rate_limit' && <Gauge className="w-4 h-4 text-indigo-400" />}
                              {selectedTask.diagnostic.category === 'unknown' && <AlertTriangle className="w-4 h-4 text-slate-400" />}
                              诊断：{selectedTask.diagnostic.title}
                            </div>
                            <p className="text-xs text-slate-400">{selectedTask.diagnostic.hint}</p>
                          </div>
                        )}
                      </div>
                    ) : selectedTask.pendingReview ? (
                      <>
                        <div className="flex items-center justify-between gap-2 p-3 bg-slate-900/40 border border-slate-800 rounded-xl">
                          <div className="text-[11px] text-slate-400">这次解析结果是否有帮助？你的反馈会直接影响后续提示词策略。</div>
                          <div className="flex gap-2">
                            <button onClick={() => handleTaskFeedback(selectedTask.id, 'helpful')} disabled={selectedTask.feedbackStatus === 'helpful'} className={clsx('px-3 py-1.5 rounded-lg text-xs transition-colors', selectedTask.feedbackStatus === 'helpful' ? 'bg-emerald-600 text-white' : 'bg-slate-800 hover:bg-emerald-600/80 text-slate-200 disabled:opacity-50')}>
                              <CheckCircle2 className="w-3 h-3 inline-block mr-1" />有用
                            </button>
                            <button onClick={() => handleTaskFeedback(selectedTask.id, 'inaccurate')} disabled={selectedTask.feedbackStatus === 'inaccurate' && !selectedTask.feedbackTag} className={clsx('px-3 py-1.5 rounded-lg text-xs transition-colors', selectedTask.feedbackStatus === 'inaccurate' ? 'bg-rose-600 text-white' : 'bg-slate-800 hover:bg-rose-600/80 text-slate-200 disabled:opacity-50')}>
                              不准
                            </button>
                          </div>
                        </div>
                        {selectedTask.pendingReview.aiAnalysis && <div className="bg-indigo-500/5 border-l-4 border-l-indigo-500 p-3 text-[11px] text-slate-400 leading-relaxed"><Markdown>{selectedTask.pendingReview.aiAnalysis}</Markdown></div>}
                        {selectedTask.feedbackStatus === 'inaccurate' && (
                          <div className="flex flex-wrap gap-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-[10px] text-rose-100">
                            <span className="mr-1 text-slate-400">问题标签：</span>
                            {FEEDBACK_QUICK_TAGS.map((tag) => (
                              <button
                                key={`${selectedTask.id}-${tag}`}
                                onClick={() => handleTaskFeedback(selectedTask.id, 'inaccurate', tag)}
                                className={clsx(
                                  'rounded-full border px-2 py-1 text-rose-100 transition-colors',
                                  selectedTask.feedbackTag === tag
                                    ? 'border-rose-400 bg-rose-500/15'
                                    : 'border-rose-500/30 bg-slate-950 hover:bg-rose-500/10'
                                )}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        )}
                        {selectedTask.pendingReview.parsedItems.map((item, idx) => {
                          const evaluation = selectedTaskReviewEvaluations[idx];
                          const anchorPreview = selectedTaskAnchorPreviews[idx];
                          return (
                            <div key={idx} className={clsx("bg-slate-900/40 border rounded-xl p-4 transition-all font-sans relative", evaluation?.eligible ? "border-slate-800 hover:border-emerald-500/30" : "border-amber-500/30 hover:border-amber-400/50")}>
                              <div className="absolute top-2 right-2"><button onClick={() => {
                                if (!selectedTask.pendingReview) return;
                                const newItems = selectedTask.pendingReview.parsedItems.filter((_, i) => i !== idx);
                                setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, pendingReview: { ...t.pendingReview!, parsedItems: newItems } } : t));
                              }} className="p-1 text-slate-700 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button></div>
                              <div className="flex flex-wrap items-center gap-1.5 pr-7 mb-3">
                                <div className={clsx("inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase", item.isMistake ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>{item.isMistake ? 'MISTAKE' : 'KNOWLEDGE'}</div>
                                {item.questionNo && <div className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-black text-slate-300">Q{item.questionNo}</div>}
                                {typeof evaluation?.score === 'number' && <div className={clsx("px-1.5 py-0.5 rounded text-[8px] font-black", evaluation.eligible ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>质量 {evaluation.score}</div>}
                                {item.needsConfirmation && <div className="px-1.5 py-0.5 rounded bg-amber-500/15 text-[8px] font-black text-amber-300">待确认</div>}
                                {item.conflict && <div className="px-1.5 py-0.5 rounded bg-rose-500/15 text-[8px] font-black text-rose-300">冲突</div>}
                              </div>
                              {anchorPreview && (
                                <div className={clsx(
                                  'mb-3 rounded-lg border p-2 text-[10px] leading-relaxed',
                                  anchorPreview.status === 'ok'
                                    ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
                                    : 'border-rose-500/20 bg-rose-500/10 text-rose-100'
                                )}>
                                  <div className="font-semibold">
                                    挂载路径：{anchorPreview.path || '未确定'}
                                  </div>
                                  <div className="mt-1">
                                    {anchorPreview.status === 'ok'
                                      ? `${anchorPreview.note}${anchorPreview.createdNodes.length > 0 ? `，将补充 ${anchorPreview.createdNodes.length} 个层级节点` : ''}`
                                      : `拦截原因：${anchorPreview.reason || '未通过导图挂载规则'}`}
                                  </div>
                                </div>
                              )}
                              <div className="prose prose-invert prose-sm text-slate-200 text-[13px]"><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{item.content}</Markdown></div>
                              {(item.studentAnswer || item.correctAnswer || item.errorReason) && (
                                <div className="mt-3 space-y-1 text-[11px] text-slate-400">
                                  {item.studentAnswer && <div>学生答案：<span className="text-slate-200">{item.studentAnswer}</span></div>}
                                  {item.correctAnswer && <div>正确答案：<span className="text-slate-200">{item.correctAnswer}</span></div>}
                                  {item.errorReason && <div>错因：{item.errorReasonCategory ? `【${item.errorReasonCategory}】` : ''}{item.errorReason}</div>}
                                  {item.evidence?.sourceText && <div>证据：{item.evidence.sourceText}</div>}
                                  {item.learningTask && <div>复习任务：{item.learningTask}</div>}
                                </div>
                              )}
                              {!evaluation?.eligible && evaluation?.flags.length > 0 && (
                                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2 text-[10px] leading-relaxed text-amber-200">
                                  待确认原因：{evaluation.flags.join('、')}
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="sticky bottom-0 pt-2 bg-slate-950/95">
                          <button onClick={() => persistParsedItems(selectedTask)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed" disabled={selectedTaskSaveStats.approved === 0}>
                            {selectedTaskSaveStats.approved > 0
                              ? `保存 ${selectedTaskSaveStats.approved} 条正式记忆，保留 ${selectedTaskSaveStats.pending} 条待确认`
                              : `暂无可正式入库项，保留 ${selectedTaskSaveStats.pending} 条待确认`}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : selectedHistoryItem ? (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-300 mb-2">{WORKFLOW_META[selectedHistoryItem.workflow]?.label || selectedHistoryItem.workflow}</div>
                          <h3 className="text-lg font-black text-white">历史导入详情</h3>
                          <p className="text-xs text-slate-500 mt-1">{new Date(selectedHistoryItem.timestamp).toLocaleString()} · {selectedHistoryItem.identifiedSubject || selectedHistoryItem.subject}</p>
                        </div>
                        <button onClick={() => restoreHistoryItem(selectedHistoryItem)} className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black transition-colors">
                          编辑并重新导入
                        </button>
                      </div>
                      {selectedHistoryItem.input && <div className="mt-4 rounded-2xl bg-black/30 border border-slate-800 p-4 text-sm text-slate-300 whitespace-pre-wrap">{selectedHistoryItem.input}</div>}
                    </div>

                    {selectedHistoryItem.aiAnalysis && (
                      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 text-xs text-slate-300 leading-relaxed">
                        <Markdown>{selectedHistoryItem.aiAnalysis}</Markdown>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {(selectedHistoryItem.parsedItems || []).map((rawItem, index) => {
                        const item = normalizeReviewItem(rawItem);
                        return (
                          <div key={index} className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <span className={clsx("px-1.5 py-0.5 rounded text-[8px] font-black uppercase", item.isMistake ? "bg-rose-500/20 text-rose-300" : "bg-emerald-500/20 text-emerald-300")}>{item.isMistake ? 'MISTAKE' : item.type || 'ITEM'}</span>
                              {item.questionNo && <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px] font-black text-slate-300">Q{item.questionNo}</span>}
                            </div>
                            <div className="prose prose-invert prose-sm text-slate-200 text-[13px]"><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{item.content}</Markdown></div>
                            {item.learningTask && <div className="mt-2 text-[11px] text-indigo-200">复习任务：{item.learningTask}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-600">选择一条历史记录查看详情</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {annotatorAssetId && (
        <ImageAnnotator
          src={draftAssets.find(a => a.resourceId === annotatorAssetId)?.preview || ''}
          initialAnnotations={draftAssets.find(a => a.resourceId === annotatorAssetId)?.visualAnnotations || []}
          onSave={(annotatedImageBase64, annotations, cutouts) => {
            setDraftAssets(prev => prev.map(a => 
              a.resourceId === annotatorAssetId ? { ...a, annotatedPreview: annotatedImageBase64, visualAnnotations: annotations } : a
            ));
            if (cutouts && cutouts.length > 0) {
              const newAssets: DraftAsset[] = cutouts.map((base64, index) => ({
                resourceId: uuidv4(),
                name: `片段-${index + 1}.jpg`,
                preview: base64,
                type: 'image/jpeg',
                size: 0
              }));
              setDraftAssets(prev => [...prev, ...newAssets]);
            }
            setAnnotatorAssetId(null);
          }}
          onCancel={() => setAnnotatorAssetId(null)}
        />
      )}
    </div>
  );
}
