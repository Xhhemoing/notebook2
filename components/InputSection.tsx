'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  FileImage,
  FileText,
  History,
  Info,
  Layers3,
  ScanLine,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from 'lucide-react';
import Markdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkMath from 'remark-math';
import { clsx } from 'clsx';
import { v4 as uuidv4 } from 'uuid';

import { useAppContext } from '@/lib/store';
import { parseNotes } from '@/lib/ai';
import { getInitialFSRSData } from '@/lib/fsrs';
import { createMemoryPayload } from '@/lib/data/commands';
import { getAutoExpireAt } from '@/lib/feedback';
import { normalizeInputHistoryItem, normalizeInputHistoryWorkflow } from '@/lib/input-history';
import { InputHistoryItem, IngestionMode, Resource, UserFeedbackEvent } from '@/lib/types';
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
  questionType?: string;
  correctAnswer?: string;
  notes?: string;
  nodeIds?: string[];
  isMistake?: boolean;
  wrongAnswer?: string;
  errorReason?: string;
  vocabularyData?: {
    meaning?: string;
    usage?: string;
    context?: string;
    mnemonics?: string;
    synonyms?: string[];
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
  newNodes: any[];
  deletedNodeIds: string[];
  aiAnalysis: string;
  identifiedSubject: string;
  options: Record<string, unknown>;
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
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      const maxDimension = 2200;
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const normalized = Math.max(0, Math.min(255, (gray - 42) * 1.55));
        data[i] = normalized;
        data[i + 1] = normalized;
        data[i + 2] = normalized;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.88));
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

  if (workflow === 'quick') {
    lines.push('【常规快速录入】优先快速拆解为准确、可复习的独立记忆项，避免冗长总结。');
  }

  if (workflow === 'image_pro') {
    lines.push('【图片专业处理】重点保留批注、手写标记、题干边界、错因线索与视觉上下文。');
    if (options.enhanceImage) lines.push('- 已启用图片增强，请优先利用清晰度提升后的细节。');
    if (options.preserveAnnotations) lines.push('- 请把用户的圈点、箭头、问号、打叉等视觉标记作为高优先级信号。');
    if (options.splitQuestions) lines.push('- 若一张图中包含多题，请按题目边界自动拆分。');
    if (options.extractVocabulary) lines.push('- 对英语或语言类材料中的标注词汇，优先提取为 vocabulary。');
    if (options.prioritizeAccuracy) lines.push('- 不确定时请显式说明不确定，不要强行补全。');
  }

  if (workflow === 'exam') {
    lines.push('【整卷分析】请从整套材料中提取错题、薄弱知识点、常考题型和高频失误。');
    lines.push('- 需要给出题目分布、知识点聚类和后续复习建议。');
    if (options.splitQuestions) lines.push('- 按题号拆分并保留题组上下文。');
    if (options.prioritizeAccuracy) lines.push('- 对识别不清的题面保留原样并标记待确认。');
  }

  if (supplementaryInstruction.trim()) {
    lines.push(`【用户补充说明】${supplementaryInstruction.trim()}`);
  }

  return lines.join('\n');
}

function pickPrimaryPreview(assets: DraftAsset[]) {
  return assets.find((asset) => asset.type.startsWith('image/'))?.preview || assets[0]?.preview;
}

function normalizeManualHighlight(value: unknown): ManualHighlight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const record = value as Record<string, unknown>;
  const scope = record.scope === 'image' ? 'image' : 'text';
  const kind = MANUAL_HIGHLIGHT_ORDER.includes(record.kind as ManualHighlightKind)
    ? (record.kind as ManualHighlightKind)
    : 'custom';

  return {
    id: toDisplayText(record.id) || uuidv4(),
    scope,
    kind,
    resourceId: toDisplayText(record.resourceId) || undefined,
    note: toDisplayText(record.note),
    customLabel: toDisplayText(record.customLabel) || undefined,
  };
}

function normalizeManualHighlights(value: unknown): ManualHighlight[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeManualHighlight(item))
    .filter((item): item is ManualHighlight => Boolean(item));
}

function isSameManualHighlight(
  current: ManualHighlight,
  next: Omit<ManualHighlight, 'id'>
) {
  return (
    current.scope === next.scope &&
    current.kind === next.kind &&
    (current.resourceId || '') === (next.resourceId || '') &&
    current.note.trim() === next.note.trim() &&
    (current.customLabel || '').trim() === (next.customLabel || '').trim()
  );
}

function remapManualHighlightsToAssets(
  highlights: ManualHighlight[],
  previousResourceIds: string[],
  restoredAssets: DraftAsset[]
) {
  if (highlights.length === 0 || restoredAssets.length === 0) return highlights;

  const resourceIdMap = new Map<string, string>();
  previousResourceIds.forEach((resourceId, index) => {
    if (!resourceId) return;
    const restoredResourceId = restoredAssets[index]?.resourceId;
    if (restoredResourceId) {
      resourceIdMap.set(resourceId, restoredResourceId);
    }
  });

  const restoredResourceIds = new Set(restoredAssets.map((asset) => asset.resourceId));
  const singleFallbackResourceId =
    restoredAssets.length === 1 ? restoredAssets[0].resourceId : undefined;

  return highlights.map((highlight) => {
    if (highlight.scope !== 'image') return highlight;

    const mappedResourceId =
      (highlight.resourceId ? resourceIdMap.get(highlight.resourceId) : undefined) ||
      (highlight.resourceId && restoredResourceIds.has(highlight.resourceId) ? highlight.resourceId : undefined) ||
      singleFallbackResourceId;

    if (!mappedResourceId || mappedResourceId === highlight.resourceId) {
      return highlight;
    }

    return {
      ...highlight,
      resourceId: mappedResourceId,
    };
  });
}

