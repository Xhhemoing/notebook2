'use client';

import React, { createContext, useContext, useReducer, useEffect, useState, useRef } from 'react';
import { AppState, Action, Subject, KnowledgeNode, Memory, Link, Resource, Textbook, SyncMemoryConflict, ReviewEvent, FSRSProfile, RetrievalIndexState, GraphScope } from './types';
import { v4 as uuidv4 } from 'uuid';
import { deleteDB, openDB } from 'idb';
import { evaluateMemoryQuality, MEMORY_QUALITY_RULE_VERSION, normalizeKnowledgeNodes } from './data/quality';
import { applyDataRetention, normalizeResourceRetention } from './feedback';
import { normalizeInputHistoryItems, normalizeInputHistoryItem } from './input-history';
import { enrichAILog } from './prompting';
import { syncRetrievalIndex } from './retrieval/client';
import { normalizeTextbookForState } from './textbook';

const DB_NAME = 'gaokao-ai-db';
const STORE_NAME = 'app-state';
const FILE_STORE_NAME = 'app-files';

async function initDB() {
  return openDB(DB_NAME, 2, {
    upgrade(db, oldVersion, newVersion, transaction) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FILE_STORE_NAME)) {
        db.createObjectStore(FILE_STORE_NAME);
      }
    },
  });
}

export async function saveFile(id: string, data: ArrayBuffer) {
  try {
    const db = await initDB();
    await db.put(FILE_STORE_NAME, data, id);
  } catch (e) {
    console.error('Failed to save file to IDB', e);
  }
}

export async function loadFile(id: string): Promise<ArrayBuffer | null> {
  try {
    const db = await initDB();
    return await db.get(FILE_STORE_NAME, id);
  } catch (e) {
    console.error('Failed to load file from IDB', e);
    return null;
  }
}

export async function deleteFile(id: string) {
  try {
    const db = await initDB();
    await db.delete(FILE_STORE_NAME, id);
  } catch (e) {
    console.error('Failed to delete file from IDB', e);
  }
}

async function saveState(state: AppState) {
  try {
    const db = await initDB();
    await db.put(STORE_NAME, state, 'main-state');
  } catch (e) {
    console.error('Failed to save state to IDB', e);
  }
}

async function loadState(): Promise<AppState | null> {
  try {
    const db = await initDB();
    return await db.get(STORE_NAME, 'main-state');
  } catch (e) {
    console.error('Failed to load state from IDB', e);
    return null;
  }
}

export async function clearLocalAppData() {
  try {
    await deleteDB(DB_NAME);
  } catch (e) {
    console.error('Failed to delete main IndexedDB database', e);
  }

  try {
    await deleteDB('ai_study_db');
  } catch (e) {
    console.error('Failed to delete image IndexedDB database', e);
  }

  try {
    localStorage.removeItem('gaokao-ai-state');
    localStorage.removeItem('aistudio_state');
  } catch (e) {
    console.error('Failed to clear localStorage state', e);
  }
}

export async function syncWithD1(state: AppState, dispatch: React.Dispatch<Action>) {
  if (typeof window === 'undefined') return;

  try {
    const syncKey = state.settings.syncKey?.trim();

    if (!syncKey || syncKey.length < 4) {
      console.warn('D1 Sync skipped: missing or invalid syncKey');
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Sync-Key': syncKey,
    };

    // 1. Pull incremental changes
    const pullRes = await fetch('/api/sync', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'pull',
        payload: { lastSynced: state.lastSynced || 0 },
      })
    });
    
    if (pullRes.ok) {
      const contentType = pullRes.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const { data, serverTime } = await pullRes.json();
        if (data) {
          const remoteMemories = Array.isArray(data.memories) ? data.memories : [];
          const remoteNodes = Array.isArray(data.knowledgeNodes) ? data.knowledgeNodes : [];
          const remoteReviewEvents = Array.isArray(data.reviewEvents) ? data.reviewEvents : [];
          const remoteFSRSProfiles = Array.isArray(data.fsrsProfiles) ? data.fsrsProfiles : [];
          const localMemoryById = new Map(state.memories.map((memory) => [memory.id, memory]));
          const nonConflictMemories: Memory[] = [];
          const conflicts: SyncMemoryConflict[] = [];

          for (const remoteMemory of remoteMemories) {
            const localMemory = localMemoryById.get(remoteMemory.id);
            if (!localMemory) {
              nonConflictMemories.push(remoteMemory);
              continue;
            }

            const lastSynced = state.lastSynced || 0;
            const localChanged = (localMemory.updatedAt || localMemory.createdAt || 0) > lastSynced;
            const remoteChanged = (remoteMemory.updatedAt || remoteMemory.createdAt || 0) > lastSynced;
            const hasPayloadDiff =
              localMemory.content !== remoteMemory.content ||
              (localMemory.notes || '') !== (remoteMemory.notes || '') ||
              (localMemory.correctAnswer || '') !== (remoteMemory.correctAnswer || '') ||
              (localMemory.errorReason || '') !== (remoteMemory.errorReason || '') ||
              JSON.stringify(localMemory.knowledgeNodeIds || []) !== JSON.stringify(remoteMemory.knowledgeNodeIds || []);

            if (localChanged && remoteChanged && hasPayloadDiff) {
              conflicts.push({
                id: remoteMemory.id,
                memoryId: remoteMemory.id,
                localMemory,
                remoteMemory,
                detectedAt: Date.now(),
              });
              continue;
            }

            nonConflictMemories.push(remoteMemory);
          }

          if (nonConflictMemories.length > 0) {
            dispatch({ type: 'BATCH_UPSERT_MEMORIES_FROM_SYNC', payload: nonConflictMemories });
          }
          if (remoteNodes.length > 0) {
            dispatch({ type: 'BATCH_UPSERT_NODES_FROM_SYNC', payload: remoteNodes });
          }
          if (remoteReviewEvents.length > 0) {
            dispatch({ type: 'BATCH_UPSERT_REVIEW_EVENTS_FROM_SYNC', payload: remoteReviewEvents });
          }
          if (remoteFSRSProfiles.length > 0) {
            dispatch({ type: 'BATCH_UPSERT_FSRS_PROFILES_FROM_SYNC', payload: remoteFSRSProfiles });
          }
          if (conflicts.length > 0) {
            dispatch({ type: 'UPSERT_SYNC_CONFLICTS', payload: conflicts });
          }
          dispatch({ type: 'SET_LAST_SYNC', payload: serverTime });
        }
      } else {
        console.warn('D1 Sync Pull: Expected JSON but got', contentType);
      }
    } else {
      console.warn('D1 Sync Pull failed with status:', pullRes.status);
    }

    // 2. Push local changes
    const pushMemories = state.memories.filter(m => (m.updatedAt || m.createdAt) > (state.lastSynced || 0));
    if (pushMemories.length > 0) {
      const pushRes = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'push_memories', payload: pushMemories })
      });
      if (!pushRes.ok) console.warn('D1 Sync Push Memories failed:', pushRes.status);
    }

    const pushNodes = state.knowledgeNodes.filter(n => (n.updatedAt || 0) > (state.lastSynced || 0));
    if (pushNodes.length > 0) {
      const pushRes = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'push_nodes', payload: pushNodes })
      });
      if (!pushRes.ok) console.warn('D1 Sync Push Nodes failed:', pushRes.status);
    }

    const pushReviewEvents = (state.reviewEvents || []).filter(event => (event.reviewedAt || 0) > (state.lastSynced || 0));
    if (pushReviewEvents.length > 0) {
      const pushRes = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'push_review_events', payload: pushReviewEvents })
      });
      if (!pushRes.ok) console.warn('D1 Sync Push Review Events failed:', pushRes.status);
    }

    const pushFSRSProfiles = (state.fsrsProfiles || []).filter(profile => (profile.updatedAt || profile.optimizedAt || 0) > (state.lastSynced || 0));
    if (pushFSRSProfiles.length > 0) {
      const pushRes = await fetch('/api/sync', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'push_fsrs_profiles', payload: pushFSRSProfiles })
      });
      if (!pushRes.ok) console.warn('D1 Sync Push FSRS Profiles failed:', pushRes.status);
    }

  } catch (e) {
    console.error('D1 Sync failed', e);
    // Don't throw to prevent crashing the UI, just log it
  }
}

