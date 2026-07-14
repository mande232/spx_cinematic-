import type { StorageEnv } from "./storage-adapter";

const PHOTO_PREFIX = "photo:";

export async function storePhotoData(
  id: string,
  dataUrl: string,
  env?: StorageEnv,
): Promise<string> {
  if (env?.SPX_KV) {
    await env.SPX_KV.put(`${PHOTO_PREFIX}${id}`, dataUrl);
    return `/api/photos/${id}`;
  }

  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), ".data", "photos");
    await fs.mkdir(dir, { recursive: true });
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
    await fs.writeFile(path.join(dir, `${id}.b64`), base64, "utf-8");
    return `/api/photos/${id}`;
  } catch {
    return dataUrl;
  }
}

export async function loadPhotoData(id: string, env?: StorageEnv): Promise<string | null> {
  if (env?.SPX_KV) {
    return env.SPX_KV.get(`${PHOTO_PREFIX}${id}`);
  }

  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.join(process.cwd(), ".data", "photos", `${id}.b64`);
    const base64 = await fs.readFile(filePath, "utf-8");
    return `data:image/jpeg;base64,${base64}`;
  } catch {
    return null;
  }
}

export function isPhotoRef(value: string | null): boolean {
  return Boolean(value?.startsWith("/api/photos/"));
}

export function photoRefToId(ref: string): string {
  return ref.replace("/api/photos/", "");
}
