function tokenizeAsciiWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9_./:+-]+/g) || []).filter(Boolean);
}

function tokenizeChineseBigrams(text: string): string[] {
  const chars = Array.from(text.replace(/\s+/g, '')).filter((char) => /[\u3400-\u9fff]/.test(char));
  if (chars.length < 2) return chars;

  const bigrams: string[] = [];
  for (let index = 0; index < chars.length - 1; index += 1) {
    bigrams.push(`${chars[index]}${chars[index + 1]}`);
  }
  return bigrams;
}

function buildTokenFrequency(tokens: string[]) {
  const frequency = new Map<string, number>();
  for (const token of tokens) {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  }
  return frequency;
}

export function tokenizeForSparse(text: string): string[] {
  const asciiTokens = tokenizeAsciiWords(text);
  const chineseBigrams = tokenizeChineseBigrams(text);
  return [...asciiTokens, ...chineseBigrams];
}

export function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) || 1;
}

export function buildDocumentFrequency(texts: string[]): Map<string, number> {
  const documentFrequency = new Map<string, number>();
  for (const text of texts) {
    const uniqueTokens = new Set(tokenizeForSparse(text));
    for (const token of uniqueTokens) {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    }
  }
  return documentFrequency;
}

export function buildSparseWeights(
  text: string,
  documentFrequency: Map<string, number>,
  totalDocuments: number
): Record<string, number> {
  const frequency = buildTokenFrequency(tokenizeForSparse(text));
  const weights: Record<string, number> = {};

  for (const [token, tf] of frequency.entries()) {
    const df = documentFrequency.get(token) || 1;
    const idf = Math.log(1 + (totalDocuments - df + 0.5) / (df + 0.5));
    weights[token] = (1 + Math.log(tf)) * idf;
  }

  return weights;
}

export function buildQuerySparseWeights(text: string): Record<string, number> {
  const frequency = buildTokenFrequency(tokenizeForSparse(text));
  const weights: Record<string, number> = {};

  for (const [token, tf] of frequency.entries()) {
    weights[token] = 1 + Math.log(tf);
  }

  return weights;
}

export function toQdrantSparseVector(weights: Record<string, number>) {
  const entries = Object.entries(weights)
    .map(([token, value]) => ({ index: hashToken(token), value }))
    .sort((left, right) => left.index - right.index);

  return {
    indices: entries.map((entry) => entry.index),
    values: entries.map((entry) => entry.value),
  };
}
