import { v4 as uuidv4 } from 'uuid';
import { Memory } from '../types';
import { MemoryCreateInput, memoryCreateSchema } from './schemas';
import { evaluateMemoryQuality, MEMORY_QUALITY_RULE_VERSION } from './quality';

type CommandResult<T> = { ok: true; value: T; warnings?: string[] } | { ok: false; error: string };

function clampScore(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value));
}

function normalizeText(content: string) {
  return content.replace(/\s+/g, ' ').trim();
}

export function createMemoryPayload(input: MemoryCreateInput): CommandResult<Memory> {
  const parsed = memoryCreateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues.map((issue) => issue.message).join('; '),
    };
  }

  const now = Date.now();
  const data = parsed.data;
  const content = normalizeText(data.content);
  const knowledgeNodeIds = Array.from(new Set(data.knowledgeNodeIds || []));
  const sourceResourceIds = Array.from(new Set(data.sourceResourceIds || []));
  const hasImageReference = Boolean(data.imageUrl) || (data.imageUrls || []).length > 0;

  if (!content) {
    return { ok: false, error: 'content is empty after normalization' };
  }
  if (data.sourceType === 'image' && !hasImageReference) {
    return { ok: false, error: 'sourceType=image requires imageUrl or imageUrls' };
  }

  const payload = {
    ...(data as Record<string, unknown>),
    id: data.id || uuidv4(),
    subject: data.subject.trim(),
    content,
    functionType: data.functionType.trim(),
    purposeType: data.purposeType.trim(),
    sourceType: data.sourceType || 'text',
    knowledgeNodeIds,
    sourceResourceIds,
    confidence: clampScore(data.confidence ?? 50, 50),
    mastery: clampScore(data.mastery ?? 0, 0),
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    version: data.version ?? 1,
    status: data.status ?? 'active',
    dataSource: data.dataSource ?? 'manual',
  } as Memory;

  const quality = evaluateMemoryQuality(payload);
  payload.qualityScore = quality.score;
  payload.qualityFlags = quality.flags;
  payload.qualityRuleVersion = MEMORY_QUALITY_RULE_VERSION;

  return { ok: true, value: payload, warnings: quality.flags };
}

export function createMemoryPayloadOrThrow(input: MemoryCreateInput): Memory {
  const result = createMemoryPayload(input);
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}
