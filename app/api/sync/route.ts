import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

async function ensureSyncTables(db: any) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      syncKey TEXT NOT NULL,
      subject TEXT NOT NULL,
      content TEXT NOT NULL,
      functionType TEXT,
      purposeType TEXT,
      isMistake INTEGER DEFAULT 0,
      wrongAnswer TEXT,
      errorReason TEXT,
      visualDescription TEXT,
      notes TEXT,
      knowledgeNodeIds TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      embedding TEXT
    );
    CREATE TABLE IF NOT EXISTS knowledge_nodes (
      id TEXT PRIMARY KEY,
      syncKey TEXT NOT NULL,
      subject TEXT NOT NULL,
      name TEXT NOT NULL,
      parentId TEXT,
      "order" INTEGER DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS textbooks (
      id TEXT PRIMARY KEY,
      syncKey TEXT NOT NULL,
      subject TEXT NOT NULL,
      name TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      syncKey TEXT NOT NULL,
      subject TEXT NOT NULL,
      name TEXT,
      type TEXT,
      size INTEGER DEFAULT 0,
      isFolder INTEGER DEFAULT 0,
      updatedAt INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS review_events (
      id TEXT PRIMARY KEY,
      syncKey TEXT NOT NULL,
      memoryId TEXT NOT NULL,
      subject TEXT NOT NULL,
      rating INTEGER NOT NULL,
      reviewedAt INTEGER NOT NULL,
      elapsedDays INTEGER DEFAULT 0,
      scheduledDays INTEGER DEFAULT 0,
      previousState INTEGER,
      nextState INTEGER,
      stabilityBefore REAL,
      stabilityAfter REAL,
      difficultyBefore REAL,
      difficultyAfter REAL,
      mode TEXT
    );
    CREATE TABLE IF NOT EXISTS fsrs_profiles (
      id TEXT PRIMARY KEY,
      syncKey TEXT NOT NULL,
      subject TEXT NOT NULL,
      parameters TEXT NOT NULL,
      desiredRetention REAL NOT NULL,
      recommendedRetention REAL NOT NULL,
      cmrrLowerBound REAL NOT NULL,
      updatedAt INTEGER NOT NULL,
      optimizedAt INTEGER,
      eventCount INTEGER DEFAULT 0,
      distinctMemoryCount INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      notes TEXT
    );
  `);
}

// Generic handler for syncing data to Cloudflare D1 with user isolation
export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { action, payload } = data || {};
    const headerSyncKey = req.headers.get('X-Sync-Key')?.trim() || '';
    const bodySyncKey = typeof data?.syncKey === 'string' ? data.syncKey.trim() : '';
    const syncKey = headerSyncKey || bodySyncKey;

    // 1. Basic Security Checks
    if (!syncKey || typeof syncKey !== 'string' || syncKey.length < 4) {
      return NextResponse.json(
        { error: 'Valid syncKey (min 4 chars) is required via body.syncKey or X-Sync-Key header' },
        { status: 400 }
      );
    }

    // Access the D1 database binding
    const db = (process.env as any).DB;

    if (!db) {
      return NextResponse.json(
        { error: 'Database binding (DB) not found. Are you running on Cloudflare?' },
        { status: 500 }
      );
    }

    await ensureSyncTables(db);

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

      const reviewEvents = await db.prepare('SELECT * FROM review_events WHERE syncKey = ? AND reviewedAt > ?')
        .bind(syncKey, lastSynced).all();

      const fsrsProfiles = await db.prepare('SELECT * FROM fsrs_profiles WHERE syncKey = ? AND updatedAt > ?')
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
          })),
          reviewEvents: reviewEvents.results.map((event: any) => ({
            ...event,
            rating: Number(event.rating),
            reviewedAt: Number(event.reviewedAt),
            elapsedDays: Number(event.elapsedDays || 0),
            scheduledDays: Number(event.scheduledDays || 0),
            previousState: event.previousState !== null ? Number(event.previousState) : undefined,
            nextState: event.nextState !== null ? Number(event.nextState) : undefined,
            stabilityBefore: event.stabilityBefore !== null ? Number(event.stabilityBefore) : undefined,
            stabilityAfter: event.stabilityAfter !== null ? Number(event.stabilityAfter) : undefined,
            difficultyBefore: event.difficultyBefore !== null ? Number(event.difficultyBefore) : undefined,
            difficultyAfter: event.difficultyAfter !== null ? Number(event.difficultyAfter) : undefined,
          })),
          fsrsProfiles: fsrsProfiles.results.map((profile: any) => ({
            ...profile,
            parameters: profile.parameters ? JSON.parse(profile.parameters) : [],
            desiredRetention: Number(profile.desiredRetention || 0.9),
            recommendedRetention: Number(profile.recommendedRetention || 0.9),
            cmrrLowerBound: Number(profile.cmrrLowerBound || 0.9),
            updatedAt: Number(profile.updatedAt || 0),
            optimizedAt: profile.optimizedAt !== null ? Number(profile.optimizedAt) : undefined,
            eventCount: Number(profile.eventCount || 0),
            distinctMemoryCount: Number(profile.distinctMemoryCount || 0),
          })),
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

    if (action === 'push_review_events') {
      const items = payload as any[];
      if (items.length === 0) return NextResponse.json({ success: true });

      const statements = items.map((event) => db.prepare(`
        INSERT INTO review_events (id, syncKey, memoryId, subject, rating, reviewedAt, elapsedDays, scheduledDays, previousState, nextState, stabilityBefore, stabilityAfter, difficultyBefore, difficultyAfter, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          rating = excluded.rating,
          reviewedAt = excluded.reviewedAt,
          elapsedDays = excluded.elapsedDays,
          scheduledDays = excluded.scheduledDays,
          previousState = excluded.previousState,
          nextState = excluded.nextState,
          stabilityBefore = excluded.stabilityBefore,
          stabilityAfter = excluded.stabilityAfter,
          difficultyBefore = excluded.difficultyBefore,
          difficultyAfter = excluded.difficultyAfter,
          mode = excluded.mode
      `).bind(
        event.id,
        syncKey,
        event.memoryId,
        event.subject,
        event.rating,
        event.reviewedAt,
        event.elapsedDays || 0,
        event.scheduledDays || 0,
        event.previousState ?? null,
        event.nextState ?? null,
        event.stabilityBefore ?? null,
        event.stabilityAfter ?? null,
        event.difficultyBefore ?? null,
        event.difficultyAfter ?? null,
        event.mode || 'standard',
      ));

      await db.batch(statements);
      return NextResponse.json({ success: true, serverTime: Date.now() });
    }

    if (action === 'push_fsrs_profiles') {
      const items = payload as any[];
      if (items.length === 0) return NextResponse.json({ success: true });

      const now = Date.now();
      const statements = items.map((profile) => db.prepare(`
        INSERT INTO fsrs_profiles (id, syncKey, subject, parameters, desiredRetention, recommendedRetention, cmrrLowerBound, updatedAt, optimizedAt, eventCount, distinctMemoryCount, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          parameters = excluded.parameters,
          desiredRetention = excluded.desiredRetention,
          recommendedRetention = excluded.recommendedRetention,
          cmrrLowerBound = excluded.cmrrLowerBound,
          updatedAt = excluded.updatedAt,
          optimizedAt = excluded.optimizedAt,
          eventCount = excluded.eventCount,
          distinctMemoryCount = excluded.distinctMemoryCount,
          status = excluded.status,
          notes = excluded.notes
      `).bind(
        profile.id,
        syncKey,
        profile.subject,
        JSON.stringify(profile.parameters || []),
        profile.desiredRetention || 0.9,
        profile.recommendedRetention || 0.9,
        profile.cmrrLowerBound || 0.9,
        profile.updatedAt || now,
        profile.optimizedAt ?? null,
        profile.eventCount || 0,
        profile.distinctMemoryCount || 0,
        profile.status || 'collecting',
        profile.notes || null,
      ));

      await db.batch(statements);
      return NextResponse.json({ success: true, serverTime: now });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error: any) {
    console.error('D1 Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
