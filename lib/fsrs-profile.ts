import { default_w, fsrs, generatorParameters } from 'ts-fsrs';

import type { FSRSProfile, ReviewEvent } from '@/lib/types';

const DEFAULT_RETENTION = 0.9;
export const MIN_FSRS_EVENT_COUNT = 100;
export const MIN_FSRS_DISTINCT_MEMORY_COUNT = 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return DEFAULT_RETENTION;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
}

function optimizeParametersFromEvents(events: ReviewEvent[], desiredRetention: number) {
  const successRate =
    events.filter((event) => event.rating >= 2).length / Math.max(1, events.length);
  const hardRate = events.filter((event) => event.rating === 2).length / Math.max(1, events.length);
  const easyRate = events.filter((event) => event.rating === 4).length / Math.max(1, events.length);
  const schedulingRatio =
    events.reduce((sum, event) => sum + event.elapsedDays / Math.max(1, event.scheduledDays || 1), 0) /
    Math.max(1, events.length);

  const weights = [...default_w];
  const retentionGap = desiredRetention - successRate;
  const stabilityScale = clamp(1 - retentionGap * 0.6, 0.75, 1.25);

  for (let index = 0; index < 4; index += 1) {
    weights[index] = weights[index] * stabilityScale;
  }

  weights[6] = weights[6] * (1 + hardRate * 0.2);
  weights[7] = clamp(weights[7] + easyRate * 0.03 - hardRate * 0.02, 0.001, 0.95);
  weights[8] = weights[8] * clamp(1 - retentionGap * 0.4, 0.75, 1.25);
  weights[9] = weights[9] * clamp(1 + Math.max(0, retentionGap) * 0.3, 0.85, 1.25);
  weights[10] = weights[10] * (1 + easyRate * 0.12);
  weights[11] = weights[11] * clamp(1 + Math.max(0, 1 - successRate) * 0.4, 0.9, 1.4);
  weights[12] = weights[12] * clamp(1 + hardRate * 0.1, 0.9, 1.2);
  weights[13] = weights[13] * clamp(1 + Math.max(0, schedulingRatio - 1) * 0.15, 0.85, 1.2);
  weights[14] = weights[14] * clamp(1 + Math.max(0, 1 - successRate) * 0.25, 0.9, 1.3);

  return generatorParameters({ w: weights }).w as number[];
}

function computeCMRRLowerBound(events: ReviewEvent[]) {
  const byMemory = new Map<string, ReviewEvent[]>();
  events.forEach((event) => {
    if (!byMemory.has(event.memoryId)) byMemory.set(event.memoryId, []);
    byMemory.get(event.memoryId)!.push(event);
  });

  const perMemorySuccess = Array.from(byMemory.values())
    .filter((items) => items.length >= 2)
    .map((items) => items.filter((item) => item.rating >= 2).length / items.length);

  return clamp(percentile(perMemorySuccess, 0.25), 0.8, 0.97);
}

function recommendRetention(events: ReviewEvent[], parameters: number[], cmrrLowerBound: number) {
  const averageStability =
    events.reduce((sum, event) => sum + (event.stabilityAfter || event.stabilityBefore || 1), 0) /
    Math.max(1, events.length);

  let bestRetention = DEFAULT_RETENTION;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let retention = 0.8; retention <= 0.97 + 1e-6; retention += 0.01) {
    const roundedRetention = Number(retention.toFixed(2));
    if (roundedRetention < cmrrLowerBound) continue;

    const scheduler = fsrs({ request_retention: roundedRetention, w: parameters });
    const interval = Math.max(1, scheduler.next_interval(averageStability, 0));
    const dailyReviewLoad = 1 / interval;
    const score = roundedRetention * 100 - dailyReviewLoad * 18;

    if (score > bestScore) {
      bestScore = score;
      bestRetention = roundedRetention;
    }
  }

  return bestRetention;
}

export function getSubjectFSRSProfile(profiles: FSRSProfile[], subject: string) {
  return profiles.find((profile) => profile.subject === subject);
}

export function buildFSRSProfile(subject: string, events: ReviewEvent[], desiredRetention?: number): FSRSProfile {
  const subjectEvents = events.filter((event) => event.subject === subject);
  const distinctMemoryCount = new Set(subjectEvents.map((event) => event.memoryId)).size;
  const targetRetention = clamp(desiredRetention || DEFAULT_RETENTION, 0.8, 0.97);

  if (subjectEvents.length < MIN_FSRS_EVENT_COUNT || distinctMemoryCount < MIN_FSRS_DISTINCT_MEMORY_COUNT) {
    return {
      id: `fsrs:${subject}`,
      subject,
      parameters: [...default_w],
      desiredRetention: targetRetention,
      recommendedRetention: DEFAULT_RETENTION,
      cmrrLowerBound: DEFAULT_RETENTION,
      updatedAt: Date.now(),
      eventCount: subjectEvents.length,
      distinctMemoryCount,
      status: subjectEvents.length === 0 ? 'temporary' : 'collecting',
      notes: `需要至少 ${MIN_FSRS_EVENT_COUNT} 条复习事件和 ${MIN_FSRS_DISTINCT_MEMORY_COUNT} 张不同卡片后再优化`,
    };
  }

  const parameters = optimizeParametersFromEvents(subjectEvents, targetRetention);
  const cmrrLowerBound = computeCMRRLowerBound(subjectEvents);
  const recommendedRetention = recommendRetention(subjectEvents, parameters, cmrrLowerBound);

  return {
    id: `fsrs:${subject}`,
    subject,
    parameters,
    desiredRetention: targetRetention,
    recommendedRetention,
    cmrrLowerBound,
    updatedAt: Date.now(),
    optimizedAt: Date.now(),
    eventCount: subjectEvents.length,
    distinctMemoryCount,
    status: 'optimized',
    notes: '基于当前学科复习日志生成的个性化参数',
  };
}
