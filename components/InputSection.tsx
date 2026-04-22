'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  Check,
  FileImage,
  FileText,
  History,
  Info,
  Layers3,
  Loader2,
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
  return (normalized.meaning || normalized.usage || normalized.context || normalized.mnemonics || normalized.synonyms.length > 0) ? normalized : undefined;
}

function normalizeReviewItem(value: unknown): ReviewItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { content: toDisplayText(value) || '未命名内容' };
  const record = value as Record<string, unknown>;
  const type = record.type === 'concept' || record.type === 'qa' || record.type === 'vocabulary' ? record.type : undefined;
  return {
    content: toDisplayText(record.content) || toDisplayText(record.notes) || toDisplayText(record.correctAnswer) || '未命名内容',
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

function normalizePendingReviewState(review: any, fallbackSubject: string): PendingReview {
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
  isNew: boolean;
};

export function InputSection() {
  const { state, dispatch } = useAppContext();
  const [workflow, setWorkflow] = useState<IngestionMode>('quick');
  const [input, setInput] = useState(state.draftInput || '');
  const [supplementaryInstruction, setSupplementaryInstruction] = useState('');
  const [manualHighlights, setManualHighlights] = useState<ManualHighlight[]>([]);
  const [draftAssets, setDraftAssets] = useState<DraftAsset[]>([]);
  
  const [tasks, setTasks] = useState<ParseTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [showHistory, setShowHistory] = useState(false);
  const [selectedModel, setSelectedModel] = useState(state.settings.parseModel);
  const [explicitFunction, setExplicitFunction] = useState<string>('auto');
  const [explicitPurpose, setExplicitPurpose] = useState<string>('auto');
  const [markAsMistake, setMarkAsMistake] = useState(false);
  const [annotatorAssetId, setAnnotatorAssetId] = useState<string | null>(null);
  const [imageOptions, setImageOptions] = useState({
    enhanceImage: true,
    preserveAnnotations: true,
    splitQuestions: true,
    extractVocabulary: true,
    prioritizeAccuracy: true,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setSelectedModel(state.settings.parseModel); }, [state.settings.parseModel]);

  const functionOptions = useMemo(() => Array.from(new Set([...DEFAULT_FUNCTIONS, ...state.memories.map(m => m.functionType)])).filter(Boolean), [state.memories]);
  const purposeOptions = useMemo(() => Array.from(new Set([...DEFAULT_PURPOSES, ...state.memories.map(m => m.purposeType)])).filter(Boolean), [state.memories]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files) return;
    for (const file of Array.from(event.target.files)) {
      let preview = await readAsDataUrl(file);
      if (file.type.startsWith('image/') && imageOptions.enhanceImage) preview = await enhanceDocumentImage(preview);
      const resourceId = uuidv4();
      dispatch({ type: 'ADD_RESOURCE', payload: { id: resourceId, name: file.name, type: file.type, size: file.size, createdAt: Date.now(), updatedAt: Date.now(), data: preview, subject: state.currentSubject, origin: 'input_upload', retentionPolicy: 'auto', expiresAt: getAutoExpireAt(21), tags: [workflow], isFolder: false, parentId: null } });
      setDraftAssets(prev => [...prev, { resourceId, name: file.name, preview, type: file.type, size: file.size }]);
    }
    event.target.value = '';
  }, [dispatch, imageOptions.enhanceImage, state.currentSubject, workflow]);

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
      isNew: true,
    };
    
    setTasks(prev => [newTask, ...prev]);
    setSelectedTaskId(null); // Return to task list view to see it processing

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
      try {
        const result = await parseNotes(
          promptText, 
          snapshots.subject, 
          snapshots.knowledgeNodes, 
          snapshots.settings, 
          snapshots.assets, 
          snapshots.expFunc !== 'auto' ? snapshots.expFunc : undefined, 
          snapshots.expPurp !== 'auto' ? snapshots.expPurp : undefined, 
          undefined, 
          undefined, 
          snapshots.funcOptions, 
          snapshots.purpOptions
        );
        
        const historyItem: InputHistoryItem = { 
          id: taskId, 
          timestamp: Date.now(), 
          subject: snapshots.subject, 
          workflow: snapshots.workflow, 
          input: snapshots.input, 
          images: snapshots.assets, 
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
          pendingReview: normalizePendingReviewState({ id: taskId, workflow: snapshots.workflow, ...result, options: snapshots.options }, result.identifiedSubject || snapshots.subject)
        } : t));

      } catch (e: any) { 
        setTasks(prev => prev.map(t => t.id === taskId ? {
          ...t,
          status: 'failed',
          error: e.message
        } : t));
      }
    })();
  }, [input, draftAssets, workflow, imageOptions, supplementaryInstruction, manualHighlights, state.currentSubject, state.knowledgeNodes, state.settings, selectedModel, explicitFunction, explicitPurpose, functionOptions, purposeOptions, dispatch]);

  const persistParsedItems = useCallback(async (task: ParseTask) => {
    if (!task.pendingReview) return;
    const { pendingReview } = task;

    if (pendingReview.identifiedSubject !== state.currentSubject) dispatch({ type: 'SET_SUBJECT', payload: pendingReview.identifiedSubject });
    if (pendingReview.newNodes.length > 0) dispatch({ type: 'BATCH_ADD_NODES', payload: pendingReview.newNodes });
    if (pendingReview.deletedNodeIds.length > 0) dispatch({ type: 'BATCH_DELETE_NODES', payload: pendingReview.deletedNodeIds });
    const now = Date.now();

    // Since we cleared draftAssets earlier, we must rely on history or task context if we want to link images.
    // However, pending tasks don't store asset models directly. But for simplicity, we'll link them if we pass the ids.
    // For now we don't have draftAssets mapped here, let's omit image linking in task saving unless we stored it in ParseTask.
    // To fix this quickly, we just use text.
    
    const memories = pendingReview.parsedItems.map(item => {
      const res = createMemoryPayload({ 
        id: uuidv4(), 
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
        sourceType: 'text', 
        isMistake: item.isMistake || markAsMistake, 
        wrongAnswer: item.wrongAnswer, 
        errorReason: item.errorReason, 
        visualDescription: item.visualDescription, 
        analysisProcess: pendingReview.aiAnalysis, 
        fsrs: getInitialFSRSData(), 
        type: item.type, 
        vocabularyData: item.vocabularyData, 
        dataSource: 'ai_parse', 
        ingestionMode: pendingReview.workflow, 
        ingestionSessionId: pendingReview.id 
      });
      return res.ok ? res.value : null;
    }).filter(Boolean);

    if (memories.length > 0) dispatch({ type: 'BATCH_ADD_MEMORIES', payload: memories } as any);
    
    // Remove task from active list
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setSelectedTaskId(null);
  }, [state.currentSubject, dispatch, explicitFunction, explicitPurpose, markAsMistake]);

  const viewTask = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, isNew: false } : t));
    setSelectedTaskId(taskId);
  };

  const restoreHistoryItem = useCallback((item: InputHistoryItem) => {
    const norm = normalizeInputHistoryItem(item, state.currentSubject) || item;
    setWorkflow(normalizeInputHistoryWorkflow(norm.workflow, norm.images?.length || 0, norm.parsedItems?.length || 0));
    setInput(toDisplayText(norm.input));
    setDraftAssets((norm.images || []).map((img, i) => ({ resourceId: norm.imageResourceIds?.[i] || uuidv4(), name: `Hist-${i+1}`, preview: toDisplayText(img), type: 'image/*', size: 0 })));
    setShowHistory(false);
  }, [state.currentSubject]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      return b.createdAt - a.createdAt;
    });
  }, [tasks]);

  const selectedTask = tasks.find(t => t.id === selectedTaskId);

  return (
    <div className="flex flex-col h-full bg-black select-none overflow-hidden sm:flex-row">
      <div className="w-full sm:w-16 md:w-20 lg:w-24 bg-slate-900 border-b sm:border-b-0 sm:border-r border-slate-800 flex sm:flex-col items-center py-2 sm:py-4 gap-4 px-4 sm:px-0 shrink-0">
        <div className="p-2 bg-indigo-500/10 rounded-xl hidden sm:block"><BrainCircuit className="w-6 h-6 text-indigo-400" /></div>
        {(Object.keys(WORKFLOW_META) as IngestionMode[]).map((mode) => {
          const meta = WORKFLOW_META[mode];
          const Icon = meta.icon;
          const isActive = workflow === mode;
          return <button key={mode} onClick={() => setWorkflow(mode)} title={meta.label} className={clsx('group relative p-2 md:p-3 rounded-2xl transition-all', isActive ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300')}><Icon className="w-5 h-5 md:w-6 md:h-6" /><span className="text-[10px] font-bold block sm:hidden">{meta.label}</span></button>;
        })}
      </div>

      <div className="flex-1 flex flex-col min-w-0 bg-slate-950 overflow-hidden">
        <div className="h-12 border-b border-slate-900 flex items-center justify-between px-4 bg-slate-950/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-3"><h2 className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500 shadow-xl" />{WORKFLOW_META[workflow].label} 工坊</h2></div>
          <div className="flex items-center gap-2"><button onClick={() => setShowHistory(!showHistory)} className={clsx("p-2 rounded-lg transition-colors", showHistory ? "bg-indigo-500/10 text-indigo-400" : "text-slate-500 hover:text-slate-300")}><History className="w-4 h-4" /></button><ModelSelector /><button disabled={!input.trim() && draftAssets.length === 0} onClick={handleAnalyze} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full text-xs font-black transition-all flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"><Sparkles className="w-3 h-3" />创建解析任务</button></div>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          <div className="flex-1 flex flex-col border-r border-slate-900 min-w-0">
            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              <div className="relative bg-slate-900/30 border border-slate-800 rounded-2xl p-2 focus-within:border-indigo-500/50 transition-all">
                <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="在此输入文本内容，或上传素材辅助解析..." className="w-full bg-transparent p-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none min-h-[160px] md:min-h-[220px] resize-none" />
                <div className="flex items-center justify-between px-2 pb-2"><div className="flex gap-4"><button onClick={() => fileInputRef.current?.click()} className="p-1 text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-2"><UploadCloud className="w-4 h-4" /><span className="text-[10px] font-bold uppercase tracking-widest">上传素材</span></button></div><input ref={fileInputRef} type="file" className="hidden" multiple accept="image/*,.pdf,.txt" onChange={handleFileUpload} /><div className="text-[10px] font-bold text-slate-600 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">智能录入模式</div></div>
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

          <div className={clsx("w-full md:w-[360px] lg:w-[420px] shrink-0 border-l border-slate-900 bg-slate-950 flex flex-col transition-all")}>
            <div className="h-12 border-b border-slate-900 flex items-center justify-between px-4 shrink-0 bg-slate-900/20">
              <div className="flex items-center gap-2">
                <Layers3 className="w-4 h-4 text-indigo-400" />
                <span className="text-[11px] font-black text-slate-300 uppercase tracking-widest">
                  {selectedTask ? '任务详情' : '状态中心'}
                </span>
              </div>
              {selectedTask && (
                <button onClick={() => setSelectedTaskId(null)} className="text-[10px] text-slate-500 hover:text-indigo-400 font-bold uppercase tracking-widest">返回列表</button>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              {!selectedTask ? (
                // Task List View
                <div className="space-y-3">
                  {sortedTasks.length === 0 ? (
                    <div className="h-full mt-24 flex items-center justify-center text-slate-700 text-[10px] font-black uppercase tracking-[0.2em] text-center">暂无运行或待处理的任务</div>
                  ) : (
                    sortedTasks.map(task => (
                      <div key={task.id} onClick={() => { if (task.status === 'completed') viewTask(task.id); }} className={clsx("bg-slate-900/60 border rounded-xl p-4 transition-all relative overflow-hidden", task.status === 'completed' ? "cursor-pointer hover:border-indigo-500/50" : "", task.isNew && task.status === 'completed' ? "border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "border-slate-800")}>
                        {task.isNew && task.status === 'completed' && <div className="absolute top-0 right-0 w-2 h-2 bg-emerald-500 rounded-full m-3 shadow-[0_0_8px_rgba(16,185,129,1)]" />}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[9px] font-black uppercase text-indigo-400">{WORKFLOW_META[task.workflow].label}</span>
                          <span className="text-[10px] font-bold text-slate-500">{new Date(task.createdAt).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-xs text-slate-300 font-sans line-clamp-2 leading-relaxed mb-3">{task.inputExcerpt}</div>
                        <div className="flex items-center justify-between mt-auto">
                          {task.status === 'processing' && <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-500"><Loader2 className="w-3 h-3 animate-spin"/> 处理中...</div>}
                          {task.status === 'completed' && <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500"><Check className="w-3 h-3"/> 处理完成，点击查看</div>}
                          {task.status === 'failed' && <div className="flex items-center gap-1.5 text-[10px] font-bold text-rose-500"><AlertCircle className="w-3 h-3"/> 解析失败</div>}
                          
                          {(task.status === 'completed' || task.status === 'failed') && (
                            <button onClick={(e) => { e.stopPropagation(); setTasks(prev => prev.filter(t => t.id !== task.id)); }} className="text-slate-600 hover:text-rose-400 p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                // Task Detail View
                <div className="space-y-4">
                  {selectedTask.status === 'failed' ? (
                     <div className="text-rose-400 text-xs p-4 bg-rose-500/10 rounded-xl border border-rose-500/20">{selectedTask.error}</div>
                  ) : selectedTask.pendingReview ? (
                    <>
                      {selectedTask.pendingReview.aiAnalysis && <div className="bg-indigo-500/5 border-l-4 border-l-indigo-500 p-3 text-[11px] text-slate-400 leading-relaxed"><Markdown>{selectedTask.pendingReview.aiAnalysis}</Markdown></div>}
                      {selectedTask.pendingReview.parsedItems.map((item, idx) => (
                        <div key={idx} className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 hover:border-emerald-500/30 transition-all font-sans relative">
                          <div className="absolute top-2 right-2"><button onClick={() => {
                            if (!selectedTask.pendingReview) return;
                            const newItems = selectedTask.pendingReview.parsedItems.filter((_, i) => i !== idx);
                            setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, pendingReview: { ...t.pendingReview!, parsedItems: newItems } } : t));
                          }} className="p-1 text-slate-700 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button></div>
                          <div className={clsx("inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase mb-3", item.isMistake ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400")}>{item.isMistake ? 'MISTAKE' : 'KNOWLEDGE'}</div>
                          <div className="prose prose-invert prose-sm text-slate-200 text-[13px]"><Markdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{item.content}</Markdown></div>
                        </div>
                      ))}
                    </>
                  ) : null}
                </div>
              )}
            </div>
            
            {selectedTask && selectedTask.status === 'completed' && selectedTask.pendingReview && (
              <div className="p-4 border-t border-slate-900 bg-slate-950">
                <button onClick={() => persistParsedItems(selectedTask)} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xl active:scale-95 transition-all">确认并保存 {selectedTask.pendingReview.parsedItems.length} 项</button>
              </div>
            )}
          </div>

          {showHistory && (
            <div className="absolute inset-0 z-50 bg-slate-950/98 backdrop-blur-xl p-4 sm:p-8 flex flex-col">
              <div className="max-w-3xl mx-auto w-full h-full flex flex-col">
                <div className="flex items-center justify-between mb-8"><div className="flex items-center gap-2"><History className="w-5 h-5 text-indigo-400" /><h2 className="text-sm font-black text-white uppercase tracking-widest">录入历史</h2></div><button onClick={() => setShowHistory(false)} className="p-2 text-slate-500 hover:text-white"><X className="w-6 h-6" /></button></div>
                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                  {state.inputHistory.length === 0 ? <p className="text-center text-slate-600 py-12 text-xs">暂无历史记录</p> : 
                    [...state.inputHistory].reverse().map(item => (
                      <div key={item.id} onClick={() => restoreHistoryItem(item)} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 hover:border-indigo-500/50 transition-all cursor-pointer group">
                        <div className="flex justify-between items-center mb-2"><span className="text-[10px] font-bold text-slate-600">{new Date(item.timestamp).toLocaleString()}</span><span className="text-[9px] font-black text-indigo-400 uppercase">{item.workflow}</span></div>
                        <div className="text-sm text-slate-300 line-clamp-1 mb-1 font-sans">{toDisplayText(item.input) || '素材录入'}</div>
                        <div className="text-[10px] font-bold text-slate-600 group-hover:text-indigo-400">点击恢复 →</div>
                      </div>
                    ))
                  }
                </div>
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
