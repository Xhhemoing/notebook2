import type { RetrievalProviderConfig } from '@/lib/types';

async function postJson(url: string, apiKey: string | undefined, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Upstream service failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

export function hasRetrievalProvider(config?: RetrievalProviderConfig | null) {
  return Boolean(config?.enabled && config.url);
}

export async function rerankWithProvider(
  config: RetrievalProviderConfig,
  query: string,
  documents: { id: string; text: string }[]
): Promise<Array<{ id: string; score: number; reason?: string }>> {
  const data = await postJson(config.url || '', config.apiKey, {
    model: config.model,
    query,
    documents,
  });

  const results = Array.isArray(data?.results) ? data.results : [];
  return results
    .map((item: any) => ({
      id: String(item.id),
      score: Number(item.score) || 0,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
    }))
    .filter((item: { id: string }) => item.id);
}

export async function embedLateInteractionQuery(config: RetrievalProviderConfig, text: string): Promise<number[][]> {
  const data = await postJson(config.url || '', config.apiKey, {
    model: config.model,
    mode: 'query',
    text,
  });
  return Array.isArray(data?.vectors) ? data.vectors : [];
}

export async function embedLateInteractionDocument(config: RetrievalProviderConfig, text: string): Promise<number[][]> {
  const data = await postJson(config.url || '', config.apiKey, {
    model: config.model,
    mode: 'document',
    text,
  });
  return Array.isArray(data?.vectors) ? data.vectors : [];
}

export function scoreLateInteraction(queryVectors: number[][], documentVectors: number[][]): number {
  if (queryVectors.length === 0 || documentVectors.length === 0) return 0;

  const cosine = (left: number[], right: number[]) => {
    let dot = 0;
    let leftNorm = 0;
    let rightNorm = 0;

    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      dot += left[index] * right[index];
      leftNorm += left[index] ** 2;
      rightNorm += right[index] ** 2;
    }

    if (!leftNorm || !rightNorm) return 0;
    return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
  };

  return queryVectors.reduce((sum, queryVector) => {
    const best = documentVectors.reduce((maxScore, documentVector) => Math.max(maxScore, cosine(queryVector, documentVector)), 0);
    return sum + best;
  }, 0);
}
