import "./lib/error-capture";

import {
  adminLoginCookie,
  adminLogoutCookie,
  checkLoginRateLimit,
  clearLoginAttempts,
  createAdminSession,
  getAdminPin,
  getAdminTokenFromRequest,
  isAdminRequest,
  loadAdminSessions,
  recordFailedLogin,
  revokeAdminSession,
} from "./lib/admin-auth";
import { processPortraitOnServer } from "./lib/background-removal";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { loadPhotoData, photoRefToId } from "./lib/photo-storage";
import {
  appendAnalyticsEvent,
  clearVisitors,
  deleteVisitor,
  getAnalytics,
  getVisitors,
  joinSession,
  patchSession,
  readStore,
  resetSession,
  setConsentRequired,
  setMaintenanceMode,
  updateChapterOverrides,
} from "./lib/server-store";
import { setStorageEnv, type StorageEnv } from "./lib/storage-adapter";
import type { ChapterOverride, SharedSession } from "./lib/shared-types";
import { toSessionEnvelope } from "./lib/shared-types";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

type CloudflareEnv = StorageEnv & {
  REMOVE_BG_API_KEY?: string;
  CRM_WEBHOOK_URL?: string;
};

const MAX_IMAGE_BYTES = 2_000_000;

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init?.headers },
  });
}

function unauthorized() {
  return json({ error: "Unauthorized" }, { status: 401 });
}

function getEnv(raw: unknown): CloudflareEnv {
  return (raw ?? {}) as CloudflareEnv;
}

function validateSessionPatch(patch: Partial<SharedSession>): string | null {
  if (patch.capturedImage && patch.capturedImage.length > MAX_IMAGE_BYTES) {
    return "Image payload too large";
  }
  if (patch.processedImage && patch.processedImage.length > MAX_IMAGE_BYTES) {
    return "Processed image payload too large";
  }
  return null;
}

async function maybeForwardCrmWebhook(env: CloudflareEnv, payload: unknown): Promise<void> {
  const url = env.CRM_WEBHOOK_URL ?? process.env.CRM_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Non-blocking CRM forward.
  }
}

