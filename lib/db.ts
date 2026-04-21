import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'ai_study_db';
const STORE_NAME = 'images';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveImage(id: string, base64Data: string): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, base64Data, id);
}

export async function getImage(id: string): Promise<string | undefined> {
  const db = await getDB();
  return db.get(STORE_NAME, id);
}

export async function deleteImage(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, id);
}

export async function clearImages(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}