const initialNodes: KnowledgeNode[] = [
  { id: '1', subject: '数学', name: '高中数学', parentId: null, order: 1 },
  { id: '1.1', subject: '数学', name: '代数', parentId: '1', order: 1 },
  { id: '1.2', subject: '数学', name: '几何', parentId: '1', order: 2 },
  { id: '1.1.1', subject: '数学', name: '函数与导数', parentId: '1.1', order: 1 },
  { id: '1.1.2', subject: '数学', name: '数列', parentId: '1.1', order: 2 },
  
  { id: '2', subject: '化学', name: '高中化学', parentId: null, order: 2 },
  { id: '2.1', subject: '化学', name: '有机化学', parentId: '2', order: 1 },
  { id: '2.2', subject: '化学', name: '无机化学', parentId: '2', order: 2 },
  { id: '2.2.1', subject: '化学', name: '元素化合物', parentId: '2.2', order: 1 },
  
  { id: '3', subject: '物理', name: '高中物理', parentId: null, order: 3 },
  { id: '3.1', subject: '物理', name: '力学', parentId: '3', order: 1 },
  { id: '3.2', subject: '物理', name: '电磁学', parentId: '3', order: 2 },

  { id: '4', subject: '语文', name: '高中语文', parentId: null, order: 4 },
  { id: '5', subject: '英语', name: '高中英语', parentId: null, order: 5 },
  { id: '6', subject: '生物', name: '高中生物', parentId: null, order: 6 },
];

const initialMemories: Memory[] = [
  {
    id: uuidv4(),
    subject: '化学',
    content: '标况下为液体：HF',
    functionType: '细碎记忆',
    purposeType: '记忆型',
    knowledgeNodeIds: ['2.2.1'],
    confidence: 40,
    mastery: 20,
    createdAt: Date.now() - 86400000,
    sourceType: 'text',
  },
  {
    id: uuidv4(),
    subject: '化学',
    content: '12g石墨中含有的C-C键数目为1.5Na',
    functionType: '细碎记忆',
    purposeType: '内化型',
    knowledgeNodeIds: ['2.2'],
    confidence: 60,
    mastery: 40,
    createdAt: Date.now() - 172800000,
    sourceType: 'text',
  },
  {
    id: uuidv4(),
    subject: '数学',
    content: '求导后判断单调性，注意定义域的限制。若导数含有参数，需分类讨论参数范围。',
    functionType: '方法论',
    purposeType: '内化型',
    knowledgeNodeIds: ['1.1.1'],
    confidence: 80,
    mastery: 60,
    createdAt: Date.now(),
    sourceType: 'text',
  }
];

function clampPercent(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, value as number));
}

function stringArrayEqual(left: string[] = [], right: string[] = []): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function normalizeMemoryForSync(memory: Memory): Memory {
  return {
    ...memory,
    version: memory.version || 1,
    status: memory.status || 'active',
    dataSource: memory.dataSource || 'manual',
    updatedAt: memory.updatedAt || memory.createdAt || Date.now(),
  };
}

function normalizeNodeForSync(node: KnowledgeNode): KnowledgeNode {
  return {
    ...node,
    version: node.version || 1,
    status: node.status || 'active',
    dataSource: node.dataSource || 'manual',
    updatedAt: node.updatedAt || Date.now(),
  };
}

function normalizeReviewEventForSync(event: ReviewEvent): ReviewEvent {
  return {
    ...event,
    reviewedAt: event.reviewedAt || Date.now(),
    elapsedDays: Number(event.elapsedDays || 0),
    scheduledDays: Number(event.scheduledDays || 0),
  };
}

function normalizeFSRSProfileForSync(profile: FSRSProfile): FSRSProfile {
  return {
    ...profile,
    id: profile.id || `fsrs:${profile.subject}`,
    parameters: Array.isArray(profile.parameters) ? profile.parameters : [],
    desiredRetention: profile.desiredRetention || 0.9,
    recommendedRetention: profile.recommendedRetention || profile.desiredRetention || 0.9,
    cmrrLowerBound: profile.cmrrLowerBound || 0.9,
    updatedAt: profile.updatedAt || profile.optimizedAt || Date.now(),
    eventCount: profile.eventCount || 0,
    distinctMemoryCount: profile.distinctMemoryCount || 0,
    status: profile.status || 'collecting',
  };
}

