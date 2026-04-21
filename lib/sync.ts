import { AppState } from './types';

interface SyncRequest {
  action: 'pull' | 'push_memories' | 'push_nodes' | 'push_textbooks' | 'push_resources';
  payload: any;
  syncKey: string;
}

export async function pushToCloudflare(state: AppState) {
  const endpoint = '/api/sync';
  const syncKey = state.settings.syncKey || '';
  
  if (!syncKey) {
    throw new Error('Sync Key is required for cloud synchronization.');
  }

  // Helper to send a push action
  const sendPush = async (action: SyncRequest['action'], payload: any) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ action, payload, syncKey })
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
  
  // Note: textbooks and resources might need their own push actions if implemented in backend
  // For now, these are the ones supported by the backend
  
  return { success: true };
}

export async function pullFromCloudflare(syncKey: string): Promise<AppState | null> {
  const endpoint = '/api/sync';
  
  if (!syncKey) {
    throw new Error('Sync Key is required for cloud synchronization.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      action: 'pull', 
      payload: { lastSynced: 0 }, // For full pull, can be optimized later
      syncKey 
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
