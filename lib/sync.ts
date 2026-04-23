import { AppState } from './types';

interface SyncRequest {
  action: 'pull' | 'push_memories' | 'push_nodes' | 'push_textbooks' | 'push_resources' | 'push_review_events' | 'push_fsrs_profiles';
  payload: any;
}

const SYNC_KEY_HEADER = 'X-Sync-Key';

function requireValidSyncKey(rawSyncKey: string) {
  const syncKey = rawSyncKey.trim();
  if (!syncKey || syncKey.length < 4) {
    throw new Error('Sync Key is required and must be at least 4 characters.');
  }
  return syncKey;
}

function buildSyncHeaders(syncKey: string) {
  return {
    'Content-Type': 'application/json',
    [SYNC_KEY_HEADER]: syncKey,
  };
}

export async function pushToCloudflare(state: AppState) {
  const endpoint = '/api/sync';
  const syncKey = requireValidSyncKey(state.settings.syncKey || '');

  // Helper to send a push action
  const sendPush = async (action: SyncRequest['action'], payload: any) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: buildSyncHeaders(syncKey),
      body: JSON.stringify({ action, payload })
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(`${action} failed: ${err.error || response.statusText}`);
    }
    return response.json();
  };

  // Push memories
  await sendPush('push_memories', state.memories);
  // Push nodes
  await sendPush('push_nodes', state.knowledgeNodes);
  await sendPush('push_review_events', state.reviewEvents || []);
  await sendPush('push_fsrs_profiles', state.fsrsProfiles || []);
  
  // Note: textbooks and resources might need their own push actions if implemented in backend
  // For now, these are the ones supported by the backend
  
  return { success: true };
}

export async function pullFromCloudflare(syncKey: string): Promise<AppState | null> {
  const endpoint = '/api/sync';
  const validSyncKey = requireValidSyncKey(syncKey);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: buildSyncHeaders(validSyncKey),
    body: JSON.stringify({ 
      action: 'pull', 
      payload: { lastSynced: 0 }, // For full pull, can be optimized later
    })
  });
  
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Pull failed: ${err.error || response.statusText}`);
  }
  
  const result = await response.json();
  if (!result.success || !result.data) {
    return null;
  }
  
  // result.data contains memories, knowledgeNodes, textbooks, resources
  return result.data as unknown as AppState;
}
