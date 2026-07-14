import { persistAdminSessions, readAdminSessions } from "./server-store";
import type { StorageEnv } from "./storage-adapter";

const ADMIN_COOKIE = "spx-admin";
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

const loginAttempts = new Map<string, { count: number; lockedUntil: number }>();

let memoryAdminSessions: Record<string, number> = {};

export function getAdminPin(): string {
  if (typeof process !== "undefined" && process.env.ADMIN_PIN) {
    return process.env.ADMIN_PIN;
  }
  return "1234";
}

function isSecureContext(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function loadAdminSessions(env?: StorageEnv): Promise<void> {
  memoryAdminSessions = await readAdminSessions(env);
  const now = Date.now();
  for (const [token, expiresAt] of Object.entries(memoryAdminSessions)) {
    if (expiresAt < now) delete memoryAdminSessions[token];
  }
}

async function saveAdminSessions(env?: StorageEnv): Promise<void> {
  await persistAdminSessions(memoryAdminSessions, env);
}

export async function createAdminSession(env?: StorageEnv): Promise<string> {
  const token = crypto.randomUUID();
  memoryAdminSessions[token] = Date.now() + TOKEN_TTL_MS;
  await saveAdminSessions(env);
  return token;
}

export async function revokeAdminSession(
  token: string | null | undefined,
  env?: StorageEnv,
): Promise<void> {
  if (token && memoryAdminSessions[token]) {
    delete memoryAdminSessions[token];
    await saveAdminSessions(env);
  }
}

export function isValidAdminToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const expiresAt = memoryAdminSessions[token];
  if (!expiresAt || expiresAt < Date.now()) {
    delete memoryAdminSessions[token];
    return false;
  }
  return true;
}

export function getAdminTokenFromRequest(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${ADMIN_COOKIE}=([^;]+)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function isAdminRequest(request: Request): boolean {
  return isValidAdminToken(getAdminTokenFromRequest(request));
}

export function adminLoginCookie(token: string): string {
  const secure = isSecureContext() ? "; Secure" : "";
  return `${ADMIN_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${TOKEN_TTL_MS / 1000}${secure}`;
}

export function adminLogoutCookie(): string {
  const secure = isSecureContext() ? "; Secure" : "";
  return `${ADMIN_COOKIE}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`;
}

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "local"
  );
}

export function checkLoginRateLimit(request: Request): { allowed: boolean; retryAfterMs?: number } {
  const key = clientKey(request);
  const entry = loginAttempts.get(key);
  const now = Date.now();
  if (entry && entry.lockedUntil > now) {
    return { allowed: false, retryAfterMs: entry.lockedUntil - now };
  }
  return { allowed: true };
}

export function recordFailedLogin(request: Request): void {
  const key = clientKey(request);
  const entry = loginAttempts.get(key) ?? { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOCKOUT_MS;
    entry.count = 0;
  }
  loginAttempts.set(key, entry);
}

export function clearLoginAttempts(request: Request): void {
  loginAttempts.delete(clientKey(request));
}