function normalizeRetrievalIndexState(state?: Partial<RetrievalIndexState>): RetrievalIndexState {
  return {
    backend: state?.backend || 'server-qdrant',
    status: state?.status || 'dirty',
    dirty: state?.dirty ?? true,
    pendingDocumentCount: state?.pendingDocumentCount || 0,
    lastIndexedAt: state?.lastIndexedAt,
    lastAttemptAt: state?.lastAttemptAt,
    lastError: state?.lastError,
  };
}

function normalizeGraphScope(state: Pick<AppState, 'currentSubject' | 'knowledgeNodes'>, scope?: Partial<GraphScope> | null): GraphScope {
  const subject = scope?.subject || state.currentSubject;
  const nodeId = scope?.nodeId || null;
  const node = nodeId
    ? (state.knowledgeNodes || []).find((item) => item.id === nodeId && item.subject === subject)
    : undefined;

  return {
    nodeId: node ? node.id : null,
    subject,
    includeDescendants: scope?.includeDescendants ?? true,
    includeRelated: scope?.includeRelated ?? false,
    updatedAt: scope?.updatedAt || Date.now(),
  };
}

function normalizeMemoryForState(
  memory: Memory,
  validNodeIds: Set<string>,
  validResourceIds: Set<string>,
  validTextbookIds: Set<string>
): Memory {
  const normalizedNodeIds = Array.from(new Set(memory.knowledgeNodeIds || [])).filter((id) => validNodeIds.has(id));
  const normalizedResourceIds = Array.from(new Set(memory.sourceResourceIds || [])).filter((id) => validResourceIds.has(id));
  const normalizedTextbookId =
    memory.sourceTextbookId && validTextbookIds.has(memory.sourceTextbookId) ? memory.sourceTextbookId : undefined;
  const normalizedTextbookPage = normalizedTextbookId ? memory.sourceTextbookPage : undefined;

  const quality = evaluateMemoryQuality({
    ...memory,
    knowledgeNodeIds: normalizedNodeIds,
    sourceResourceIds: normalizedResourceIds,
    sourceTextbookId: normalizedTextbookId,
    sourceTextbookPage: normalizedTextbookPage,
  });

  const version = memory.version || 1;
  const status = memory.status || 'active';
  const dataSource = memory.dataSource || 'manual';
  const confidence = clampPercent(memory.confidence, 50);
  const mastery = clampPercent(memory.mastery, 0);
  const sourceResourceIds = normalizedResourceIds.length > 0 ? normalizedResourceIds : undefined;
  const qualityFlags = quality.flags.length > 0 ? quality.flags : undefined;
  const updatedAt = memory.updatedAt ?? memory.createdAt;
  const qualityRuleVersion = MEMORY_QUALITY_RULE_VERSION;

  const unchanged =
    memory.version === version &&
    memory.status === status &&
    memory.dataSource === dataSource &&
    memory.confidence === confidence &&
    memory.mastery === mastery &&
    memory.updatedAt === updatedAt &&
    memory.sourceTextbookId === normalizedTextbookId &&
    memory.sourceTextbookPage === normalizedTextbookPage &&
    stringArrayEqual(memory.knowledgeNodeIds || [], normalizedNodeIds) &&
    stringArrayEqual(memory.sourceResourceIds || [], sourceResourceIds || []) &&
    (memory.qualityScore ?? undefined) === quality.score &&
    stringArrayEqual(memory.qualityFlags || [], qualityFlags || []) &&
    (memory.qualityRuleVersion ?? undefined) === qualityRuleVersion;

  if (unchanged) {
    return memory;
  }

  return {
    ...memory,
    version,
    status,
    dataSource,
    confidence,
    mastery,
    knowledgeNodeIds: normalizedNodeIds,
    sourceTextbookId: normalizedTextbookId,
    sourceTextbookPage: normalizedTextbookPage,
    sourceResourceIds,
    qualityScore: quality.score,
    qualityFlags,
    qualityRuleVersion,
    updatedAt,
  };
}

function buildDerivedLinks(
  memories: Memory[],
  knowledgeNodes: KnowledgeNode[],
  resources: Resource[],
  textbooks: Textbook[],
  prevLinks: Link[] = []
): Link[] {
  const now = Date.now();
  const prevMap = new Map(prevLinks.filter(link => link.isDerived).map(link => [link.id, link]));
  const nodeIdSet = new Set(knowledgeNodes.map(node => node.id));
  const resourceIdSet = new Set(resources.map(resource => resource.id));
  const textbookIdSet = new Set(textbooks.map(textbook => textbook.id));
  const links: Link[] = [];

  for (const memory of memories) {
    for (const nodeId of Array.from(new Set(memory.knowledgeNodeIds || []))) {
      if (!nodeIdSet.has(nodeId)) continue;
      const id = `derived:memory-node:${memory.id}:${nodeId}`;
      const prev = prevMap.get(id);
      links.push({
        id,
        fromType: 'memory',
        fromId: memory.id,
        toType: 'node',
        toId: nodeId,
        relationType: 'memory_node',
        score: 1,
        isDerived: true,
        source: 'system',
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      });
    }

    if (memory.sourceTextbookId && textbookIdSet.has(memory.sourceTextbookId)) {
      const pagePart = memory.sourceTextbookPage ? `:${memory.sourceTextbookPage}` : '';
      const id = `derived:memory-textbook:${memory.id}:${memory.sourceTextbookId}${pagePart}`;
      const prev = prevMap.get(id);
      links.push({
        id,
        fromType: 'memory',
        fromId: memory.id,
        toType: 'textbook',
        toId: memory.sourceTextbookId,
        relationType: 'memory_textbook',
        score: 0.9,
        isDerived: true,
        source: 'system',
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      });
    }

    for (const resourceId of Array.from(new Set(memory.sourceResourceIds || []))) {
      if (!resourceIdSet.has(resourceId)) continue;
      const id = `derived:memory-resource:${memory.id}:${resourceId}`;
      const prev = prevMap.get(id);
      links.push({
        id,
        fromType: 'memory',
        fromId: memory.id,
        toType: 'resource',
        toId: resourceId,
        relationType: 'memory_resource',
        score: 0.85,
        isDerived: true,
        source: 'system',
        createdAt: prev?.createdAt || now,
        updatedAt: now,
      });
    }
  }

  for (const node of knowledgeNodes) {
    if (!node.parentId || !nodeIdSet.has(node.parentId)) continue;
    const id = `derived:node-parent:${node.id}:${node.parentId}`;
    const prev = prevMap.get(id);
    links.push({
      id,
      fromType: 'node',
      fromId: node.id,
      toType: 'node',
      toId: node.parentId,
      relationType: 'node_parent',
      score: 1,
      isDerived: true,
      source: 'system',
      createdAt: prev?.createdAt || now,
      updatedAt: now,
    });
  }

  return links;
}

