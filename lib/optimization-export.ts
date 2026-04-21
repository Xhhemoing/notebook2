import { AppState, Resource, Subject } from './types';
import { evaluateMemoryQuality } from './data/quality';

export interface OptimizationExportBundle {
  exportedAt: number;
  subject: Subject | 'all';
  profile: {
    studentProfile?: string;
    homeworkPreferences?: string;
    userSymbols?: string;
    aiAttentionNotes?: string;
    feedbackLearningNotes?: string;
  };
  stats: {
    memories: number;
    mistakes: number;
    logs: number;
    feedbackEvents: number;
    resources: number;
  };
  recentInputs: AppState['inputHistory'];
  feedbackEvents: AppState['feedbackEvents'];
  logs: AppState['logs'];
  lowQualityMemories: Array<{
    id: string;
    subject: Subject;
    content: string;
    qualityScore: number;
    qualityFlags: string[];
    functionType: string;
    purposeType: string;
  }>;
  resources: Array<Pick<Resource, 'id' | 'name' | 'subject' | 'type' | 'origin' | 'retentionPolicy' | 'expiresAt' | 'createdAt'> & {
    data?: string;
  }>;
}

function matchesSubject(subject: Subject | 'all', current: Subject) {
  return subject === 'all' || current === subject;
}

export function createOptimizationExportBundle(
  state: AppState,
  subject: Subject | 'all',
  includeImages: boolean
): OptimizationExportBundle {
  const memories = state.memories.filter((memory) => matchesSubject(subject, memory.subject));
  const resourceIds = new Set<string>();

  for (const memory of memories) {
    for (const resourceId of memory.sourceResourceIds || []) {
      resourceIds.add(resourceId);
    }
  }

  const logs = (state.logs || [])
    .filter((log) => !log.subject || matchesSubject(subject, log.subject))
    .slice(0, 200);
  const feedbackEvents = (state.feedbackEvents || [])
    .filter((event) => matchesSubject(subject, event.subject))
    .slice(0, 200);
  const recentInputs = (state.inputHistory || [])
    .filter((item) => matchesSubject(subject, item.subject))
    .slice(0, 50);

  for (const item of recentInputs) {
    for (const resourceId of item.imageResourceIds || []) {
      resourceIds.add(resourceId);
    }
  }

  for (const log of logs) {
    for (const resourceId of log.resourceIds || []) {
      resourceIds.add(resourceId);
    }
  }

  const lowQualityMemories = memories
    .map((memory) => {
      const quality = evaluateMemoryQuality(memory);
      return {
        id: memory.id,
        subject: memory.subject,
        content: memory.content,
        qualityScore: quality.score,
        qualityFlags: quality.flags,
        functionType: memory.functionType,
        purposeType: memory.purposeType,
      };
    })
    .filter((memory) => memory.qualityFlags.length > 0 || memory.qualityScore < 85)
    .sort((left, right) => left.qualityScore - right.qualityScore)
    .slice(0, 50);

  const resources = (state.resources || [])
    .filter((resource) => matchesSubject(subject, resource.subject))
    .filter((resource) => resourceIds.has(resource.id) || resource.origin === 'chat_upload' || resource.origin === 'input_upload')
    .slice(0, includeImages ? 80 : 30)
    .map((resource) => ({
      id: resource.id,
      name: resource.name,
      subject: resource.subject,
      type: resource.type,
      origin: resource.origin,
      retentionPolicy: resource.retentionPolicy,
      expiresAt: resource.expiresAt,
      createdAt: resource.createdAt,
      data: includeImages ? resource.data : undefined,
    }));

  return {
    exportedAt: Date.now(),
    subject,
    profile: {
      studentProfile: state.settings.studentProfile,
      homeworkPreferences: state.settings.homeworkPreferences,
      userSymbols: state.settings.userSymbols,
      aiAttentionNotes: state.settings.aiAttentionNotes,
      feedbackLearningNotes: state.settings.feedbackLearningNotes,
    },
    stats: {
      memories: memories.length,
      mistakes: memories.filter((memory) => memory.isMistake).length,
      logs: logs.length,
      feedbackEvents: feedbackEvents.length,
      resources: resources.length,
    },
    recentInputs,
    feedbackEvents,
    logs,
    lowQualityMemories,
    resources,
  };
}

export function createOptimizationMarkdown(bundle: OptimizationExportBundle) {
  const lines: string[] = [];
  lines.push('# Notebook Optimization Package');
  lines.push('');
  lines.push(`- Exported At: ${new Date(bundle.exportedAt).toISOString()}`);
  lines.push(`- Subject: ${bundle.subject}`);
  lines.push(
    `- Stats: memories=${bundle.stats.memories}, mistakes=${bundle.stats.mistakes}, logs=${bundle.stats.logs}, feedback=${bundle.stats.feedbackEvents}, resources=${bundle.stats.resources}`
  );
  lines.push('');
  lines.push('## Profile');
  lines.push(bundle.profile.studentProfile || 'No student profile.');
  lines.push('');
  if (bundle.profile.homeworkPreferences) {
    lines.push('## Homework Preferences');
    lines.push(bundle.profile.homeworkPreferences);
    lines.push('');
  }
  if (bundle.profile.aiAttentionNotes || bundle.profile.feedbackLearningNotes) {
    lines.push('## AI Attention Notes');
    if (bundle.profile.aiAttentionNotes) lines.push(bundle.profile.aiAttentionNotes);
    if (bundle.profile.feedbackLearningNotes) lines.push(bundle.profile.feedbackLearningNotes);
    lines.push('');
  }
  lines.push('## Recent Inputs');
  for (const item of bundle.recentInputs.slice(0, 10)) {
    lines.push(`- [${item.workflow}] ${item.input || '(image-only input)'} `);
  }
  lines.push('');
  lines.push('## Feedback Events');
  for (const event of bundle.feedbackEvents.slice(0, 20)) {
    lines.push(`- ${event.signalType}: ${event.note || '(no note)'}`);
  }
  lines.push('');
  lines.push('## Low Quality Memories');
  for (const memory of bundle.lowQualityMemories.slice(0, 20)) {
    lines.push(`- (${memory.qualityScore}) ${memory.content} | flags=${memory.qualityFlags.join(', ')}`);
  }
  return lines.join('\n');
}
