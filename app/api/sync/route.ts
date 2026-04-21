import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// Generic handler for syncing data to Cloudflare D1 with user isolation
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('Authorization');
    const data = await req.json();
    const { action, payload, syncKey } = data;

    // 1. Basic Security Checks
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    if (!syncKey || typeof syncKey !== 'string' || syncKey.length < 4) {
      return NextResponse.json({ error: 'Valid Sync Key is required for data isolation' }, { status: 400 });
    }

    // Access the D1 database binding
    const db = (process.env as any).DB;

    if (!db) {
      return NextResponse.json(
        { error: 'Database binding (DB) not found. Are you running on Cloudflare?' },
        { status: 500 }
      );
    }

    // 2. Action Handlers with syncKey Isolation
    if (action === 'pull') {
      const { lastSynced = 0 } = payload || {};
      
      // Fetch only data belonging to this syncKey and updated after lastSynced
      const memories = await db.prepare('SELECT * FROM memories WHERE syncKey = ? AND (updatedAt > ? OR createdAt > ?)')
        .bind(syncKey, lastSynced, lastSynced).all();
      
      const nodes = await db.prepare('SELECT * FROM knowledge_nodes WHERE syncKey = ? AND updatedAt > ?')
        .bind(syncKey, lastSynced).all();
      
      const textbooks = await db.prepare('SELECT * FROM textbooks WHERE syncKey = ? AND updatedAt > ?')
        .bind(syncKey, lastSynced).all();
      
      const resources = await db.prepare('SELECT * FROM resources WHERE syncKey = ? AND updatedAt > ?')
        .bind(syncKey, lastSynced).all();
      
      return NextResponse.json({
        success: true,
        data: {
          memories: memories.results.map((m: any) => ({
            ...m,
            isMistake: !!m.isMistake,
            knowledgeNodeIds: m.knowledgeNodeIds ? JSON.parse(m.knowledgeNodeIds) : [],
            vocabularyData: m.vocabularyData ? JSON.parse(m.vocabularyData) : undefined,
            embedding: m.embedding ? JSON.parse(m.embedding) : undefined
          })),
          knowledgeNodes: nodes.results.map((n: any) => ({
            ...n,
            order: Number(n.order)
          })),
          textbooks: textbooks.results,
          resources: resources.results.map((r: any) => ({
            ...r,
            isFolder: !!r.isFolder,
            size: Number(r.size)
          }))
        },
        serverTime: Date.now()
      });
    }

    if (action === 'push_memories') {
      const items = payload as any[];
      if (items.length === 0) return NextResponse.json({ success: true });

      const now = Date.now();
      const statements = items.map(m => db.prepare(`
        INSERT INTO memories (id, syncKey, subject, content, functionType, purposeType, isMistake, wrongAnswer, errorReason, visualDescription, notes, knowledgeNodeIds, createdAt, updatedAt, embedding)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject = excluded.subject,
          content = excluded.content,
          functionType = excluded.functionType,
          purposeType = excluded.purposeType,
          isMistake = excluded.isMistake,
          wrongAnswer = excluded.wrongAnswer,
          errorReason = excluded.errorReason,
          visualDescription = excluded.visualDescription,
          notes = excluded.notes,
          knowledgeNodeIds = excluded.knowledgeNodeIds,
          updatedAt = excluded.updatedAt,
          embedding = excluded.embedding
      `).bind(
        m.id, syncKey, m.subject, m.content, m.functionType, m.purposeType, m.isMistake ? 1 : 0, 
        m.wrongAnswer || null, m.errorReason || null, m.visualDescription || null, m.notes || null,
        JSON.stringify(m.knowledgeNodeIds || []), m.createdAt, now,
        m.embedding ? JSON.stringify(m.embedding) : null
      ));

      await db.batch(statements);
      return NextResponse.json({ success: true, serverTime: now });
    }

    if (action === 'push_nodes') {
      const items = payload as any[];
      if (items.length === 0) return NextResponse.json({ success: true });

      const now = Date.now();
      const statements = items.map(n => db.prepare(`
        INSERT INTO knowledge_nodes (id, syncKey, subject, name, parentId, "order", updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          subject = excluded.subject,
          name = excluded.name,
          parentId = excluded.parentId,
          "order" = excluded."order",
          updatedAt = excluded.updatedAt
      `).bind(n.id, syncKey, n.subject, n.name, n.parentId, n.order || 0, now));

      await db.batch(statements);
      return NextResponse.json({ success: true, serverTime: now });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error: any) {
    console.error('D1 Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
