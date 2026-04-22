import { NextRequest, NextResponse } from 'next/server';

import { getEmbedding } from '@/lib/ai';
import { fuseWithDBSF, fuseWithRRF } from '@/lib/retrieval/fusion';
import {
  embedLateInteractionQuery,
  hasRetrievalProvider,
  rerankWithProvider,
  scoreLateInteraction,
} from '@/lib/retrieval/providers';
import { fetchLateDocuments, searchDense, searchSparse } from '@/lib/retrieval/qdrant';
import { buildQuerySparseWeights, toQdrantSparseVector } from '@/lib/retrieval/sparse';
import type { RetrievalDocument, RetrievalFusionMode, RetrievalHit, RetrievalRerankMode, Settings } from '@/lib/types';

export const runtime = 'edge';
export const maxDuration = 30;

function resolveProviderFromEnv(prefix: 'RERANKER' | 'LATE_INTERACTION') {
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

function pointToDocument(point: any): RetrievalDocument | null {
  if (!point?.payload?.id || !point.payload.text) return null;
  return point.payload as RetrievalDocument;
}

function rankScores(points: any[]) {
  return points
    .map((point) => {
      const document = pointToDocument(point);
      if (!document) return null;
      return { id: document.id, score: Number(point.score) || 0 };
    })
    .filter(Boolean) as { id: string; score: number }[];
}

function buildHits(
  ids: string[],
  documents: Map<string, RetrievalDocument>,
  denseScores: Map<string, number>,
  sparseScores: Map<string, number>,
  fusionScores: Map<string, number>
): RetrievalHit[] {
  return ids
    .map((id) => {
      const document = documents.get(id);
      if (!document) return null;
      const fusion = fusionScores.get(id) || 0;
      const dense = denseScores.get(id);
      const sparse = sparseScores.get(id);
      const matchReasons = [
        dense !== undefined ? `dense=${dense.toFixed(4)}` : '',
        sparse !== undefined ? `sparse=${sparse.toFixed(4)}` : '',
        document.isMistake ? 'mistake-card' : '',
        document.nodeIds.length > 0 ? `nodes=${document.nodeIds.length}` : '',
      ].filter(Boolean);

      return {
        id,
        document,
        score: fusion,
        scoreBreakdown: {
          dense,
          sparse,
          fusion,
          final: fusion,
        },
        matchReasons,
      } satisfies RetrievalHit;
    })
    .filter(Boolean) as RetrievalHit[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const syncKey = req.headers.get('X-Sync-Key')?.trim() || body?.syncKey?.trim();
    const query = String(body?.query || '').trim();
    const subject = typeof body?.subject === 'string' ? body.subject : undefined;
    const settings = (body?.settings || {}) as Settings;
    const recallTopK = Math.max(5, Math.min(100, Number(body?.recallTopK || settings.recallTopK || 40)));
    const rerankTopN = Math.max(1, Math.min(30, Number(body?.rerankTopN || settings.rerankTopN || 10)));
    const fusionMode = (body?.fusionMode || settings.fusionMode || 'dbsf') as RetrievalFusionMode;
    const rerankMode = (body?.rerankMode || settings.rerankMode || 'cross-encoder') as RetrievalRerankMode;
    const warnings: string[] = [];

    if (!syncKey || syncKey.length < 4) {
      return NextResponse.json({ error: 'syncKey is required' }, { status: 400 });
    }

    if (!query) {
      return NextResponse.json({ hits: [], mode: 'empty-query', warnings });
    }

    const qdrantUrl = process.env.QDRANT_URL;
    const qdrantApiKey = process.env.QDRANT_API_KEY;
    if (!qdrantUrl) {
      return NextResponse.json({ error: 'QDRANT_URL is not configured' }, { status: 503 });
    }

    const denseVector = await getEmbedding(query, settings);
    const sparseVector = toQdrantSparseVector(buildQuerySparseWeights(query));
    const [densePoints, sparsePoints] = await Promise.all([
      searchDense(qdrantUrl, qdrantApiKey, { syncKey, vector: denseVector, limit: recallTopK, subject }),
      searchSparse(qdrantUrl, qdrantApiKey, { syncKey, sparseVector, limit: recallTopK, subject }),
    ]);

    const documentMap = new Map<string, RetrievalDocument>();
    [...densePoints, ...sparsePoints].forEach((point) => {
      const document = pointToDocument(point);
      if (document) documentMap.set(document.id, document);
    });

    const denseRanking = rankScores(densePoints);
    const sparseRanking = rankScores(sparsePoints);
    const denseScores = new Map(denseRanking.map((item) => [item.id, item.score]));
    const sparseScores = new Map(sparseRanking.map((item) => [item.id, item.score]));
    const fusionScores =
      fusionMode === 'rrf' ? fuseWithRRF([denseRanking, sparseRanking]) : fuseWithDBSF([denseRanking, sparseRanking]);
    const fusedIds = Array.from(fusionScores.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, recallTopK)
      .map(([id]) => id);

    let hits = buildHits(fusedIds, documentMap, denseScores, sparseScores, fusionScores).slice(0, rerankTopN);
    let mode = `hybrid-${fusionMode}`;

    if (rerankMode === 'late-interaction') {
      const lateProvider = settings.lateInteractionProvider || resolveProviderFromEnv('LATE_INTERACTION');
      if (hasRetrievalProvider(lateProvider)) {
        const queryVectors = await embedLateInteractionQuery(lateProvider!, query);
        const latePoints = await fetchLateDocuments(qdrantUrl, qdrantApiKey, hits.map((hit) => hit.id));
        const lateMap = new Map<string, number[][]>();
        latePoints.forEach((point: any) => {
          const documentId = String(point?.payload?.id || point?.payload?.documentId || '');
          const vectors = Array.isArray(point?.payload?.multiVectors) ? point.payload.multiVectors : [];
          if (documentId && vectors.length > 0) lateMap.set(documentId, vectors);
        });

        hits = hits
          .map((hit) => {
            const lateScore = scoreLateInteraction(queryVectors, lateMap.get(hit.id) || []);
            const final = (hit.scoreBreakdown.fusion || 0) + lateScore;
            return {
              ...hit,
              score: final,
              scoreBreakdown: { ...hit.scoreBreakdown, lateInteraction: lateScore, final },
              matchReasons: [...hit.matchReasons, `late=${lateScore.toFixed(4)}`],
            };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, rerankTopN);
        mode = `hybrid-${fusionMode}+late-interaction`;
      } else {
        warnings.push('lateInteractionProvider is not configured; fallback to hybrid only');
      }
    } else if (rerankMode === 'cross-encoder') {
      const rerankerProvider = settings.rerankerProvider || resolveProviderFromEnv('RERANKER');
      if (hasRetrievalProvider(rerankerProvider)) {
        const reranked = await rerankWithProvider(
          rerankerProvider!,
          query,
          hits.map((hit) => ({ id: hit.id, text: hit.document.text }))
        );
        const rerankMap = new Map(reranked.map((item) => [item.id, item]));
        hits = hits
          .map((hit) => {
            const rerank = rerankMap.get(hit.id);
            const final = rerank?.score ?? hit.score;
            return {
              ...hit,
              score: final,
              scoreBreakdown: { ...hit.scoreBreakdown, rerank: rerank?.score, final },
              matchReasons: rerank?.reason ? [...hit.matchReasons, rerank.reason] : hit.matchReasons,
            };
          })
          .sort((left, right) => right.score - left.score)
          .slice(0, rerankTopN);
        mode = `hybrid-${fusionMode}+cross-encoder`;
      } else {
        warnings.push('rerankerProvider is not configured; fallback to hybrid only');
      }
    }

    return NextResponse.json({ hits, mode, warnings });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'retrieval search failed' }, { status: 500 });
  }
}
