import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

function truncate(value: string, max = 400) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeUpstreamBody(body: string, contentType: string | null) {
  const text = body.trim();
  if (!text) return 'Empty upstream response';

  if (contentType?.includes('application/json')) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed?.error === 'string') return truncate(parsed.error);
      if (typeof parsed?.message === 'string') return truncate(parsed.message);
      if (typeof parsed?.detail === 'string') return truncate(parsed.detail);
      return truncate(JSON.stringify(parsed));
    } catch {
      return truncate(text);
    }
  }

  if (contentType?.includes('text/html') || text.startsWith('<!DOCTYPE html') || text.startsWith('<html')) {
    const stripped = stripHtml(text);
    return truncate(stripped || 'Upstream returned an HTML error page');
  }

  return truncate(text);
}

function resolveTargetUrl(baseUrl: string | undefined, endpoint: '/chat/completions' | '/embeddings') {
  if (!baseUrl) return `https://api.openai.com/v1${endpoint}`;

  const trimmed = baseUrl.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('接口地址必须是完整 URL，例如 https://api.openai.com/v1');
  }

  const url = new URL(trimmed);
  const pathname = url.pathname.replace(/\/+$/, '');
  const knownEndpoints = ['/chat/completions', '/embeddings', '/responses', '/completions'];

  if (knownEndpoints.some((known) => pathname.endsWith(known))) {
    return url.toString();
  }

  url.pathname = `${pathname}${endpoint}`.replace(/\/{2,}/g, '/');
  return url.toString();
}

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey, ...payload } = await req.json();

    if (!apiKey || typeof apiKey !== 'string') {
      return NextResponse.json({ error: 'API Key is required' }, { status: 400 });
    }

    const endpoint: '/chat/completions' | '/embeddings' =
      payload.input && !payload.messages ? '/embeddings' : '/chat/completions';
    const targetUrl = resolveTargetUrl(baseUrl, endpoint);

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('content-type');
    const rawBody = await response.text();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: summarizeUpstreamBody(rawBody, contentType),
          status: response.status,
          targetUrl,
          upstreamContentType: contentType,
        },
        { status: response.status }
      );
    }

    if (!contentType || !contentType.includes('application/json')) {
      return NextResponse.json(
        {
          error: '上游接口返回了非 JSON 内容',
          status: 502,
          targetUrl,
          upstreamContentType: contentType,
          details: summarizeUpstreamBody(rawBody, contentType),
        },
        { status: 502 }
      );
    }

    try {
      return NextResponse.json(JSON.parse(rawBody));
    } catch {
      return NextResponse.json(
        {
          error: '上游接口返回的 JSON 无法解析',
          status: 502,
          targetUrl,
          details: truncate(rawBody),
        },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('AI Proxy Error:', error);
    return NextResponse.json(
      {
        error: error?.message || 'AI Proxy internal error',
      },
      { status: 500 }
    );
  }
}