function mergeLinksWithDerived(
  existingLinks: Link[],
  memories: Memory[],
  knowledgeNodes: KnowledgeNode[],
  resources: Resource[],
  textbooks: Textbook[]
): Link[] {
  const memoryIdSet = new Set(memories.map((item) => item.id));
  const nodeIdSet = new Set(knowledgeNodes.map((item) => item.id));
  const resourceIdSet = new Set(resources.map((item) => item.id));
  const textbookIdSet = new Set(textbooks.map((item) => item.id));

  const endpointExists = (type: Link['fromType'], id: string) => {
    if (type === 'memory') return memoryIdSet.has(id);
    if (type === 'node') return nodeIdSet.has(id);
    if (type === 'resource') return resourceIdSet.has(id);
    if (type === 'textbook') return textbookIdSet.has(id);
    return false;
  };

  const manualLinkMap = new Map<string, Link>();
  for (const link of existingLinks || []) {
    if (link.isDerived) continue;
    if (!endpointExists(link.fromType, link.fromId) || !endpointExists(link.toType, link.toId)) continue;
    manualLinkMap.set(link.id, {
      ...link,
      isDerived: false,
      source: link.source || 'manual',
      updatedAt: link.updatedAt || link.createdAt,
    });
  }

  const manualLinks = Array.from(manualLinkMap.values());
  const derivedLinks = buildDerivedLinks(memories, knowledgeNodes, resources, textbooks, existingLinks || []);
  const manualIds = new Set(manualLinks.map((link) => link.id));
  return [...manualLinks, ...derivedLinks.filter((link) => !manualIds.has(link.id))];
}

function withDerivedLinks(state: AppState): AppState {
  const graphResult = normalizeKnowledgeNodes(state.knowledgeNodes || []);
  const normalizedNodes = graphResult.nodes.map((node) => ({
    ...node,
    version: node.version || 1,
    status: node.status || 'active',
    dataSource: node.dataSource || 'manual',
  }));
  const normalizedResources = (state.resources || []).map((resource) =>
    normalizeResourceRetention(resource, state.settings)
  );
  const normalizedTextbooks = (state.textbooks || []).map((textbook) => normalizeTextbookForState(textbook));
  const validNodeIds = new Set(normalizedNodes.map((node) => node.id));
  const validResourceIds = new Set(normalizedResources.map((resource) => resource.id));
  const validTextbookIds = new Set(normalizedTextbooks.map((textbook) => textbook.id));
  const normalizedMemories = (state.memories || []).map((memory) =>
    normalizeMemoryForState(memory, validNodeIds, validResourceIds, validTextbookIds)
  );

  return {
    ...state,
    memories: normalizedMemories,
    textbooks: normalizedTextbooks,
    resources: normalizedResources,
    knowledgeNodes: normalizedNodes,
    activeGraphScope: normalizeGraphScope(
      { currentSubject: state.currentSubject, knowledgeNodes: normalizedNodes },
      state.activeGraphScope
    ),
    links: mergeLinksWithDerived(
      state.links || [],
      normalizedMemories,
      normalizedNodes,
      normalizedResources,
      normalizedTextbooks
    )
  };
}

function finalizeState(state: AppState): AppState {
  return applyDataRetention(withDerivedLinks(state));
}

const baseInitialState: AppState = {
  currentSubject: '数学',
  memories: initialMemories,
  knowledgeNodes: initialNodes,
  links: buildDerivedLinks(initialMemories, initialNodes, [], [], []),
  textbooks: [],
  reviewPlans: [],
  activeGraphScope: {
    nodeId: null,
    subject: '鏁板',
    includeDescendants: true,
    includeRelated: false,
    updatedAt: Date.now(),
  },
  settings: {
    aiPreset: 'balanced',
    parseModel: 'gemini-3-flash-preview',
    chatModel: 'gemini-3-flash-preview',
    graphModel: 'gemini-3-flash-preview',
    reviewModel: 'gemini-3-flash-preview',
    embeddingModel: 'text-embedding-004',
    homeworkPreferences: '例如：+号代表需要加入错题本，打叉代表做错了，波浪线代表不确定的知识点。请根据这些标记进行分析。',
    studentProfile: '该学生目前处于高考复习阶段，理科基础较好，但容易在细节上出错。需要加强对基础概念的内化。',
    aiAttentionNotes: '优先保证录入准确性；当图像或上下文不完整时明确标注不确定，不要过度推断。',
    feedbackLearningNotes: '',
    dailyReviewLimit: 20,
    reviewBatchSize: 3,
    enableLogging: true,
    autoCleanupLogs: true,
    logRetentionDays: 30,
    autoCleanupResources: true,
    resourceAutoCleanupDays: 21,
    exportOptimizationIncludeImages: true,
    minReviewDifficulty: 0,
    maxReviewDifficulty: 10,
    serverBackend: 'server-qdrant',
    fusionMode: 'dbsf',
    recallTopK: 40,
    rerankTopN: 8,
    rerankMode: 'hybrid-only',
    fsrsDesiredRetention: 0.9,
    syncInterval: 300, // 5 minutes
    enableAutoSync: true,
  },
  logs: [],
  feedbackEvents: [],
  reviewEvents: [],
  fsrsProfiles: [],
  retrievalIndex: normalizeRetrievalIndexState(),
  inputHistory: [],
  resources: [],
  syncConflicts: [],
  lastSynced: 0
};

