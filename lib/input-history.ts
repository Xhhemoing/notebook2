import { IngestionMode, InputHistoryItem, Subject } from './types';

function normalizeText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  if (Array.isArray(value)) {
    return value.map(normalizeText).filter(Boolean).join('\n').trim();
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'content', 'value', 'message']) {
      if (key in record) {
        const normalized = normalizeText(record[key]);
        if (normalized) return normalized;
      }
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return '';
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeStringArray(entry));
  }

  const normalized = normalizeText(value);
  return normalized ? [normalized] : [];
}

function normalizeObjectArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return [value];
  return [];
}

export function normalizeInputHistoryWorkflow(
  value: unknown,
  imageCount = 0,
  parsedCount = 0
): IngestionMode {
  if (value === 'quick' || value === 'image_pro' || value === 'exam') return value;
  if (imageCount <= 0) return 'quick';
  if (imageCount > 3 || parsedCount > 5) return 'exam';
  return 'image_pro';
}

export function normalizeInputHistoryItem(
  value: unknown,
  fallbackSubject: Subject,
  index = 0
): InputHistoryItem | null {
  if (!value || typeof value !== 'object') return null;

  const record = value as Record<string, unknown>;
  const images = normalizeStringArray(record.images);
  const parsedItems = normalizeObjectArray(record.parsedItems);
  const newNodes = normalizeObjectArray(record.newNodes);
  const deletedNodeIds = Array.from(new Set(normalizeStringArray(record.deletedNodeIds)));
  const imageResourceIds = Array.from(new Set(normalizeStringArray(record.imageResourceIds)));
  const subject =
    normalizeText(record.subject) || normalizeText(record.identifiedSubject) || fallbackSubject;
  const identifiedSubject = normalizeText(record.identifiedSubject) || subject;
  const timestampRaw = Number(record.timestamp);
  const timestamp = Number.isFinite(timestampRaw) ? timestampRaw : Date.now();

  return {
    id: normalizeText(record.id) || `legacy-history-${timestamp}-${index}`,
    timestamp,
    subject,
    workflow: normalizeInputHistoryWorkflow(record.workflow, images.length, parsedItems.length),
    input: normalizeText(record.input),
    images,
    imageResourceIds,
    supplementaryInstruction: normalizeText(record.supplementaryInstruction) || undefined,
    parsedItems,
    newNodes,
    deletedNodeIds,
    aiAnalysis: normalizeText(record.aiAnalysis),
    identifiedSubject,
    savedMemoryIds: Array.from(new Set(normalizeStringArray(record.savedMemoryIds))),
    options:
      record.options && typeof record.options === 'object' && !Array.isArray(record.options)
        ? (record.options as Record<string, unknown>)
        : undefined,
  };
}

export function normalizeInputHistoryItems(
  value: unknown,
  fallbackSubject: Subject
): InputHistoryItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry, index) => normalizeInputHistoryItem(entry, fallbackSubject, index))
    .filter((entry): entry is InputHistoryItem => Boolean(entry));
}
