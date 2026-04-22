const DEFAULT_CHUNK_SIZE = 420;
const DEFAULT_CHUNK_OVERLAP = 70;

export function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function isProbablyBinaryPayload(value: string | undefined): boolean {
  if (!value) return false;
  return value.startsWith('data:') || /^[A-Za-z0-9+/=]{200,}$/.test(value);
}

export function extractPlainTextExcerpt(value: string | undefined, maxLength = 800): string {
  if (!value || isProbablyBinaryPayload(value)) return '';
  return normalizeWhitespace(value).slice(0, maxLength);
}

export function chunkText(
  text: string,
  options?: {
    chunkSize?: number;
    overlap?: number;
  }
): string[] {
  const normalized = normalizeWhitespace(text);
  if (!normalized) return [];

  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = options?.overlap ?? DEFAULT_CHUNK_OVERLAP;
  if (normalized.length <= chunkSize) return [normalized];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    const roughEnd = Math.min(normalized.length, start + chunkSize);
    let end = roughEnd;

    if (roughEnd < normalized.length) {
      const windowText = normalized.slice(start, Math.min(normalized.length, roughEnd + 40));
      const breakCandidates = [
        windowText.lastIndexOf('\n\n'),
        windowText.lastIndexOf('\n'),
        windowText.lastIndexOf('。'),
        windowText.lastIndexOf('！'),
        windowText.lastIndexOf('？'),
        windowText.lastIndexOf('. '),
        windowText.lastIndexOf(';'),
        windowText.lastIndexOf('；'),
      ].filter((value) => value >= Math.max(0, chunkSize - 120));

      if (breakCandidates.length > 0) {
        end = start + Math.max(...breakCandidates) + 1;
      }
    }

    const chunk = normalizeWhitespace(normalized.slice(start, end));
    if (chunk) {
      chunks.push(chunk);
    }

    if (end >= normalized.length) break;
    start = Math.max(start + 1, end - overlap);
  }

  return chunks;
}