const initialState: AppState = finalizeState(baseInitialState);

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_SUBJECT':
      return finalizeState({
        ...state,
        currentSubject: action.payload,
        activeGraphScope: normalizeGraphScope(
          { currentSubject: action.payload, knowledgeNodes: state.knowledgeNodes },
          { nodeId: null, subject: action.payload, includeDescendants: true, includeRelated: false }
        ),
      });
    case 'SET_ACTIVE_GRAPH_SCOPE':
      return finalizeState({
        ...state,
        activeGraphScope: normalizeGraphScope(
          { currentSubject: state.currentSubject, knowledgeNodes: state.knowledgeNodes },
          action.payload
        ),
      });
    case 'ADD_MEMORY':
      return finalizeState({
        ...state,
        memories: [{
          ...action.payload,
          version: action.payload.version || 1,
          status: action.payload.status || 'active',
          dataSource: action.payload.dataSource || 'manual',
          updatedAt: action.payload.updatedAt || Date.now()
        }, ...state.memories],
      });
    case 'UPDATE_MEMORY':
      return finalizeState({
        ...state,
        memories: state.memories.map((m) =>
          m.id === action.payload.id ? {
            ...action.payload,
            version: (m.version || 1) + 1,
            status: action.payload.status || 'active',
            dataSource: action.payload.dataSource || m.dataSource || 'manual',
            updatedAt: Date.now()
          } : m
        ),
      });
    case 'DELETE_MEMORY':
      return finalizeState({ ...state, memories: state.memories.filter((m) => m.id !== action.payload) });
    case 'ADD_NODE':
      if (state.knowledgeNodes.some(n => n.id === action.payload.id)) return state;
      return finalizeState({
        ...state,
        knowledgeNodes: [...state.knowledgeNodes, {
          ...action.payload,
          version: action.payload.version || 1,
          status: action.payload.status || 'active',
          dataSource: action.payload.dataSource || 'manual',
          updatedAt: action.payload.updatedAt || Date.now()
        }],
      });
    case 'UPDATE_NODE':
      return finalizeState({
        ...state,
        knowledgeNodes: state.knowledgeNodes.map((n) =>
          n.id === action.payload.id ? {
            ...action.payload,
            version: (n.version || 1) + 1,
            status: action.payload.status || 'active',
            dataSource: action.payload.dataSource || n.dataSource || 'manual',
            updatedAt: Date.now()
          } : n
        ),
      });
    case 'DELETE_NODE':
      // Also remove this node from any memories
      const updatedMemories = state.memories.map(m => ({
        ...m,
        knowledgeNodeIds: m.knowledgeNodeIds.filter(id => id !== action.payload)
      }));
      return finalizeState({ 
        ...state, 
        knowledgeNodes: state.knowledgeNodes.filter((n) => n.id !== action.payload),
        memories: updatedMemories
      });
    case 'BATCH_ADD_MEMORIES':
      return finalizeState({
        ...state,
        memories: [
          ...action.payload.map(memory => normalizeMemoryForSync(memory)),
          ...state.memories,
        ],
      });
    case 'BATCH_UPSERT_MEMORIES_FROM_SYNC':
      const memoryMap = new Map(state.memories.map((memory) => [memory.id, memory]));
      action.payload.forEach((incomingMemory) => {
        memoryMap.set(incomingMemory.id, normalizeMemoryForSync(incomingMemory));
      });
      return finalizeState({
        ...state,
        memories: Array.from(memoryMap.values()).sort(
          (left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
        ),
      });
    case 'BATCH_ADD_NODES':
      const newNodes = action.payload.filter(newNode => !state.knowledgeNodes.some(existingNode => existingNode.id === newNode.id));
      return finalizeState({
        ...state,
        knowledgeNodes: [
          ...state.knowledgeNodes,
          ...newNodes.map(node => normalizeNodeForSync(node)),
        ],
      });
    case 'BATCH_UPSERT_NODES_FROM_SYNC':
      const nodeMap = new Map(state.knowledgeNodes.map((node) => [node.id, node]));
      action.payload.forEach((incomingNode) => {
        nodeMap.set(incomingNode.id, normalizeNodeForSync(incomingNode));
      });
      return finalizeState({
        ...state,
        knowledgeNodes: Array.from(nodeMap.values()),
      });
    case 'BATCH_DELETE_NODES':
      const updatedMemoriesBatch = state.memories.map(m => ({
        ...m,
        knowledgeNodeIds: m.knowledgeNodeIds.filter(id => !action.payload.includes(id))
      }));
      return finalizeState({ 
        ...state, 
        knowledgeNodes: state.knowledgeNodes.filter((n) => !action.payload.includes(n.id)),
        memories: updatedMemoriesBatch
      });
    case 'ADD_TEXTBOOK':
      return finalizeState({
        ...state,
        textbooks: [...state.textbooks, {
          ...action.payload,
          version: action.payload.version || 1,
          status: action.payload.status || 'active',
          dataSource: action.payload.dataSource || 'manual',
          updatedAt: action.payload.updatedAt || Date.now()
        }]
      });
    case 'UPDATE_TEXTBOOK':
      return finalizeState({
        ...state,
        textbooks: state.textbooks.map(t => t.id === action.payload.id ? {
          ...action.payload,
          version: (t.version || 1) + 1,
          status: action.payload.status || 'active',
          dataSource: action.payload.dataSource || t.dataSource || 'manual',
          updatedAt: Date.now()
        } : t)
      });
    case 'DELETE_TEXTBOOK':
      return finalizeState({ ...state, textbooks: state.textbooks.filter(t => t.id !== action.payload) });
    case 'ADD_REVIEW_PLAN':
      return { ...state, reviewPlans: [action.payload, ...state.reviewPlans] };
    case 'UPDATE_REVIEW_PLAN':
      return {
        ...state,
        reviewPlans: state.reviewPlans.map(p => p.id === action.payload.id ? action.payload : p)
      };
    case 'DELETE_REVIEW_PLAN':
      return { ...state, reviewPlans: state.reviewPlans.filter(p => p.id !== action.payload) };
    case 'ADD_REVIEW_EVENT':
      if ((state.reviewEvents || []).some((event) => event.id === action.payload.id)) return state;
      return finalizeState({
        ...state,
        reviewEvents: [normalizeReviewEventForSync(action.payload), ...(state.reviewEvents || [])].slice(0, 20000),
      });
    case 'BATCH_UPSERT_REVIEW_EVENTS_FROM_SYNC':
      const reviewEventMap = new Map((state.reviewEvents || []).map((event) => [event.id, event]));
      action.payload.forEach((event) => {
        reviewEventMap.set(event.id, normalizeReviewEventForSync(event));
      });
      return finalizeState({
        ...state,
        reviewEvents: Array.from(reviewEventMap.values()).sort((left, right) => right.reviewedAt - left.reviewedAt),
      });
    case 'UPSERT_FSRS_PROFILE':
      return finalizeState({
        ...state,
        fsrsProfiles: [
          normalizeFSRSProfileForSync(action.payload),
          ...(state.fsrsProfiles || []).filter((profile) => profile.subject !== action.payload.subject),
        ],
      });
    case 'BATCH_UPSERT_FSRS_PROFILES_FROM_SYNC':
      const profileMap = new Map((state.fsrsProfiles || []).map((profile) => [profile.subject, profile]));
      action.payload.forEach((profile) => {
        profileMap.set(profile.subject, normalizeFSRSProfileForSync(profile));
      });
      return finalizeState({
        ...state,
        fsrsProfiles: Array.from(profileMap.values()),
      });
    case 'SET_RETRIEVAL_INDEX_STATE':
      return {
        ...state,
        retrievalIndex: normalizeRetrievalIndexState({
          ...(state.retrievalIndex || {}),
          ...action.payload,
        }),
      };
    case 'UPDATE_SETTINGS':
      return finalizeState({ ...state, settings: { ...state.settings, ...action.payload } });
    case 'SET_CORRELATIONS':
      return finalizeState({ ...state, knowledgeNodes: action.payload });
    case 'SET_LAST_SYNCED':
      return { ...state, lastSynced: action.payload };
    case 'SET_LAST_SYNC':
      return { ...state, lastSynced: action.payload };
    case 'UPSERT_SYNC_CONFLICTS':
      const conflictMap = new Map(state.syncConflicts.map((conflict) => [conflict.memoryId, conflict]));
      action.payload.forEach((conflict) => {
        conflictMap.set(conflict.memoryId, conflict);
      });
      return {
        ...state,
        syncConflicts: Array.from(conflictMap.values()).sort((left, right) => right.detectedAt - left.detectedAt),
      };
    case 'RESOLVE_SYNC_CONFLICT':
      const conflict = state.syncConflicts.find((item) => item.memoryId === action.payload.memoryId);
      if (!conflict) return state;

      if (action.payload.strategy === 'keep_local') {
        const keepLocalMap = new Map(state.memories.map((memory) => [memory.id, memory]));
        const localMemory = keepLocalMap.get(action.payload.memoryId);
        if (localMemory) {
          keepLocalMap.set(action.payload.memoryId, {
            ...localMemory,
            updatedAt: Date.now(),
            version: (localMemory.version || 1) + 1,
          });
        }
        return finalizeState({
          ...state,
          memories: Array.from(keepLocalMap.values()).sort(
            (left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
          ),
          syncConflicts: state.syncConflicts.filter((item) => item.memoryId !== action.payload.memoryId),
        });
      }

      if (action.payload.strategy === 'use_remote') {
        const remoteMap = new Map(state.memories.map((memory) => [memory.id, memory]));
        remoteMap.set(conflict.remoteMemory.id, normalizeMemoryForSync(conflict.remoteMemory));
        return finalizeState({
          ...state,
          memories: Array.from(remoteMap.values()).sort(
            (left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
          ),
          syncConflicts: state.syncConflicts.filter((item) => item.memoryId !== action.payload.memoryId),
        });
      }

      const currentLocal = state.memories.find((memory) => memory.id === action.payload.memoryId) || conflict.localMemory;
      const mergedFields = action.payload.mergedFields || {};
      const mergedMemory = normalizeMemoryForSync({
        ...currentLocal,
        content: mergedFields.content?.trim() || currentLocal.content || conflict.remoteMemory.content,
        notes: mergedFields.notes ?? currentLocal.notes ?? conflict.remoteMemory.notes,
        correctAnswer: mergedFields.correctAnswer ?? currentLocal.correctAnswer ?? conflict.remoteMemory.correctAnswer,
        errorReason: mergedFields.errorReason ?? currentLocal.errorReason ?? conflict.remoteMemory.errorReason,
        updatedAt: Date.now(),
        version: Math.max(currentLocal.version || 1, conflict.remoteMemory.version || 1) + 1,
        dataSource: 'manual',
      });
      const mergedMap = new Map(state.memories.map((memory) => [memory.id, memory]));
      mergedMap.set(mergedMemory.id, mergedMemory);
      return finalizeState({
        ...state,
        memories: Array.from(mergedMap.values()).sort(
          (left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
        ),
        syncConflicts: state.syncConflicts.filter((item) => item.memoryId !== action.payload.memoryId),
      });
    case 'LOAD_STATE':
      return finalizeState({ 
        ...initialState, 
        ...action.payload, 
        settings: { ...initialState.settings, ...(action.payload.settings || {}) }, 
        logs: action.payload.logs || [],
        feedbackEvents: action.payload.feedbackEvents || [],
        reviewEvents: (action.payload.reviewEvents || []).map(normalizeReviewEventForSync),
        fsrsProfiles: (action.payload.fsrsProfiles || []).map(normalizeFSRSProfileForSync),
        retrievalIndex: normalizeRetrievalIndexState(action.payload.retrievalIndex),
        textbooks: action.payload.textbooks || [],
        reviewPlans: action.payload.reviewPlans || [],
        inputHistory: normalizeInputHistoryItems(
          action.payload.inputHistory,
          action.payload.currentSubject || initialState.currentSubject
        ),
        resources: action.payload.resources || [],
        links: action.payload.links || [],
        syncConflicts: action.payload.syncConflicts || [],
      });
    case 'ADD_LOG':
      const { id: _ignoredId, timestamp: _ignoredTimestamp, ...rawLog } = action.payload;
      const enrichedLog = enrichAILog(rawLog);
      const logWithMetadata = {
        timestamp: Date.now(),
        ...enrichedLog,
        id: uuidv4(), // Always generate a new unique ID to fix React key warning
      };
      return finalizeState({ ...state, logs: [logWithMetadata, ...state.logs].slice(0, 500) });
    case 'CLEAR_LOGS':
      return finalizeState({ ...state, logs: [] });
    case 'ADD_FEEDBACK_EVENT':
      return finalizeState({
        ...state,
        feedbackEvents: [action.payload, ...(state.feedbackEvents || [])].slice(0, 500),
      });
    case 'DELETE_FEEDBACK_EVENT':
      return finalizeState({
        ...state,
        feedbackEvents: (state.feedbackEvents || []).filter((event) => event.id !== action.payload),
      });
    case 'SAVE_NODES_STATE':
      return { ...state, lastNodesState: [...state.knowledgeNodes] };
    case 'UNDO_NODES':
      if (!state.lastNodesState) return state;
      return finalizeState({ ...state, knowledgeNodes: state.lastNodesState, lastNodesState: undefined });
    case 'ADD_INPUT_HISTORY':
      const normalizedHistoryItem =
        normalizeInputHistoryItem(action.payload, state.currentSubject) || action.payload;
      return finalizeState({
        ...state,
        inputHistory: [
          normalizedHistoryItem,
          ...(Array.isArray(state.inputHistory) ? state.inputHistory : []),
        ].slice(0, 50),
      });
    case 'DELETE_INPUT_HISTORY':
      return finalizeState({
        ...state,
        inputHistory: (Array.isArray(state.inputHistory) ? state.inputHistory : []).filter(
          (h) => h.id !== action.payload
        ),
      });
    case 'DELETE_MEMORIES_BY_FUNCTION':
      return finalizeState({
        ...state,
        memories: state.memories.filter(m => 
          !(m.subject === action.payload.subject && m.functionType === action.payload.functionType)
        )
      });
    case 'BATCH_DELETE_MEMORIES':
      return finalizeState({
        ...state,
        memories: state.memories.filter(m => !action.payload.includes(m.id))
      });
    case 'BATCH_DELETE_TEXTBOOKS':
      return finalizeState({
        ...state,
        textbooks: state.textbooks.filter(t => !action.payload.includes(t.id))
      });
    case 'DELETE_SUBJECT_DATA':
      return finalizeState({
        ...state,
        memories: state.memories.filter(m => m.subject !== action.payload.subject),
        knowledgeNodes: state.knowledgeNodes.filter(n => n.subject !== action.payload.subject),
        textbooks: state.textbooks.filter(t => t.subject !== action.payload.subject),
        inputHistory: (Array.isArray(state.inputHistory) ? state.inputHistory : []).filter(
          (h) => h.subject !== action.payload.subject
        ),
        feedbackEvents: state.feedbackEvents.filter(event => event.subject !== action.payload.subject),
      });
    case 'DELETE_SUBJECT_NODES':
      const subjectNodesToDelete = new Set(state.knowledgeNodes.filter(n => n.subject === action.payload.subject).map(n => n.id));
      const memoriesAfterSubjectNodeDelete = state.memories.map(m => ({
        ...m,
        knowledgeNodeIds: m.knowledgeNodeIds.filter(id => !subjectNodesToDelete.has(id))
      }));
      return finalizeState({
        ...state,
        knowledgeNodes: state.knowledgeNodes.filter(n => n.subject !== action.payload.subject),
        memories: memoriesAfterSubjectNodeDelete
      });
    case 'DELETE_SUBJECT_MISTAKES':
      return finalizeState({
        ...state,
        memories: state.memories.filter(m => !(m.subject === action.payload.subject && m.isMistake))
      });
    case 'DELETE_SUBJECT_TEXTBOOKS':
      return finalizeState({
        ...state,
        textbooks: state.textbooks.filter(t => t.subject !== action.payload.subject)
      });
    case 'UPDATE_DRAFT':
      return finalizeState({
        ...state,
        ...action.payload
      });
    case 'ADD_RESOURCE':
      return finalizeState({
        ...state,
        resources: [{
          ...action.payload,
          version: action.payload.version || 1,
          status: action.payload.status || 'active',
          dataSource: action.payload.dataSource || 'manual',
          updatedAt: action.payload.updatedAt || Date.now()
        }, ...state.resources]
      });
    case 'BATCH_ADD_RESOURCES':
      return finalizeState({
        ...state,
        resources: [
          ...action.payload.map((resource) => ({
            ...resource,
            version: resource.version || 1,
            status: resource.status || 'active',
            dataSource: resource.dataSource || 'manual',
            updatedAt: resource.updatedAt || Date.now(),
          })),
          ...state.resources,
        ],
      });
    case 'UPDATE_RESOURCE':
      return finalizeState({
        ...state,
        resources: state.resources.map((resource) =>
          resource.id === action.payload.id
            ? {
                ...action.payload,
                version: (resource.version || 1) + 1,
                status: action.payload.status || resource.status || 'active',
                dataSource: action.payload.dataSource || resource.dataSource || 'manual',
                updatedAt: Date.now(),
              }
            : resource
        ),
      });
    case 'DELETE_RESOURCE':
      return finalizeState({ ...state, resources: state.resources.filter(r => r.id !== action.payload) });
    case 'BATCH_DELETE_RESOURCES':
      return finalizeState({
        ...state,
        resources: state.resources.filter((resource) => !action.payload.includes(resource.id)),
      });
    case 'SET_RESOURCES':
      return finalizeState({
        ...state,
        resources: action.payload.map(resource => ({
          ...resource,
          version: resource.version || 1,
          status: resource.status || 'active',
          dataSource: resource.dataSource || 'manual',
          updatedAt: resource.updatedAt || resource.createdAt || Date.now()
        }))
      });
    case 'ADD_LINK':
      return finalizeState({
        ...state,
        links: [
          ...state.links.filter(link => link.id !== action.payload.id),
          {
            ...action.payload,
            isDerived: action.payload.isDerived || false,
            source: action.payload.source || 'manual',
            updatedAt: Date.now()
          }
        ]
      });
    case 'BATCH_ADD_LINKS':
      return finalizeState({
        ...state,
        links: [
          ...state.links.filter(existing => !action.payload.some(item => item.id === existing.id)),
          ...action.payload.map(link => ({
            ...link,
            isDerived: link.isDerived || false,
            source: link.source || 'manual',
            updatedAt: Date.now()
          }))
        ]
      });
    case 'DELETE_LINK':
      return finalizeState({
        ...state,
        links: state.links.filter(link => link.isDerived || link.id !== action.payload)
      });
    case 'REMOVE_DRAFT_PROPOSAL':
      return finalizeState({
        ...state,
        memories: state.memories.map(m => {
          if (m.id === action.payload) {
             const { draftProposal, ...rest } = m as any;
             return rest as Memory;
          }
          return m;
        })
      });
    case 'RUN_AUTO_CLEANUP':
      return finalizeState(state);
    default:
      return state;
  }
}

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

function buildRetrievalSourceSignature(state: AppState) {
  const memorySignature = state.memories
    .map((memory) => `${memory.id}:${memory.updatedAt || memory.createdAt}:${memory.status || 'active'}`)
    .sort()
    .join('|');
  const textbookSignature = state.textbooks
    .map((textbook) => `${textbook.id}:${textbook.updatedAt || textbook.createdAt}:${textbook.pages.length}`)
    .sort()
    .join('|');
  const resourceSignature = state.resources
    .map((resource) => `${resource.id}:${resource.updatedAt || resource.createdAt}:${resource.status || 'active'}`)
    .sort()
    .join('|');

  return `${state.settings.syncKey || ''}::${memorySignature}::${textbookSignature}::${resourceSignature}`;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const idbState = await loadState();
        if (idbState) {
          dispatch({ type: 'LOAD_STATE', payload: idbState });
        } else {
          // Fallback to localStorage migration
          const saved = localStorage.getItem('gaokao-ai-state');
          if (saved) {
            const parsed = JSON.parse(saved);
            dispatch({ type: 'LOAD_STATE', payload: parsed });
            // Save to IDB and remove from localStorage to free up space
            await saveState(parsed);
            localStorage.removeItem('gaokao-ai-state');
          }
        }
      } catch (e) {
        console.error('Failed to load state', e);
      } finally {
        setIsMounted(true);
      }
    }
    
    load();
  }, []);

  useEffect(() => {
    if (isMounted) {
      const timeoutId = setTimeout(() => {
        saveState(state);
      }, 1000); // Debounce save by 1 second
      return () => clearTimeout(timeoutId);
    }
  }, [state, isMounted]);

  const stateRef = useRef(state);
  const retrievalSourceSignatureRef = useRef('');
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!isMounted) return;
    const signature = buildRetrievalSourceSignature(state);
    if (!retrievalSourceSignatureRef.current) {
      retrievalSourceSignatureRef.current = signature;
      return;
    }
    if (retrievalSourceSignatureRef.current !== signature) {
      retrievalSourceSignatureRef.current = signature;
      dispatch({
        type: 'SET_RETRIEVAL_INDEX_STATE',
        payload: {
          status: 'dirty',
          dirty: true,
          pendingDocumentCount: state.memories.length + state.textbooks.reduce((sum, textbook) => sum + textbook.pages.length, 0) + state.resources.length,
          lastError: undefined,
        },
      });
    }
  }, [isMounted, state.memories, state.textbooks, state.resources, state.settings.syncKey]);

  useEffect(() => {
    if (!isMounted) return;
    if (state.settings.serverBackend !== 'server-qdrant') return;
    if (!state.retrievalIndex.dirty || state.retrievalIndex.status === 'syncing') return;

    const syncKey = state.settings.syncKey?.trim();
    if (!syncKey || syncKey.length < 4) return;

    const timeoutId = setTimeout(() => {
      const current = stateRef.current;
      dispatch({
        type: 'SET_RETRIEVAL_INDEX_STATE',
        payload: { status: 'syncing', dirty: true, lastAttemptAt: Date.now(), lastError: undefined },
      });

      syncRetrievalIndex({
        syncKey,
        memories: current.memories,
        textbooks: current.textbooks,
        resources: current.resources,
        settings: current.settings,
      })
        .then((result) => {
          dispatch({
            type: 'SET_RETRIEVAL_INDEX_STATE',
            payload: {
              status: 'ready',
              dirty: false,
              pendingDocumentCount: 0,
              lastIndexedAt: Number(result?.indexedAt || Date.now()),
              lastError: undefined,
            },
          });
        })
        .catch((error) => {
          dispatch({
            type: 'SET_RETRIEVAL_INDEX_STATE',
            payload: {
              status: 'error',
              dirty: true,
              lastError: error?.message || 'retrieval indexing failed',
            },
          });
        });
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [
    isMounted,
    state.retrievalIndex.dirty,
    state.retrievalIndex.status,
    state.settings.serverBackend,
    state.settings.syncKey,
    state.memories,
    state.textbooks,
    state.resources,
  ]);

  useEffect(() => {
    if (isMounted && state.settings.enableAutoSync && state.settings.syncInterval > 0) {
      const interval = setInterval(() => {
        syncWithD1(stateRef.current, dispatch).catch(() => {});
      }, state.settings.syncInterval * 1000);
      return () => clearInterval(interval);
    }
  }, [isMounted, state.settings.enableAutoSync, state.settings.syncInterval, dispatch]);

  useEffect(() => {
    if (!isMounted) return;

    dispatch({ type: 'RUN_AUTO_CLEANUP' });

    const interval = setInterval(() => {
      dispatch({ type: 'RUN_AUTO_CLEANUP' });
    }, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [isMounted, dispatch]);

  if (!isMounted) return null; // Prevent hydration mismatch

  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}
