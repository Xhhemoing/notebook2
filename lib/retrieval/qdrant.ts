import type { RetrievalDocument } from '@/lib/types';

import { toQdrantSparseVector } from './sparse';

const HYBRID_COLLECTION = 'retrieval_hybrid';
const LATE_COLLECTION = 'retrieval_late';

function stablePointId(value: string) {
  let hashA = 0xdeadbeef;
  let hashB = 0x41c6ce57;
  let hashC = 0xc0ffee;
  let hashD = 0x9e3779b9;

  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hashA = Math.imul(hashA ^ char, 2654435761);
    hashB = Math.imul(hashB ^ char, 1597334677);
    hashC = Math.imul(hashC ^ char, 2246822507);
    hashD = Math.imul(hashD ^ char, 3266489909);
  }

  const hex = [hashA, hashB, hashC, hashD]
    .map((hash) => (hash >>> 0).toString(16).padStart(8, '0'))
    .join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function getHeaders(apiKey?: string) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'api-key': apiKey } : {}),
  };
}

async function qdrantFetch(url: string, apiKey: string | undefined, path: string, init?: RequestInit) {
  const response = await fetch(`${url.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      ...getHeaders(apiKey),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Qdrant request failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export async function ensureHybridCollection(url: string, apiKey: string | undefined, denseSize: number) {
  try {
    await qdrantFetch(url, apiKey, `/collections/${HYBRID_COLLECTION}`);
  } catch {
    await qdrantFetch(url, apiKey, `/collections/${HYBRID_COLLECTION}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          dense: {
            size: denseSize,
            distance: 'Cosine',
          },
        },
        sparse_vectors: {
          sparse: {},
        },
      }),
    });
  }
}

export async function ensureLateCollection(url: string, apiKey: string | undefined, denseSize: number) {
  try {
    await qdrantFetch(url, apiKey, `/collections/${LATE_COLLECTION}`);
  } catch {
    await qdrantFetch(url, apiKey, `/collections/${LATE_COLLECTION}`, {
      method: 'PUT',
      body: JSON.stringify({
        vectors: {
          dense: {
            size: denseSize,
            distance: 'Cosine',
          },
        },
      }),
    });
  }
}

export async function replaceHybridDocuments(
  url: string,
  apiKey: string | undefined,
  documents: RetrievalDocument[]
) {
  if (documents.length === 0) return;

  const syncKey = documents[0].syncKey;
  await qdrantFetch(url, apiKey, `/collections/${HYBRID_COLLECTION}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        must: [{ key: 'syncKey', match: { value: syncKey } }],
      },
    }),
  });

  await qdrantFetch(url, apiKey, `/collections/${HYBRID_COLLECTION}/points/upsert`, {
    method: 'PUT',
    body: JSON.stringify({
      wait: true,
      points: documents.map((document) => ({
        id: stablePointId(document.id),
        vector: {
          dense: document.dense,
          sparse: toQdrantSparseVector(document.sparse || {}),
        },
        payload: (() => {
          const { dense, sparse, ...payload } = document;
          return payload;
        })(),
      })),
    }),
  });
}

export async function replaceLateDocuments(
  url: string,
  apiKey: string | undefined,
  documents: Array<{ id: string; syncKey: string; dense: number[]; multiVectors: number[][] }>
) {
  if (documents.length === 0) return;

  const syncKey = documents[0].syncKey;
  await qdrantFetch(url, apiKey, `/collections/${LATE_COLLECTION}/points/delete`, {
    method: 'POST',
    body: JSON.stringify({
      filter: {
        must: [{ key: 'syncKey', match: { value: syncKey } }],
      },
    }),
  });

  await qdrantFetch(url, apiKey, `/collections/${LATE_COLLECTION}/points/upsert`, {
    method: 'PUT',
    body: JSON.stringify({
      wait: true,
      points: documents.map((document) => ({
        id: stablePointId(document.id),
        vector: {
          dense: document.dense,
        },
        payload: {
          id: document.id,
          syncKey: document.syncKey,
          multiVectors: document.multiVectors,
        },
      })),
    }),
  });
}

export async function searchDense(
  url: string,
  apiKey: string | undefined,
  params: {
    syncKey: string;
    vector: number[];
    limit: number;
    subject?: string;
  }
) {
  const must = [{ key: 'syncKey', match: { value: params.syncKey } }];
  if (params.subject) {
    must.push({ key: 'subject', match: { value: params.subject } });
  }

  const data = await qdrantFetch(url, apiKey, `/collections/${HYBRID_COLLECTION}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: {
        name: 'dense',
        vector: params.vector,
      },
      limit: params.limit,
      with_payload: true,
      with_vector: false,
      filter: { must },
    }),
  });

  return Array.isArray(data?.result) ? data.result : [];
}

export async function searchSparse(
  url: string,
  apiKey: string | undefined,
  params: {
    syncKey: string;
    sparseVector: { indices: number[]; values: number[] };
    limit: number;
    subject?: string;
  }
) {
  const must = [{ key: 'syncKey', match: { value: params.syncKey } }];
  if (params.subject) {
    must.push({ key: 'subject', match: { value: params.subject } });
  }

  const data = await qdrantFetch(url, apiKey, `/collections/${HYBRID_COLLECTION}/points/search`, {
    method: 'POST',
    body: JSON.stringify({
      vector: {
        name: 'sparse',
        vector: params.sparseVector,
      },
      limit: params.limit,
      with_payload: true,
      with_vector: false,
      filter: { must },
    }),
  });

  return Array.isArray(data?.result) ? data.result : [];
}

export async function fetchLateDocuments(
  url: string,
  apiKey: string | undefined,
  ids: string[]
) {
  if (ids.length === 0) return [];

  const data = await qdrantFetch(url, apiKey, `/collections/${LATE_COLLECTION}/points`, {
    method: 'POST',
    body: JSON.stringify({
      ids: ids.map(stablePointId),
      with_payload: true,
      with_vector: false,
    }),
  });

  return Array.isArray(data?.result) ? data.result : [];
}
