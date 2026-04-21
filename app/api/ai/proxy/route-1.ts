import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    const { baseUrl, apiKey, ...payload } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key is required' }, { status: 400 });
    }

    // Determine the default path based on the payload content
    let defaultEndpoint = '/chat/completions';
    if (payload.input && !payload.messages) {
      defaultEndpoint = '/embeddings';
    }

    let targetUrl = baseUrl || `https://api.openai.com/v1${defaultEndpoint}`;
    
    // Ensure the path is correctly appended for custom providers
    if (baseUrl && !baseUrl.includes(defaultEndpoint)) {
      const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      targetUrl = `${cleanBaseUrl}${defaultEndpoint}`;
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json({ error: errorText }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('AI Proxy Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
