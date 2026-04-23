import { AILog, AppState, Resource, Settings, UserFeedbackEvent } from './types';
import { normalizeInputHistoryItems } from './input-history';
import { buildPromptOptimizationNotes } from './prompting';

const DAY_MS = 24 * 60 * 60 * 1000;
export const FEEDBACK_QUICK_TAGS = ['挂错节点', '检索不准', '回答跑偏', '解释太浅', '速度太慢'] as const;

function pluralizeWorkflow(workflow: string) {
  if (workflow === 'image_pro') return '图片专业处理';
  if (workflow === 'exam') return '整卷分析';
  if (workflow === 'quick') return '常规快速录入';
  return workflow;
}

export function getAutoExpireAt(days: number, now = Date.now()) {
  return now + Math.max(1, days) * DAY_MS;
}

export function buildFeedbackLearningNotes(events: UserFeedbackEvent[], logs: AILog[] = []) {
  const recentEvents = (events || []).slice(0, 200);
  const counts = new Map<string, number>();
  const workflows = new Map<string, number>();
  const quickTags = new Map<string, number>();
  const notes = new Set<string>();

  for (const event of recentEvents) {
    counts.set(event.signalType, (counts.get(event.signalType) || 0) + 1);

    const workflow = typeof event.metadata?.workflow === 'string' ? event.metadata.workflow : undefined;
    if (workflow) {
      workflows.set(workflow, (workflows.get(workflow) || 0) + 1);
    }

    const quickTag = typeof event.metadata?.feedbackTag === 'string' ? event.metadata.feedbackTag : undefined;
    if (quickTag) {
      quickTags.set(quickTag, (quickTags.get(quickTag) || 0) + 1);
    }

    const note = event.note?.trim();
    if (note) {
      notes.add(note);
    }
  }

  const lines: string[] = [];
  const sortedWorkflows = Array.from(workflows.entries()).sort((left, right) => right[1] - left[1]);

  if (sortedWorkflows.length > 0) {
    const workflowSummary = sortedWorkflows
      .slice(0, 3)
      .map(([workflow, count]) => `${pluralizeWorkflow(workflow)}(${count})`)
      .join('、');
    lines.push(`用户最近更常使用的流程：${workflowSummary}。`);
  }

  if ((counts.get('ingestion_regenerated') || 0) >= 2) {
    lines.push('用户对生成结果有迭代习惯，AI 应先保留原题信息和结构，再逐步优化，不要一次性过度改写。');
  }

  if ((counts.get('memory_edited') || 0) >= 2) {
    lines.push('用户经常手动修订记忆内容，AI 录入时应优先保证术语、题干和条件准确，减少自行发挥。');
  }

  if ((counts.get('memory_deleted') || 0) >= 1 || (counts.get('chat_inaccurate') || 0) >= 1) {
    lines.push('当信息不确定时，宁可少收录也不要过度推断；对模糊图像或不完整对话要明确标注不确定性。');
  }

  if ((counts.get('chat_helpful') || 0) > (counts.get('chat_inaccurate') || 0)) {
    lines.push('当前对话反馈整体偏正向，继续保持“结构化、先给结论、兼顾依据”的表达方式。');
  }

  if ((counts.get('resource_pinned') || 0) >= 1) {
    lines.push('被固定保存的图片或资料通常是高价值样本，后续优化时应优先参考这些资料的格式与信息密度。');
  }

  const sortedTags = Array.from(quickTags.entries()).sort((left, right) => right[1] - left[1]);
  if (sortedTags.length > 0) {
    lines.push(`高频负反馈标签：${sortedTags.slice(0, 3).map(([tag, count]) => `${tag}(${count})`).join('、')}。`);
  }
  if ((quickTags.get('挂错节点') || 0) >= 2) {
    lines.push('导图挂载要优先复用当前节点与已有子树；如果父级不明确，应直接拦截等待确认。');
  }
  if ((quickTags.get('检索不准') || 0) >= 2) {
    lines.push('问答检索应先按当前导图范围收窄，再做混合召回，避免跨主题记忆污染答案。');
  }
  if ((quickTags.get('回答跑偏') || 0) >= 2 || (quickTags.get('解释太浅') || 0) >= 2) {
    lines.push('回答应围绕当前节点路径给出“结论 + 关键依据 + 易错点/方法”，减少泛泛铺陈。');
  }
  if ((quickTags.get('速度太慢') || 0) >= 2) {
    lines.push('优先保持 hybrid-only 检索链路，避免额外 rerank 或 late interaction 增加时延。');
  }

  if (notes.size > 0) {
    lines.push(`用户显式反馈要点：${Array.from(notes).slice(0, 6).join('；')}。`);
  }

  for (const note of buildPromptOptimizationNotes(logs, recentEvents)) {
    lines.push(note);
  }

  return lines.join('\n');
}