function getManualHighlightLabel(highlight: ManualHighlight) {
  if (highlight.kind === 'custom' && highlight.customLabel?.trim()) {
    return highlight.customLabel.trim();
  }

  return MANUAL_HIGHLIGHT_META[highlight.kind].label;
}

function buildManualHighlightsInstruction(highlights: ManualHighlight[], assets: DraftAsset[]) {
  const assetNameMap = new Map(assets.map((asset) => [asset.resourceId, asset.name]));
  const lines = ['【用户手动重点标注】'];

  highlights.forEach((highlight, index) => {
    const label = getManualHighlightLabel(highlight);
    const note =
      highlight.note.trim() ||
      (highlight.scope === 'text'
        ? '请结合当前文字内容按该标注优先处理。'
        : '请结合该图片中的对应区域按该标注优先处理。');

    if (highlight.scope === 'text') {
      lines.push(`${index + 1}. 文本标注 [${label}]：${note}`);
      return;
    }

    const assetName = assetNameMap.get(highlight.resourceId || '') || '未命名图片';
    lines.push(`${index + 1}. 图片标注 [${assetName}] [${label}]：${note}`);
  });

  assets.forEach((asset) => {
    if (asset.visualAnnotations && asset.visualAnnotations.length > 0) {
      lines.push(`\n图片 [${asset.name}] 上的视觉标点:`);
      asset.visualAnnotations.forEach((a) => {
        lines.push(`- 标号 ${a.number} [${a.kind === 'mistake' ? '错题' : a.kind === 'memory' ? '记忆' : a.kind === 'explain' ? '需解释' : '重点'}]：${a.note || '请重点关注此区域'}`);
      });
    }
  });

  if (highlights.length === 0 && lines.length === 1) return '';

  lines.push('请优先遵循以上手动标注，不要忽略用户明确指定的重点、错题、解释或自定义处理意图。');
  return lines.join('\n');
}

function toDisplayText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map(toDisplayText).filter(Boolean).join('\n').trim();
  }

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

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => toStringArray(entry));
  }

  const normalized = toDisplayText(value);
  return normalized ? [normalized] : [];
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
  };

  if (
    !normalized.meaning &&
    !normalized.usage &&
    !normalized.context &&
    !normalized.mnemonics &&
    normalized.synonyms.length === 0
  ) {
    return undefined;
  }

  return normalized;
}

function normalizeReviewItem(value: unknown): ReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      content: toDisplayText(value) || '未命名内容',
    };
  }

  const record = value as Record<string, unknown>;
  const type = record.type === 'concept' || record.type === 'qa' || record.type === 'vocabulary'
    ? record.type
    : undefined;

  return {
    content:
      toDisplayText(record.content) ||
      toDisplayText(record.notes) ||
      toDisplayText(record.correctAnswer) ||
      '未命名内容',
    type,
    questionType: toDisplayText(record.questionType) || undefined,
    correctAnswer: toDisplayText(record.correctAnswer) || undefined,
    notes: toDisplayText(record.notes) || undefined,
    nodeIds: Array.from(new Set(toStringArray(record.nodeIds))),
    isMistake: record.isMistake === true || toDisplayText(record.isMistake).toLowerCase() === 'true',
    wrongAnswer: toDisplayText(record.wrongAnswer) || undefined,
    errorReason: toDisplayText(record.errorReason) || undefined,
    vocabularyData: normalizeVocabularyDetails(record.vocabularyData),
    visualDescription: toDisplayText(record.visualDescription) || undefined,
    functionType: toDisplayText(record.functionType) || undefined,
    purposeType: toDisplayText(record.purposeType) || undefined,
    source: toDisplayText(record.source) || undefined,
    region: toDisplayText(record.region) || undefined,
  };
}

function normalizePendingReviewState(
  review: {
    id: string;
    workflow: IngestionMode;
    parsedItems: unknown;
    newNodes: unknown;
    deletedNodeIds: unknown;
    aiAnalysis: unknown;
    identifiedSubject: unknown;
    options: Record<string, unknown>;
  },
  fallbackSubject: string
): PendingReview {
  const parsedItems = (Array.isArray(review.parsedItems) ? review.parsedItems : [])
    .map((item) => normalizeReviewItem(item))
    .filter((item) => item.content);

  return {
    id: review.id,
    workflow: review.workflow,
    parsedItems,
    newNodes: Array.isArray(review.newNodes) ? review.newNodes : [],
    deletedNodeIds: Array.from(new Set(toStringArray(review.deletedNodeIds))),
    aiAnalysis: toDisplayText(review.aiAnalysis),
    identifiedSubject: toDisplayText(review.identifiedSubject) || fallbackSubject,
    options: review.options || {},
  };
}

