import type { Memory, RetrievalDocument, RetrievalHit, Settings, Textbook } from '@/lib/types';

import { buildRetrievalDocuments } from './documents';

export async function syncRetrievalIndex(payload: {
  syncKey: string;
  memories: Memory[];
  textbooks: Textbook[];
  resources: any[];
  settings?: Settings;
}) {
  const documents: RetrievalDocument[] = buildRetrievalDocuments(payload);
  const response = await fetch('/api/retrieval/index', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Key': payload.syncKey,
    },
    body: JSON.stringify({
      documents,
      settings: payload.settings,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function searchRetrieval(params: {
  query: string;
  syncKey: string;
  subject?: string;
  settings: Settings;
}): Promise<{ hits: RetrievalHit[]; mode: string; warnings: string[] }> {
  const response = await fetch('/api/retrieval/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sync-Key': params.syncKey,
    },
    body: JSON.stringify({
      query: params.query,
      subject: params.subject,
      settings: {
        embeddingModel: params.settings.embeddingModel,
        customProviders: params.settings.customProviders,
        rerankerProvider: params.settings.rerankerProvider,
        lateInteractionProvider: params.settings.lateInteractionProvider,
      },
      recallTopK: params.settings.recallTopK,
      rerankTopN: params.settings.rerankTopN,
      fusionMode: params.settings.fusionMode,
      rerankMode: params.settings.rerankMode,
    }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