export function getReferencedResourceIds(state: Pick<AppState, 'memories' | 'textbooks'>) {
  const ids = new Set<string>();

  for (const memory of state.memories || []) {
    for (const resourceId of memory.sourceResourceIds || []) {
      ids.add(resourceId);
    }
  }

  for (const textbook of state.textbooks || []) {
    if (textbook.fileId) {
      ids.add(textbook.fileId);
    }
  }

  return ids;
}

function normalizeLogRetentionDays(settings: Settings) {
  return Math.max(1, settings.logRetentionDays || 30);
}

function normalizeResourceRetentionDays(settings: Settings) {
  return Math.max(1, settings.resourceAutoCleanupDays || 30);
}

export function pruneLogs(logs: AILog[], settings: Settings, now = Date.now()) {
  if (!settings.autoCleanupLogs) {
    return logs.slice(0, 500);
  }

  const threshold = now - normalizeLogRetentionDays(settings) * DAY_MS;
  return logs.filter((log) => log.timestamp >= threshold).slice(0, 500);
}

export function normalizeResourceRetention(resource: Resource, settings: Settings) {
  if (resource.isFolder) return resource;

  const retentionPolicy =
    resource.retentionPolicy || (!resource.origin || resource.origin === 'manual' ? 'manual' : 'auto');
  const next: Resource = {
    ...resource,
    retentionPolicy,
  };

  if (retentionPolicy === 'auto' && !next.expiresAt) {
    next.expiresAt = getAutoExpireAt(normalizeResourceRetentionDays(settings), resource.createdAt || Date.now());
  }

  return next;
}

export function getExpiredResourceIds(
  resources: Resource[],
  settings: Settings,
  referencedIds: Set<string>,
  now = Date.now()
) {
  if (!settings.autoCleanupResources) return [];

  return resources
    .filter((resource) => !resource.isFolder)
    .filter((resource) => resource.retentionPolicy === 'auto')
    .filter((resource) => Number.isFinite(resource.expiresAt) && (resource.expiresAt as number) <= now)
    .filter((resource) => !resource.pinnedAt)
    .filter((resource) => !referencedIds.has(resource.id))
    .map((resource) => resource.id);
}

export function applyDataRetention(state: AppState, now = Date.now()): AppState {
  const feedbackLearningNotes = buildFeedbackLearningNotes(state.feedbackEvents || [], state.logs || []);
  const referencedResourceIds = getReferencedResourceIds(state);
  const normalizedResources = (state.resources || []).map((resource) =>
    normalizeResourceRetention(resource, state.settings)
  );
  const expiredResourceIds = new Set(
    getExpiredResourceIds(normalizedResources, state.settings, referencedResourceIds, now)
  );

  const resources = normalizedResources.filter((resource) => !expiredResourceIds.has(resource.id));
  const logs = pruneLogs(state.logs || [], state.settings, now);
  const inputHistory = normalizeInputHistoryItems(state.inputHistory, state.currentSubject || '数学');

  return {
    ...state,
    logs,
    resources,
    inputHistory,
    feedbackEvents: (state.feedbackEvents || []).slice(0, 500),
    settings: {
      ...state.settings,
      feedbackLearningNotes,
    },
  };
}
