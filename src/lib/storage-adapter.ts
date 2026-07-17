import { createDefaultStore, migrateStoreData, type StoreData } from "./shared-types";

export type StorageEnv = {
  SPX_KV?: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  };
};

const STORE_KEY = "spx-store-v1";
// How long a cached remote read stays fresh. Keeps polling cheap while still
// letting separate serverless instances converge quickly.
const REMOTE_CACHE_TTL_MS = 400;

const globalStore = globalThis as typeof globalThis & {
  __spxStoreLoaded?: boolean;
  __spxStoreLoadedAt?: number;
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

/* ── REST KV (Upstash Redis / Vercel KV) ── */

type RestKvConfig = { url: string; token: string };

function getRestKvConfig(): RestKvConfig | null {
  if (typeof process === "undefined" || !process.env) return null;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

async function loadFromRestKv(): Promise<StoreData | null> {
  const kv = getRestKvConfig();
  if (!kv) return null;
  try {
    const response = await fetch(`${kv.url}/get/${STORE_KEY}`, {
      headers: { Authorization: `Bearer ${kv.token}` },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { result?: string | null };
    if (!data.result) return null;
    return migrateStoreData(JSON.parse(data.result) as Partial<StoreData>);
  } catch {
    return null;
  }
}

async function saveToRestKv(store: StoreData): Promise<void> {
  const kv = getRestKvConfig();
  if (!kv) return;
  try {
    await fetch(kv.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${kv.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(["SET", STORE_KEY, JSON.stringify(store)]),
    });
  } catch {
    // Ignore remote write failures; memory copy stays authoritative locally.
  }
}

/* ── Local disk (dev) ── */

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

/* ── Cloudflare KV binding ── */

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

function hasRemoteBackend(env?: StorageEnv): boolean {
  return Boolean(env?.SPX_KV) || getRestKvConfig() !== null;
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
  const remote = hasRemoteBackend(activeEnv);

  if (globalStore.__spxStoreLoaded) {
    // With a shared remote backend, refresh periodically so multiple
    // serverless instances observe each other's writes.
    const age = Date.now() - (globalStore.__spxStoreLoadedAt ?? 0);
    if (!remote || age < REMOTE_CACHE_TTL_MS) {
      return getMemoryStore();
    }
    const fresh =
      (activeEnv ? await loadFromKv(activeEnv) : null) ?? (await loadFromRestKv());
    if (fresh) {
      globalStore.__spxStore = fresh;
    }
    globalStore.__spxStoreLoadedAt = Date.now();
    return getMemoryStore();
  }

  const fromKv = activeEnv ? await loadFromKv(activeEnv) : null;
  const fromRest = fromKv ? null : await loadFromRestKv();
  const fromDisk = fromKv ?? fromRest ? null : await loadFromDisk();
  globalStore.__spxStore = fromKv ?? fromRest ?? fromDisk ?? createDefaultStore();
  globalStore.__spxStoreLoaded = true;
  globalStore.__spxStoreLoadedAt = Date.now();

  // First boot with a remote backend and no stored data yet: persist the
  // generated store immediately so other instances share the pairing token.
  if (remote && !fromKv && !fromRest) {
    if (activeEnv) await saveToKv(globalStore.__spxStore, activeEnv);
    await saveToRestKv(globalStore.__spxStore);
  }

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
  globalStore.__spxStoreLoadedAt = Date.now();

  if (hasRemoteBackend(activeEnv)) {
    // Serverless functions may freeze right after responding, so remote
    // writes must complete before the request ends — no debounce.
    if (activeEnv) await saveToKv(store, activeEnv);
    await saveToRestKv(store);
    void saveToDisk(store);
  } else {
    scheduleSave(store, activeEnv);
  }
  return store;
}

export function resetStoreCache(): void {
  globalStore.__spxStoreLoaded = false;
  globalStore.__spxStore = undefined;
  globalStore.__spxStoreLoadedAt = undefined;
}
