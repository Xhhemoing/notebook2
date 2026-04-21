import { AILog, AppState, Resource, Settings, UserFeedbackEvent } from './types';
import { normalizeInputHistoryItems } from './input-history';

const DAY_MS = 24 * 60 * 60 * 1000;

function pluralizeWorkflow(workflow: string) {
  if (workflow === 'image_pro') return '图片专业处理';
  if (workflow === 'exam') return '整卷分析';
  if (workflow === 'quick') return '常规快速录入';
  return workflow;
}

export function getAutoExpireAt(days: number, now = Date.now()) {
  return now + Math.max(1, days) * DAY_MS;
}

export function buildFeedbackLearningNotes(events: UserFeedbackEvent[]) {
  if (!events || events.length === 0) return '';

  const recentEvents = events.slice(0, 200);
  const counts = new Map<string, number>();
  const workflows = new Map<string, number>();
  const notes = new Set<string>();

  for (const event of recentEvents) {
    counts.set(event.signalType, (counts.get(event.signalType) || 0) + 1);

    const workflow = typeof event.metadata?.workflow === 'string' ? event.metadata.workflow : undefined;
    if (workflow) {
      workflows.set(workflow, (workflows.get(workflow) || 0) + 1);
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
    lines.push(`用户最近更常使用的录入流程：${workflowSummary}。`);
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
    lines.push('当前对话反馈整体偏正向，延续“结构化、直给结论、兼顾依据”的表达方式。');
  }

  if ((counts.get('resource_pinned') || 0) >= 1) {
    lines.push('被固定保存的图片/资料通常是高价值样本，后续优化时应优先参考这些资料的格式与信息密度。');
  }

  if (notes.size > 0) {
    lines.push(`用户显式反馈要点：${Array.from(notes).slice(0, 6).join('；')}。`);
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
  const feedbackLearningNotes = buildFeedbackLearningNotes(state.feedbackEvents || []);
  const referencedResourceIds = getReferencedResourceIds(state);
  const normalizedResources = (state.resources || []).map((resource) =>
    normalizeResourceRetention(resource, state.settings)
  );
  const expiredResourceIds = new Set(
    getExpiredResourceIds(normalizedResources, state.settings, referencedResourceIds, now)
  );

  const resources = normalizedResources.filter((resource) => !expiredResourceIds.has(resource.id));
  const logs = pruneLogs(state.logs || [], state.settings, now);
  // Preserve history image ids so restored image annotations can still rebind after resource auto-cleanup.
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