async function handleExperienceApi(request: Request, rawEnv: unknown): Promise<Response | null> {
  const env = getEnv(rawEnv);
  setStorageEnv(env);
  await loadAdminSessions(env);

  const url = new URL(request.url);

  if (url.pathname === "/api/admin/login" && request.method === "POST") {
    const rate = checkLoginRateLimit(request);
    if (!rate.allowed) {
      return json(
        { error: "rate_limited", retryAfterMs: rate.retryAfterMs },
        { status: 429 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as { pin?: string };
    if (body.pin !== getAdminPin()) {
      recordFailedLogin(request);
      return json({ error: "Invalid PIN" }, { status: 401 });
    }
    clearLoginAttempts(request);
    const token = await createAdminSession(env);
    return json({ ok: true }, { headers: { "Set-Cookie": adminLoginCookie(token) } });
  }

  if (url.pathname === "/api/admin/logout" && request.method === "POST") {
    await revokeAdminSession(getAdminTokenFromRequest(request), env);
    return json({ ok: true }, { headers: { "Set-Cookie": adminLogoutCookie() } });
  }

  if (url.pathname === "/api/admin/session" && request.method === "GET") {
    return json({ authenticated: isAdminRequest(request) });
  }

  if (url.pathname === "/api/admin/dashboard" && request.method === "GET") {
    if (!isAdminRequest(request)) return unauthorized();
    const store = await readStore(env);
    const today = new Date().toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const visitors = store.visitors;
    const namedCount = visitors.filter((v) => v.name).length;
    const photoCount = visitors.filter((v) => v.photo).length;
    const todayCount = visitors.filter((v) => v.date === today).length;
    const avgDuration = visitors.length
      ? Math.round(visitors.reduce((sum, v) => sum + v.duration, 0) / visitors.length)
      : 0;

    return json({
      visitors,
      session: store.session,
      pairingToken: store.pairingToken,
      maintenanceMode: store.maintenanceMode,
      consentRequired: store.consentRequired,
      chapterOverrides: store.chapterOverrides,
      analytics: store.analytics.slice(0, 100),
      stats: {
        total: visitors.length,
        today: todayCount,
        avgDuration,
        namedCount,
        photoCount,
        eventCount: store.analytics.length,
      },
    });
  }

  if (url.pathname === "/api/admin/session" && request.method === "POST") {
    if (!isAdminRequest(request)) return unauthorized();
    const patch = (await request.json().catch(() => ({}))) as Partial<SharedSession>;
    const validationError = validateSessionPatch(patch);
    if (validationError) return json({ error: validationError }, { status: 413 });
    const result = await patchSession(patch, { admin: true, env });
    return json({ session: result.session, pairingToken: result.pairingToken });
  }

  if (url.pathname === "/api/admin/session/reset" && request.method === "POST") {
    if (!isAdminRequest(request)) return unauthorized();
    const result = await resetSession(env);
    return json(result);
  }

  if (url.pathname === "/api/admin/maintenance" && request.method === "POST") {
    if (!isAdminRequest(request)) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
    const enabled = await setMaintenanceMode(Boolean(body.enabled), env);
    const store = await readStore(env);
    return json({ maintenanceMode: enabled, pairingToken: store.pairingToken });
  }

  if (url.pathname === "/api/admin/consent" && request.method === "POST") {
    if (!isAdminRequest(request)) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as { required?: boolean };
    const required = await setConsentRequired(Boolean(body.required), env);
    return json({ consentRequired: required });
  }

  if (url.pathname === "/api/admin/chapters" && request.method === "POST") {
    if (!isAdminRequest(request)) return unauthorized();
    const body = (await request.json().catch(() => ({}))) as { overrides?: ChapterOverride[] };
    const overrides = await updateChapterOverrides(body.overrides ?? [], env);
    return json({ chapterOverrides: overrides });
  }

  if (url.pathname === "/api/admin/analytics" && request.method === "GET") {
    if (!isAdminRequest(request)) return unauthorized();
    return json(await getAnalytics(env));
  }

  if (url.pathname === "/api/admin/crm-export" && request.method === "POST") {
    if (!isAdminRequest(request)) return unauthorized();
    const store = await readStore(env);
    const payload = { visitors: store.visitors, exportedAt: Date.now() };
    await maybeForwardCrmWebhook(env, payload);
    return json({ ok: true, count: store.visitors.length });
  }

  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true, timestamp: Date.now() });
  }

  if (url.pathname === "/api/session" && request.method === "GET") {
    const store = await readStore(env);
    return json(toSessionEnvelope(store));
  }

  if (url.pathname === "/api/session/join" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { pairingToken?: string };
    if (!body.pairingToken) return json({ error: "invalid_pairing" }, { status: 403 });
    const result = await joinSession(body.pairingToken, env);
    if (result.error) {
      const status = result.error === "session_busy" ? 409 : 403;
      return json({ error: result.error, session: result.session, pairingToken: result.pairingToken }, { status });
    }
    return json({ session: result.session, pairingToken: result.pairingToken });
  }

  if (url.pathname === "/api/session" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as Partial<SharedSession> & {
      pairingToken?: string;
    };
    const { pairingToken, ...patch } = body;
    const validationError = validateSessionPatch(patch);
    if (validationError) return json({ error: validationError }, { status: 413 });
    const result = await patchSession(patch, { pairingToken, env });
    if (result.error) {
      const status =
        result.error === "session_busy" ? 409
        : result.error === "consent_required" ? 422
        : 403;
      return json(
        { error: result.error, session: result.session, pairingToken: result.pairingToken },
        { status },
      );
    }
    return json({ session: result.session, pairingToken: result.pairingToken });
  }

  if (url.pathname === "/api/session/reset" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as { pairingToken?: string };
    if (!body.pairingToken) return json({ error: "invalid_pairing" }, { status: 403 });
    const store = await readStore(env);
    if (body.pairingToken !== store.pairingToken) {
      return json({ error: "invalid_pairing" }, { status: 403 });
    }
    const result = await resetSession(env);
    return json(result);
  }

  if (url.pathname === "/api/process-portrait" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      image?: string;
      pairingToken?: string;
    };
    const store = await readStore(env);
    if (!body.pairingToken || body.pairingToken !== store.pairingToken) {
      return json({ error: "invalid_pairing" }, { status: 403 });
    }
    if (!body.image) return json({ error: "missing_image" }, { status: 400 });
    const apiKey = env.REMOVE_BG_API_KEY ?? process.env.REMOVE_BG_API_KEY;
    const result = await processPortraitOnServer(body.image, apiKey);
    return json(result);
  }

  if (url.pathname === "/api/analytics/event" && request.method === "POST") {
    const body = (await request.json().catch(() => ({}))) as {
      type?: string;
      pairingToken?: string;
      meta?: Record<string, string | number | boolean>;
    };
    const store = await readStore(env);
    if (!body.pairingToken || body.pairingToken !== store.pairingToken) {
      return json({ error: "invalid_pairing" }, { status: 403 });
    }
    if (!body.type) return json({ error: "missing_type" }, { status: 400 });
    await appendAnalyticsEvent({ type: body.type, meta: body.meta }, env);
    return json({ ok: true });
  }

  const photoMatch = url.pathname.match(/^\/api\/photos\/([^/]+)$/);
  if (photoMatch && request.method === "GET") {
    const data = await loadPhotoData(photoRefToId(url.pathname), env);
    if (!data) return json({ error: "not_found" }, { status: 404 });
    const base64 = data.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new Response(bytes, {
      headers: {
        "content-type": data.startsWith("data:image/png") ? "image/png" : "image/jpeg",
        "cache-control": "public, max-age=86400",
      },
    });
  }

  if (url.pathname === "/api/visitors" && request.method === "GET") {
    if (!isAdminRequest(request)) return unauthorized();
    return json(await getVisitors(env));
  }

  if (url.pathname === "/api/visitors" && request.method === "DELETE") {
    if (!isAdminRequest(request)) return unauthorized();
    await clearVisitors(env);
    return json({ ok: true });
  }

  const visitorDeleteMatch = url.pathname.match(/^\/api\/visitors\/([^/]+)$/);
  if (visitorDeleteMatch && request.method === "DELETE") {
    if (!isAdminRequest(request)) return unauthorized();
    const removed = await deleteVisitor(decodeURIComponent(visitorDeleteMatch[1]), env);
    if (!removed) return json({ error: "not_found" }, { status: 404 });
    return json({ ok: true });
  }

  return null;
}

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const apiResponse = await handleExperienceApi(request, env);
      if (apiResponse) return apiResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