export function InputSection() {
  const { state, dispatch } = useAppContext();
  const [workflow, setWorkflow] = useState<IngestionMode>('quick');
  const [input, setInput] = useState(state.draftInput || '');
  const [supplementaryInstruction, setSupplementaryInstruction] = useState('');
  const [manualHighlights, setManualHighlights] = useState<ManualHighlight[]>([]);
  const [draftAssets, setDraftAssets] = useState<DraftAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState(state.settings.parseModel);
  const [pendingReview, setPendingReview] = useState<PendingReview | null>(null);
  const [explicitFunction, setExplicitFunction] = useState<string>('auto');
  const [explicitPurpose, setExplicitPurpose] = useState<string>('auto');
  const [markAsMistake, setMarkAsMistake] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [annotatorAssetId, setAnnotatorAssetId] = useState<string | null>(null);
  const [imageOptions, setImageOptions] = useState({
    enhanceImage: true,
    preserveAnnotations: true,
    splitQuestions: true,
    extractVocabulary: true,
    prioritizeAccuracy: true,
  });
  const inputTextareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedModel(state.settings.parseModel);
  }, [state.settings.parseModel]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      dispatch({
        type: 'UPDATE_DRAFT',
        payload: {
          draftInput: input,
          draftImages: draftAssets.map((asset) => asset.preview),
        },
      });
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [dispatch, draftAssets, input]);

  const filteredHistory = useMemo(
    () =>
      (Array.isArray(state.inputHistory) ? state.inputHistory : [])
        .map((item, index) => normalizeInputHistoryItem(item, state.currentSubject, index))
        .filter((item): item is InputHistoryItem => Boolean(item))
        .filter((item) => item.subject === state.currentSubject),
    [state.currentSubject, state.inputHistory]
  );

  const functionOptions = useMemo(
    () =>
      Array.from(new Set([...DEFAULT_FUNCTIONS, ...state.memories.map((memory) => memory.functionType)])).filter(
        Boolean
      ),
    [state.memories]
  );

  const purposeOptions = useMemo(
    () =>
      Array.from(new Set([...DEFAULT_PURPOSES, ...state.memories.map((memory) => memory.purposeType)])).filter(
        Boolean
      ),
    [state.memories]
  );

  const textHighlights = useMemo(
    () => manualHighlights.filter((highlight) => highlight.scope === 'text'),
    [manualHighlights]
  );
  const imageHighlightCount = useMemo(
    () => manualHighlights.filter((highlight) => highlight.scope === 'image').length,
    [manualHighlights]
  );

  const addManualHighlight = useCallback(
    (scope: 'text' | 'image', kind: ManualHighlightKind, resourceId?: string) => {
      let note = '';

      if (scope === 'text' && inputTextareaRef.current) {
        const element = inputTextareaRef.current;
        const selectedText = input.slice(element.selectionStart || 0, element.selectionEnd || 0).trim();
        note = selectedText;
      }

      const nextHighlight: Omit<ManualHighlight, 'id'> = {
        scope,
        kind,
        resourceId,
        note,
        customLabel: kind === 'custom' ? '自定义' : undefined,
      };

      setManualHighlights((previous) => {
        if (previous.some((highlight) => isSameManualHighlight(highlight, nextHighlight))) {
          return previous;
        }

        return [
          ...previous,
          {
            id: uuidv4(),
            ...nextHighlight,
          },
        ];
      });
    },
    [input]
  );

  const updateManualHighlight = useCallback((id: string, updates: Partial<ManualHighlight>) => {
    setManualHighlights((previous) =>
      previous.map((highlight) => (highlight.id === id ? { ...highlight, ...updates } : highlight))
    );
  }, []);

  const removeManualHighlight = useCallback((id: string) => {
    setManualHighlights((previous) => previous.filter((highlight) => highlight.id !== id));
  }, []);

  const getImageHighlights = useCallback(
    (resourceId: string) => manualHighlights.filter((highlight) => highlight.scope === 'image' && highlight.resourceId === resourceId),
    [manualHighlights]
  );

  const addAssetFromFile = useCallback(
    async (file: File) => {
      if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.name.toLowerCase().endsWith('.docx')
      ) {
        try {
          const mammoth = await import('mammoth');
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          setInput((previous) =>
            [previous, `[Word:${file.name}]`, result.value.trim()].filter(Boolean).join('\n\n')
          );
        } catch (error) {
          console.error('Failed to parse Word document:', error);
        }
        return;
      }

      let preview = await readAsDataUrl(file);
      if (workflow === 'image_pro' && file.type.startsWith('image/') && imageOptions.enhanceImage) {
        preview = await enhanceDocumentImage(preview);
      }

      const resourceId = uuidv4();
      const resource: Resource = {
        id: resourceId,
        name: file.name,
        type: file.type || 'unknown',
        size: file.size,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: preview,
        subject: state.currentSubject,
        origin: 'input_upload',
        retentionPolicy: 'auto',
        expiresAt: getAutoExpireAt(state.settings.resourceAutoCleanupDays || 21),
        tags: [workflow],
        isFolder: false,
        parentId: null,
      };

      dispatch({ type: 'ADD_RESOURCE', payload: resource });

      setDraftAssets((previous) => [
        ...previous,
        {
          resourceId,
          name: file.name,
          preview,
          type: file.type || 'unknown',
          size: file.size,
        },
      ]);
    },
    [dispatch, imageOptions.enhanceImage, state.currentSubject, state.settings.resourceAutoCleanupDays, workflow]
  );

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        await addAssetFromFile(file);
      }
    },
    [addAssetFromFile]
  );

  const handleInputFileChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!event.target.files) return;
      await handleFiles(event.target.files);
      event.target.value = '';
    },
    [handleFiles]
  );

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items || []);
      const files = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter(Boolean) as File[];

      if (files.length > 0) {
        await handleFiles(files);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [handleFiles]);

  const runParse = useCallback(
    async (regenerate: boolean) => {
      if (!input.trim() && draftAssets.length === 0 && !regenerate) return;

      setLoading(true);

      const sessionId = pendingReview?.id || uuidv4();
      const options = workflow === 'quick' ? {} : imageOptions;
      const manualHighlightsInstruction = buildManualHighlightsInstruction(manualHighlights, draftAssets);
      const combinedSupplementaryInstruction = [supplementaryInstruction.trim(), manualHighlightsInstruction]
        .filter(Boolean)
        .join('\n\n');
      const workflowInstruction = buildWorkflowInstruction(workflow, options, combinedSupplementaryInstruction);
      const prompt = [workflowInstruction, input.trim()].filter(Boolean).join('\n\n');
      const existingFunctionTypes = functionOptions.length > 0 ? functionOptions : DEFAULT_FUNCTIONS;
      const existingPurposeTypes = purposeOptions.length > 0 ? purposeOptions : DEFAULT_PURPOSES;
      const resourceIds = draftAssets.map((asset) => asset.resourceId);

      try {
        const parsed = await parseNotes(
          prompt,
          state.currentSubject,
          state.knowledgeNodes,
          { ...state.settings, parseModel: selectedModel },
          draftAssets.length > 0 ? draftAssets.map((asset) => asset.annotatedPreview || asset.preview) : undefined,
          explicitFunction !== 'auto' ? explicitFunction : undefined,
          explicitPurpose !== 'auto' ? explicitPurpose : undefined,
          regenerate ? pendingReview?.parsedItems : undefined,
          regenerate ? toDisplayText(pendingReview?.aiAnalysis) : undefined,
          existingFunctionTypes,
          existingPurposeTypes,
          (log) => {
            dispatch({
              type: 'ADD_LOG',
              payload: {
                ...log,
                subject: state.currentSubject,
                sessionId,
                workflow,
                resourceIds,
                metadata: {
                  regenerate,
                  imageCount: draftAssets.length,
                },
              },
            });
          }
        );

        const historyItem: InputHistoryItem = {
          id: sessionId,
          timestamp: Date.now(),
          subject: state.currentSubject,
          workflow,
          input,
          images: draftAssets.map((asset) => asset.preview),
          imageResourceIds: resourceIds,
          supplementaryInstruction,
          parsedItems: parsed.parsedItems,
          newNodes: parsed.newNodes,
          deletedNodeIds: parsed.deletedNodeIds,
          aiAnalysis: parsed.analysisProcess,
          identifiedSubject: parsed.identifiedSubject,
          options: {
            ...options,
            manualHighlights,
          },
        };

        dispatch({ type: 'ADD_INPUT_HISTORY', payload: historyItem });

        if (regenerate) {
          dispatch({
            type: 'ADD_FEEDBACK_EVENT',
            payload: createFeedbackEvent({
              subject: state.currentSubject,
              targetType: 'ingestion',
              targetId: sessionId,
              signalType: 'ingestion_regenerated',
              sentiment: 'neutral',
              note: combinedSupplementaryInstruction || undefined,
              metadata: {
                workflow,
                imageCount: draftAssets.length,
                manualHighlightCount: manualHighlights.length,
              },
            }),
          });
        }

        setPendingReview(
          normalizePendingReviewState(
            {
              id: sessionId,
              workflow,
              parsedItems: parsed.parsedItems,
              newNodes: parsed.newNodes,
              deletedNodeIds: parsed.deletedNodeIds,
              aiAnalysis: parsed.analysisProcess,
              identifiedSubject: parsed.identifiedSubject,
              options,
            },
            parsed.identifiedSubject || state.currentSubject
          )
        );
      } catch (error: any) {
        console.error('Failed to parse notes:', error);
        alert(`解析失败：${error?.message || '未知错误'}`);
      } finally {
        setLoading(false);
      }
    },
    [
      draftAssets,
      explicitFunction,
      explicitPurpose,
      functionOptions,
      imageOptions,
      input,
      manualHighlights,
      pendingReview,
      purposeOptions,
      selectedModel,
      state.currentSubject,
      state.knowledgeNodes,
      state.settings,
      supplementaryInstruction,
      workflow,
      dispatch,
    ]
  );

  const persistParsedItems = useCallback(
    async (items: ReviewItem[], removeIndex?: number) => {
      if (!pendingReview) return;

      if (pendingReview.identifiedSubject !== state.currentSubject) {
        dispatch({ type: 'SET_SUBJECT', payload: pendingReview.identifiedSubject });
      }

      if (pendingReview.newNodes.length > 0) {
        dispatch({ type: 'BATCH_ADD_NODES', payload: pendingReview.newNodes });
      }

      if (pendingReview.deletedNodeIds.length > 0) {
        dispatch({ type: 'BATCH_DELETE_NODES', payload: pendingReview.deletedNodeIds });
      }

      const memoryIds: string[] = [];
      const primaryPreview = pickPrimaryPreview(draftAssets);
      const now = Date.now();

      const memories = items
        .map((rawItem) => {
          const item = normalizeReviewItem(rawItem);
          const memoryId = uuidv4();
          const memoryResult = createMemoryPayload({
            id: memoryId,
            subject: pendingReview.identifiedSubject,
            content: item.content,
            correctAnswer: item.correctAnswer,
            questionType: item.questionType,
            source: item.source,
            region: item.region,
            notes: item.notes,
            functionType: explicitFunction !== 'auto' ? explicitFunction : item.functionType || DEFAULT_FUNCTIONS[0],
            purposeType: explicitPurpose !== 'auto' ? explicitPurpose : item.purposeType || DEFAULT_PURPOSES[0],
            knowledgeNodeIds: item.nodeIds || [],
            confidence: 50,
            mastery: 0,
            createdAt: now,
            updatedAt: now,
            sourceType: draftAssets.length > 0 ? 'image' : 'text',
            imageUrl: primaryPreview,
            imageUrls: draftAssets.map((asset) => asset.resourceId),
            sourceResourceIds: draftAssets.map((asset) => asset.resourceId),
            isMistake: item.isMistake || markAsMistake,
            wrongAnswer: item.wrongAnswer,
            errorReason: item.errorReason,
            visualDescription: item.visualDescription,
            analysisProcess: toDisplayText(pendingReview.aiAnalysis),
            fsrs: getInitialFSRSData(),
            type: item.type,
            vocabularyData: item.vocabularyData,
            dataSource: 'ai_parse',
            ingestionMode: pendingReview.workflow,
            ingestionSessionId: pendingReview.id,
          });

          if (!memoryResult.ok) return null;

          memoryIds.push(memoryId);
          return memoryResult.value;
        })
        .filter(Boolean);

      if (memories.length > 0) {
        dispatch({
          type: memories.length === 1 ? 'ADD_MEMORY' : 'BATCH_ADD_MEMORIES',
          payload: memories.length === 1 ? memories[0] : memories,
        } as any);
      }

      dispatch({
        type: 'ADD_FEEDBACK_EVENT',
        payload: createFeedbackEvent({
          subject: pendingReview.identifiedSubject,
          targetType: 'ingestion',
          targetId: pendingReview.id,
          signalType: 'workflow_used',
          sentiment: 'positive',
          metadata: {
            workflow: pendingReview.workflow,
            memoryCount: memories.length,
            imageCount: draftAssets.length,
            manualHighlightCount: manualHighlights.length,
          },
        }),
      });

      if (draftAssets.length > 0 && memories.length > 0) {
        draftAssets.forEach((asset) => {
          const resource = state.resources.find((item) => item.id === asset.resourceId);
          if (!resource) return;

          dispatch({
            type: 'UPDATE_RESOURCE',
            payload: {
              ...resource,
              description: `Linked to ${memories.length} memory item(s)`,
              tags: Array.from(new Set([...(resource.tags || []), 'evidence', pendingReview.workflow])),
            },
          });
        });
      }

      if (typeof removeIndex === 'number' && pendingReview.parsedItems.length > 1) {
        setPendingReview({
          ...pendingReview,
          parsedItems: pendingReview.parsedItems.filter((_, index) => index !== removeIndex),
        });
        return;
      }

      setPendingReview(null);
      setInput('');
      setSupplementaryInstruction('');
      setManualHighlights([]);
      setDraftAssets([]);
      setMarkAsMistake(false);
      dispatch({ type: 'UPDATE_DRAFT', payload: { draftInput: '', draftImages: [] } });
    },
    [
      dispatch,
      draftAssets,
      explicitFunction,
      explicitPurpose,
      markAsMistake,
      manualHighlights.length,
      pendingReview,
      state.currentSubject,
      state.resources,
    ]
  );

  const removeDraftAsset = useCallback((resourceId: string) => {
    setDraftAssets((previous) => previous.filter((asset) => asset.resourceId !== resourceId));
    setManualHighlights((previous) =>
      previous.filter((highlight) => !(highlight.scope === 'image' && highlight.resourceId === resourceId))
    );
  }, []);

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (event.dataTransfer.files.length > 0) {
        await handleFiles(event.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const restoreHistoryItem = useCallback((item: InputHistoryItem) => {
    const normalizedItem = normalizeInputHistoryItem(item, state.currentSubject) || item;
    const restoredAssets = (normalizedItem.images || []).map((image, index) => {
      const preview = toDisplayText(image);
      return {
        resourceId: normalizedItem.imageResourceIds?.[index] || uuidv4(),
        name: `Restored-${index + 1}`,
        preview,
        type: preview.startsWith('data:image') ? 'image/*' : 'application/octet-stream',
        size: 0,
      };
    });
    const restoredManualHighlights = remapManualHighlightsToAssets(
      normalizeManualHighlights(normalizedItem.options?.manualHighlights),
      normalizedItem.imageResourceIds || [],
      restoredAssets
    );

    setWorkflow(
      normalizeInputHistoryWorkflow(
        normalizedItem.workflow,
        normalizedItem.images?.length || 0,
        normalizedItem.parsedItems?.length || 0
      )
    );
    setInput(toDisplayText(normalizedItem.input));
    setSupplementaryInstruction(toDisplayText(normalizedItem.supplementaryInstruction));
    setManualHighlights(restoredManualHighlights);
    setDraftAssets(restoredAssets);
    setPendingReview(
      normalizePendingReviewState(
        {
          id: normalizedItem.id,
          workflow: normalizeInputHistoryWorkflow(
            normalizedItem.workflow,
            normalizedItem.images?.length || 0,
            normalizedItem.parsedItems?.length || 0
          ),
          parsedItems: normalizedItem.parsedItems,
          newNodes: normalizedItem.newNodes,
          deletedNodeIds: normalizedItem.deletedNodeIds,
          aiAnalysis: normalizedItem.aiAnalysis,
          identifiedSubject: normalizedItem.identifiedSubject,
          options: {
            ...(normalizedItem.options || {}),
            manualHighlights: restoredManualHighlights,
          },
        },
        toDisplayText(normalizedItem.identifiedSubject) || state.currentSubject
      )
    );
    setShowHistory(false);
  }, [state.currentSubject]);

  const activeMeta = WORKFLOW_META[workflow];

  if (loading) {
    return (
      <div className="w-full p-4 md:p-6 xl:px-8">
        <div className="min-h-[420px] rounded-3xl border border-slate-800 bg-slate-950 flex flex-col items-center justify-center text-center p-8">
          <div className="relative mb-8">
            <div className="h-20 w-20 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin" />
            <BrainCircuit className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">AI 正在处理录入材料</h2>
          <p className="max-w-2xl text-sm text-slate-400 leading-7">
            当前工作流为
            <span className="text-slate-200 font-medium mx-1">{activeMeta.label}</span>
            ，我会结合图片、文本、批注和你的补充要求生成更准确的入库结果。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full overflow-y-auto scroll-smooth custom-scrollbar p-4 md:p-6 xl:px-8 space-y-5 text-slate-200">
      <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 md:p-6 shadow-2xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-slate-500 mb-2">
              <BrainCircuit className="h-4 w-4 text-indigo-400" />
              Ingestion Workbench
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">{state.currentSubject} 专业录入工作台</h2>
            <p className="mt-2 text-sm text-slate-400 leading-7 max-w-3xl">
              统一管理常规快速录入、图片专业处理和整卷分析；上传图片默认进入资源库，并按规则自动清理旧文件。
            </p>
          </div>

          <button
            onClick={() => setShowHistory((previous) => !previous)}
            className={clsx(
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-widest transition-colors',
              showHistory
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-200'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
            )}
          >
            <History className="h-4 w-4" />
            录入历史
          </button>
        </div>

        <div className="mt-5 grid gap-2 md:grid-cols-3">
          {(Object.keys(WORKFLOW_META) as IngestionMode[]).map((mode) => {
            const meta = WORKFLOW_META[mode];
            const Icon = meta.icon;

            return (
              <button
                key={mode}
                onClick={() => setWorkflow(mode)}
                className={clsx('rounded-2xl border p-3.5 text-left transition-all', modeBadgeClass(mode, workflow === mode))}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black/20">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{meta.label}</div>
                    <div className="text-xs text-slate-400 mt-1">{meta.subtitle}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-300">
            当前模式：{activeMeta.label}
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
            图片先入资源库，{state.settings.resourceAutoCleanupDays || 21} 天后自动清理未固定素材
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
            重生成、编辑和对话反馈会反向学习你的偏好
          </span>
        </div>

        {showHistory && (
          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="text-xs uppercase tracking-widest text-slate-500">最近录入历史</div>
              <div className="text-xs text-slate-500">{filteredHistory.length} 条</div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {filteredHistory.length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">当前学科还没有录入历史。</div>
              ) : (
                filteredHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => restoreHistoryItem(item)}
                    className="w-full border-b border-slate-800/80 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-widest text-slate-400">
                            {WORKFLOW_META[
                              normalizeInputHistoryWorkflow(
                                item.workflow,
                                item.images?.length || 0,
                                item.parsedItems?.length || 0
                              )
                            ].label}
                          </span>
                          <span className="text-[11px] text-slate-600">{new Date(item.timestamp).toLocaleString()}</span>
                        </div>
                        <div className="truncate text-sm text-slate-200">
                          {toDisplayText(item.input) || `图片录入，共 ${item.images.length} 张素材`}
                        </div>
                      </div>
                      <Trash2
                        className="h-4 w-4 text-slate-600 hover:text-rose-400"
                        onClick={(event) => {
                          event.stopPropagation();
                          dispatch({ type: 'DELETE_INPUT_HISTORY', payload: item.id });
                        }}
                      />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={clsx(
          'rounded-3xl border p-2 md:p-4 transition-all w-full',
          isDragging ? 'border-indigo-500/40 bg-indigo-500/5' : 'border-slate-800 bg-slate-950'
        )}
      >
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <div className="text-sm font-semibold text-white">{activeMeta.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{activeMeta.subtitle}</div>
                </div>
                <div className="w-full md:w-64">
                  <ModelSelector
                    value={selectedModel}
                    onChange={setSelectedModel}
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                  />
                </div>
              </div>

              <textarea
                ref={inputTextareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  workflow === 'quick'
                    ? '输入知识点、错因、方法总结或课后笔记。支持零散文本快速整理。'
                    : workflow === 'image_pro'
                      ? '可补充说明图片中的重点、疑问、批注含义或希望优先提取的区域。'
                      : '描述这套试卷/作业的背景，例如月考、作业订正、专题训练等。'
                }
                className="min-h-[360px] w-full resize-y rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm leading-7 text-slate-200 outline-none focus:border-indigo-500 md:min-h-[460px]"
              />

              <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white">手动重点标注</div>
                    <div className="mt-1 text-xs leading-6 text-slate-500">
                      文字可先选中再点标签；图片可在素材卡片里单独标为错题、添加记忆、需要解释或自定义重点。
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-slate-400">
                    当前 {manualHighlights.length} 条标注 · 文本 {textHighlights.length} · 图片 {imageHighlightCount}
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {MANUAL_HIGHLIGHT_ORDER.map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addManualHighlight('text', kind)}
                      className={clsx(
                        'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                        MANUAL_HIGHLIGHT_META[kind].badgeClass
                      )}
                    >
                      文本标为{MANUAL_HIGHLIGHT_META[kind].shortLabel}
                    </button>
                  ))}
                </div>

                {textHighlights.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {textHighlights.map((highlight) => (
                      <div key={highlight.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={clsx(
                                'rounded-full border px-2.5 py-1 text-[11px] font-medium',
                                MANUAL_HIGHLIGHT_META[highlight.kind].badgeClass
                              )}
                            >
                              {getManualHighlightLabel(highlight)}
                            </span>
                            <span className="text-[11px] uppercase tracking-widest text-slate-500">文本标注</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeManualHighlight(highlight.id)}
                            className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {highlight.kind === 'custom' && (
                          <input
                            value={highlight.customLabel || ''}
                            onChange={(event) =>
                              updateManualHighlight(highlight.id, { customLabel: event.target.value })
                            }
                            placeholder="自定义标签名，例如：保留原题 / 只做翻译"
                            className="mt-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-violet-500"
                          />
                        )}

                        <input
                          value={highlight.note}
                          onChange={(event) =>
                            updateManualHighlight(highlight.id, { note: event.target.value })
                          }
                          placeholder={MANUAL_HIGHLIGHT_META[highlight.kind].placeholder}
                          className="mt-3 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <textarea
                value={supplementaryInstruction}
                onChange={(event) => setSupplementaryInstruction(event.target.value)}
                placeholder="补充处理要求，例如：只提取打叉题目、保留原题条件、把用户问号当作待讲解点。"
                className="mt-3 h-20 w-full resize-none rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300 outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-slate-500">功能分类</span>
                <select
                  value={explicitFunction}
                  onChange={(event) => setExplicitFunction(event.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="auto">自动判断</option>
                  {functionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs uppercase tracking-widest text-slate-500">目的分类</span>
                <select
                  value={explicitPurpose}
                  onChange={(event) => setExplicitPurpose(event.target.value)}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
                >
                  <option value="auto">自动判断</option>
                  {purposeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <input
                  type="checkbox"
                  checked={markAsMistake}
                  onChange={(event) => setMarkAsMistake(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500"
                />
                <div>
                  <div className="text-sm font-medium text-slate-200">优先标为错题</div>
                  <div className="text-xs text-slate-500 mt-1">保存时默认加上错题属性</div>
                </div>
              </label>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="text-sm font-medium text-slate-200">自动清理策略</div>
                <div className="mt-1 text-xs leading-6 text-slate-500">
                  当前上传图片默认保存到资源库，{state.settings.resourceAutoCleanupDays || 21} 天后自动清理未被固定的旧素材。
                </div>
              </div>
            </div>

            {(workflow === 'image_pro' || workflow === 'exam') && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <FileImage className="h-4 w-4 text-amber-400" />
                  <div className="text-sm font-semibold text-white">专业处理参数</div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ['enhanceImage', '增强文档清晰度'],
                    ['preserveAnnotations', '保留批注与符号'],
                    ['splitQuestions', '自动拆分多题'],
                    ['extractVocabulary', '提取图片词汇/术语'],
                    ['prioritizeAccuracy', '不确定时优先保守'],
                  ].map(([key, label]) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(imageOptions[key as keyof typeof imageOptions])}
                        onChange={(event) =>
                          setImageOptions((previous) => ({
                            ...previous,
                            [key]: event.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500"
                      />
                      <span className="text-sm text-slate-200">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf,.docx"
                  multiple
                  className="hidden"
                  onChange={handleInputFileChange}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
                >
                  <UploadCloud className="h-4 w-4" />
                  上传图片 / PDF / Word
                </button>
                <div className="text-xs leading-6 text-slate-500">
                  支持拖拽、粘贴图片。上传素材会自动进入资源库并带上生命周期信息，方便后续导出给我做优化。
                </div>
              </div>

              {draftAssets.length > 0 && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {draftAssets.map((asset) => (
                    <div key={asset.resourceId} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-200">{asset.name}</div>
                          <div className="text-[11px] text-slate-500 mt-1">{asset.type || 'unknown'}</div>
                        </div>
                        <button
                          onClick={() => removeDraftAsset(asset.resourceId)}
                          className="rounded-lg p-1 text-slate-600 hover:bg-slate-800 hover:text-rose-400"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-3 relative aspect-video overflow-hidden rounded-xl border border-slate-800 bg-slate-900 group">
                        {asset.preview.startsWith('data:image') ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={asset.annotatedPreview || asset.preview} alt={asset.name} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <button
                                onClick={() => setAnnotatorAssetId(asset.resourceId)}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-xl transition-all"
                              >
                                精致标注
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="flex h-full items-center justify-center text-slate-500">
                            <FileText className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                        <div className="text-[11px] uppercase tracking-widest text-slate-500">图片重点标注</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {MANUAL_HIGHLIGHT_ORDER.map((kind) => (
                            <button
                              key={`${asset.resourceId}-${kind}`}
                              type="button"
                              onClick={() => addManualHighlight('image', kind, asset.resourceId)}
                              className={clsx(
                                'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                                MANUAL_HIGHLIGHT_META[kind].badgeClass
                              )}
                            >
                              {MANUAL_HIGHLIGHT_META[kind].shortLabel}
                            </button>
                          ))}
                        </div>

                        {getImageHighlights(asset.resourceId).length > 0 && (
                          <div className="mt-3 space-y-2">
                            {getImageHighlights(asset.resourceId).map((highlight) => (
                              <div key={highlight.id} className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span
                                    className={clsx(
                                      'rounded-full border px-2 py-0.5 text-[10px] font-medium',
                                      MANUAL_HIGHLIGHT_META[highlight.kind].badgeClass
                                    )}
                                  >
                                    {getManualHighlightLabel(highlight)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => removeManualHighlight(highlight.id)}
                                    className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-rose-400"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                {highlight.kind === 'custom' && (
                                  <input
                                    value={highlight.customLabel || ''}
                                    onChange={(event) =>
                                      updateManualHighlight(highlight.id, { customLabel: event.target.value })
                                    }
                                    placeholder="自定义标签名"
                                    className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-violet-500"
                                  />
                                )}

                                <input
                                  value={highlight.note}
                                  onChange={(event) =>
                                    updateManualHighlight(highlight.id, { note: event.target.value })
                                  }
                                  placeholder={MANUAL_HIGHLIGHT_META[highlight.kind].placeholder}
                                  className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => runParse(false)}
              disabled={loading || (!input.trim() && draftAssets.length === 0)}
              className={clsx(
                'w-full rounded-2xl px-5 py-4 text-sm font-semibold text-white transition-all',
                loading || (!input.trim() && draftAssets.length === 0)
                  ? 'cursor-not-allowed bg-indigo-500/40'
                  : 'bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/30'
              )}
            >
              {loading ? '处理中...' : `开始 ${activeMeta.label}`}
            </button>
          </div>

          <details className="rounded-2xl border border-slate-800 bg-slate-950">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-white">
              <span className="flex items-center gap-2">
                <Info className="h-4 w-4 text-indigo-400" />
                日志与 AI 偏好学习
              </span>
              <span className="text-xs font-normal text-slate-500">按需展开</span>
            </summary>
            <div className="grid gap-4 border-t border-slate-800 px-4 py-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-sm font-semibold text-white">本流程会记录什么</div>
                <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-400">
                  <li>解析日志会附带工作流、学科、资源关联，便于后续导出优化包。</li>
                  <li>图片默认进入资源库，未固定旧素材将按规则自动清理。</li>
                  <li>重生成、编辑、删除和对话反馈会反向沉淀为 AI 注意事项。</li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-400" />
                  <div className="text-sm font-semibold text-white">AI 当前注意点</div>
                </div>
                <div className="mt-3 space-y-3 text-sm leading-7 text-slate-400">
                  <p>{toDisplayText(state.settings.aiAttentionNotes) || '暂未设置。'}</p>
                  {state.settings.feedbackLearningNotes && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300 whitespace-pre-wrap">
                      {toDisplayText(state.settings.feedbackLearningNotes)}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      {pendingReview && (
        <div className="rounded-3xl border border-indigo-500/20 bg-slate-950 p-4 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest text-indigo-400 mb-2">Review Before Save</div>
              <h3 className="text-2xl font-black tracking-tight text-white">{pendingReview.parsedItems.length} 条待确认结果</h3>
              <p className="mt-2 text-sm text-slate-400 leading-7">
                你可以直接保存全部、逐条保存，或补充说明后重生成。这些行为都会被记为偏好反馈。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => runParse(true)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-slate-600"
              >
                重生成
              </button>
              <button
                onClick={() => persistParsedItems(pendingReview.parsedItems)}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
              >
                保存全部
              </button>
              <button
                onClick={() => setPendingReview(null)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:border-slate-600"
              >
                稍后处理
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">AI 分析过程</div>
            <div className="prose prose-invert prose-sm max-w-none text-slate-300">
              <Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                {toDisplayText(pendingReview.aiAnalysis) || '暂无分析说明。'}
              </Markdown>
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {pendingReview.parsedItems.map((item, index) => (
              <div key={`${pendingReview.id}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="rounded-full bg-slate-800 px-2 py-1 text-[10px] uppercase tracking-widest text-slate-400">
                        {item.type || 'concept'}
                      </span>
                      {item.isMistake && (
                        <span className="rounded-full bg-rose-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-rose-300">
                          错题
                        </span>
                      )}
                      {item.questionType && (
                        <span className="rounded-full bg-indigo-500/10 px-2 py-1 text-[10px] uppercase tracking-widest text-indigo-200">
                          {item.questionType}
                        </span>
                      )}
                    </div>
                    <div className="text-base font-semibold text-white leading-7">{item.content}</div>
                  </div>
                  <button
                    onClick={() => persistParsedItems([item], index)}
                    className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                  >
                    保存此条
                  </button>
                </div>

                {(item.correctAnswer || item.notes || item.errorReason || item.wrongAnswer) && (
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {item.correctAnswer && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                        <div className="text-[10px] uppercase tracking-widest text-emerald-300 mb-2">标准答案</div>
                        <div className="text-sm text-emerald-100 whitespace-pre-wrap">{item.correctAnswer}</div>
                      </div>
                    )}
                    {item.wrongAnswer && (
                      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3">
                        <div className="text-[10px] uppercase tracking-widest text-rose-300 mb-2">错误答案</div>
                        <div className="text-sm text-rose-100 whitespace-pre-wrap">{item.wrongAnswer}</div>
                      </div>
                    )}
                    {item.errorReason && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 md:col-span-2">
                        <div className="text-[10px] uppercase tracking-widest text-amber-300 mb-2">错因分析</div>
                        <div className="text-sm text-amber-100 whitespace-pre-wrap">{item.errorReason}</div>
                      </div>
                    )}
                    {item.notes && (
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-3 md:col-span-2">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">补充说明</div>
                        <div className="text-sm text-slate-300 whitespace-pre-wrap">{item.notes}</div>
                      </div>
                    )}
                  </div>
                )}

                {item.vocabularyData && (
                  <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-sky-300 mb-2">词汇补充</div>
                    <div className="grid gap-2 text-sm text-sky-100 md:grid-cols-2">
                      {item.vocabularyData.meaning && <div>含义：{item.vocabularyData.meaning}</div>}
                      {item.vocabularyData.usage && <div>用法：{item.vocabularyData.usage}</div>}
                      {item.vocabularyData.context && <div className="md:col-span-2">语境：{item.vocabularyData.context}</div>}
                    </div>
                  </div>
                )}

                {item.nodeIds && item.nodeIds.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.nodeIds.map((nodeId) => {
                      const node = state.knowledgeNodes.find((entry) => entry.id === nodeId);
                      return (
                        <span
                          key={`${pendingReview.id}-${index}-${nodeId}`}
                          className="rounded-full border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] uppercase tracking-widest text-slate-400"
                        >
                          {node?.name || nodeId}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>

          {(pendingReview.newNodes.length > 0 || pendingReview.deletedNodeIds.length > 0) && (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">建议新增节点</div>
                {pendingReview.newNodes.length === 0 ? (
                  <div className="text-sm text-slate-500">无</div>
                ) : (
                  pendingReview.newNodes.map((node: any, index) => (
                    <div key={`${node.name}-${index}`} className="text-sm text-slate-300 py-1">
                      {node.name}
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">建议删除节点</div>
                {pendingReview.deletedNodeIds.length === 0 ? (
                  <div className="text-sm text-slate-500">无</div>
                ) : (
                  pendingReview.deletedNodeIds.map((nodeId) => (
                    <div key={nodeId} className="text-sm text-rose-300 py-1">
                      {state.knowledgeNodes.find((node) => node.id === nodeId)?.name || nodeId}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {annotatorAssetId && (
        <ImageAnnotator
          src={draftAssets.find(a => a.resourceId === annotatorAssetId)?.preview || ''}
          initialAnnotations={draftAssets.find(a => a.resourceId === annotatorAssetId)?.visualAnnotations || []}
          onSave={(annotatedImageBase64, annotations) => {
            setDraftAssets(prev => prev.map(a => 
              a.resourceId === annotatorAssetId 
                ? { ...a, annotatedPreview: annotatedImageBase64, visualAnnotations: annotations } 
                : a
            ));
            setAnnotatorAssetId(null);
          }}
          onCancel={() => setAnnotatorAssetId(null)}
        />
      )}

    </div>
  );
}
