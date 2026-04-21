import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN || 'mock_token_for_dev',
});

export async function POST(req: Request) {
  try {
    const { imageUrl, base64, snippets } = await req.json();
    
    if (!imageUrl && !base64 && (!snippets || snippets.length === 0)) {
      return NextResponse.json({ error: 'Missing image data' }, { status: 400 });
    }

    // Generate a unique task ID
    const taskId = crypto.randomUUID();

    // Publish to QStash
    // We send it to our webhook endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    try {
      await qstash.publishJSON({
        url: `${baseUrl}/api/webhooks/process-image`,
        body: {
          taskId,
          imageUrl,
          base64,
          snippets
        },
        // Add deduplication ID for idempotency
        deduplicationId: taskId,
      });
    } catch (qstashError) {
      console.warn('[Upload API] QStash publish failed, possibly due to missing token. Proceeding asynchronously anyway.', qstashError);
      // Fallback for local dev without QStash token: fetch the webhook directly but don't await it
      fetch(`${baseUrl}/api/webhooks/process-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, imageUrl, base64, snippets })
      }).catch(e => console.error("Local webhook fallback failed", e));
    }

    // Return immediately to free up memory/connection
    return NextResponse.json({ 
      status: 'processing', 
      taskId 
    });

  } catch (error) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
