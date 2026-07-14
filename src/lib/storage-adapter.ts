import { createDefaultStore, migrateStoreData, type StoreData } from "./shared-types";

export type StorageEnv = {
  SPX_KV?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
};

const STORE_KEY = "spx-store-v1";

const globalStore = globalThis as typeof globalThis & {
  __spxStoreLoaded?: boolean;
  __spxStore?: StoreData;
  __spxStorageEnv?: StorageEnv;
};

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function getMemoryStore(): StoreData {
  if (!globalStore.__spxStore) {
    globalStore.__spxStore = createDefaultStore();
  }
  return globalStore.__spxStore;
}

async function loadFromDisk(): Promise<StoreData | null> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dataPath = path.join(process.cwd(), ".data", "store.json");
    const raw = await fs.readFile(dataPath, "utf-8");
    return migrateStoreData(JSON.parse(raw) as Partial<StoreData>);
  } catch {
    return null;
  }
}

async function saveToDisk(store: StoreData): Promise<void> {
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), ".data");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "store.json"), JSON.stringify(store), "utf-8");
  } catch {
    // Edge runtimes without filesystem — skip.
  }
}

async function loadFromKv(env: StorageEnv): Promise<StoreData | null> {
  if (!env.SPX_KV) return null;
  try {
    const raw = await env.SPX_KV.get(STORE_KEY);
    if (!raw) return null;
    return migrateStoreData(JSON.parse(raw) as Partial<StoreData>);
  } catch {
    return null;
  }
}

async function saveToKv(store: StoreData, env: StorageEnv): Promise<void> {
  if (!env.SPX_KV) return;
  try {
    await env.SPX_KV.put(STORE_KEY, JSON.stringify(store));
  } catch {
    // Ignore KV write failures.
  }
}

function scheduleSave(store: StoreData, env?: StorageEnv): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveToDisk(store);
    if (env) void saveToKv(store, env);
  }, 250);
}

export function setStorageEnv(env?: StorageEnv): void {
  globalStore.__spxStorageEnv = env;
}

export async function ensureStoreLoaded(env?: StorageEnv): Promise<StoreData> {
  const activeEnv = env ?? globalStore.__spxStorageEnv;
  if (globalStore.__spxStoreLoaded) {
    return getMemoryStore();
  }

  const fromKv = activeEnv ? await loadFromKv(activeEnv) : null;
  const fromDisk = fromKv ? null : await loadFromDisk();
  globalStore.__spxStore = fromKv ?? fromDisk ?? createDefaultStore();
  globalStore.__spxStoreLoaded = true;
  return globalStore.__spxStore;
}

export async function readStore(env?: StorageEnv): Promise<StoreData> {
  return ensureStoreLoaded(env);
}

export async function mutateStore(
  mutator: (store: StoreData) => void,
  env?: StorageEnv,
): Promise<StoreData> {
  const activeEnv = env ?? globalStore.__spxStorageEnv;
  const store = await ensureStoreLoaded(activeEnv);
  mutator(store);
  scheduleSave(store, activeEnv);
  return store;
}

export function resetStoreCache(): void {
  globalStore.__spxStoreLoaded = false;
  globalStore.__spxStore = undefined;
}
