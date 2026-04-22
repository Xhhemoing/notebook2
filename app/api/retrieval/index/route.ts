import { NextRequest, NextResponse } from 'next/server';

import { getEmbedding } from '@/lib/ai';
import type { RetrievalDocument, Settings } from '@/lib/types';
import { embedLateInteractionDocument, hasRetrievalProvider } from '@/lib/retrieval/providers';
import { ensureHybridCollection, ensureLateCollection, replaceHybridDocuments, replaceLateDocuments } from '@/lib/retrieval/qdrant';

export const runtime = 'edge';
export const maxDuration = 60;

function resolveProviderFromEnv(prefix: 'LATE_INTERACTION') {
  const url = process.env[`${prefix}_URL`];
  if (!url) return undefined;
  return {
    enabled: true,
    provider: 'http-json' as const,
    url,
    apiKey: process.env[`${prefix}_API_KEY`],
    model: process.env[`${prefix}_MODEL`],
  };
}

function meanVector(vectors: number[][]) {
  if (vectors.length === 0) return [];
  const size = vectors[0].length;
  const mean = new Array(size).fill(0);
  vectors.forEach((vector) => {
    vector.forEach((value, index) => {
      mean[index] += value;
    });
  });
  return mean.map((value) => value / vectors.length);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const syncKey = req.headers.get('X-Sync-Key')?.trim() || body?.syncKey?.trim();
    const documents = Array.isArray(body?.documents) ? (body.documents as RetrievalDocument[]) : [];
    const settings = (body?.settings || {}) as Settings;

    if (!syncKey || syncKey.length < 4) {
      return NextResponse.json({ error: 'syncKey is required' }, { status: 400 });
    }

    if (documents.length === 0) {
      return NextResponse.json({ success: true, indexed: 0, warning: 'No documents to index' });
    }

    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    if (!qdrantUrl) {
      return NextResponse.json({ error: 'QDRANT_URL is not configured' }, { status: 503 });
    }

    const embeddedDocuments: RetrievalDocument[] = [];
    for (const document of documents) {
      embeddedDocuments.push({
        ...document,
        syncKey,
        dense: await getEmbedding(document.text, settings),
      });
    }

    const denseSize = embeddedDocuments[0]?.dense?.length || 0;
    if (denseSize <= 0) {
      return NextResponse.json({ error: 'Failed to generate dense embeddings' }, { status: 500 });
    }

    await ensureHybridCollection(qdrantUrl, qdrantApiKey, denseSize);
    await replaceHybridDocuments(qdrantUrl, qdrantApiKey, embeddedDocuments);

    const lateProvider = settings.lateInteractionProvider || resolveProviderFromEnv('LATE_INTERACTION');
    let lateIndexed = 0;

    if (hasRetrievalProvider(lateProvider)) {
      const lateDocuments = [];
      for (const document of embeddedDocuments) {
        const multiVectors = await embedLateInteractionDocument(lateProvider!, document.text);
        const dense = meanVector(multiVectors);
        if (dense.length > 0) {
          lateDocuments.push({ id: document.id, syncKey, dense, multiVectors });
        }
      }
      if (lateDocuments.length > 0) {
        await ensureLateCollection(qdrantUrl, qdrantApiKey, lateDocuments[0].dense.length);
        await replaceLateDocuments(qdrantUrl, qdrantApiKey, lateDocuments);
        lateIndexed = lateDocuments.length;
      }
    }

    return NextResponse.json({
      success: true,
      indexed: embeddedDocuments.length,
      lateIndexed,
      indexedAt: Date.now(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'retrieval index failed' }, { status: 500 });
  }
}
