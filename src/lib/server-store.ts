import {
  CHAPTER_COUNT,
  createDefaultStore,
  createPairingToken,
  DEFAULT_SESSION,
  MAX_ANALYTICS_EVENTS,
  MAX_VISITOR_RECORDS,
  type AnalyticsEvent,
  type ChapterOverride,
  type SharedSession,
  type StoreData,
  type VisitorRecord,
} from "./shared-types";
import { isSessionBusy } from "./session-utils";
import type { StorageEnv } from "./storage-adapter";
import { ensureStoreLoaded, mutateStore, readStore } from "./storage-adapter";

export type SessionPatchResult = {
  session: SharedSession;
  pairingToken?: string;
  error?: "session_busy" | "invalid_pairing" | "maintenance_mode" | "consent_required";
};

export function formatVisitorRecord(
  session: SharedSession,
  sessionStartedAt: number | null,
  photo: string | null,
): VisitorRecord {
  const timestamp = Date.now();
  return {
    id: `${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    name: session.visitorName ?? "",
    timestamp,
    date: new Date(timestamp).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    time: new Date(timestamp).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    photo,
    completedChapters: CHAPTER_COUNT,
    duration: sessionStartedAt ? Math.round((timestamp - sessionStartedAt) / 1000) : 0,
    consentGiven: session.consentGiven,
  };
}

export async function patchSession(
  patch: Partial<SharedSession>,
  options?: { pairingToken?: string; admin?: boolean; env?: StorageEnv },
): Promise<SessionPatchResult> {
  let result: SessionPatchResult = { session: DEFAULT_SESSION };
  const env = options?.env;

  await mutateStore((data) => {
    const previous = data.session;

    if (data.maintenanceMode && !options?.admin && patch.state && patch.state !== "idle") {
      result = { session: previous, pairingToken: data.pairingToken, error: "maintenance_mode" };
      return;
    }

    if (!options?.admin) {
      if (!options?.pairingToken || options.pairingToken !== data.pairingToken) {
        result = { session: previous, pairingToken: data.pairingToken, error: "invalid_pairing" };
        return;
      }
    }

    if (patch.state === "scanned" && isSessionBusy(previous.state)) {
      result = { session: previous, pairingToken: data.pairingToken, error: "session_busy" };
      return;
    }

    if (
      data.consentRequired &&
      !options?.admin &&
      patch.state &&
      ["camera_ready", "countdown", "capturing", "processing"].includes(patch.state) &&
      !previous.consentGiven &&
      !patch.consentGiven
    ) {
      result = { session: previous, pairingToken: data.pairingToken, error: "consent_required" };
      return;
    }

    const next: SharedSession = {
      ...previous,
      ...patch,
      updatedAt: Date.now(),
    };

    if (patch.state === "scanned") {
      data.sessionStartedAt = Date.now();
    }

    if (patch.state === "completed" && previous.state !== "completed") {
      const record = formatVisitorRecord(
        next,
        data.sessionStartedAt,
        next.processedImage ?? next.capturedImage,
      );
      data.visitors = [record, ...data.visitors].slice(0, MAX_VISITOR_RECORDS);
      data.sessionStartedAt = null;
    }

    data.session = next;
    result = { session: next, pairingToken: data.pairingToken };
  }, env);

  return result;
}

export async function resetSession(env?: StorageEnv): Promise<{
  session: SharedSession;
  pairingToken: string;
}> {
  const store = await mutateStore((data) => {
    data.session = { ...DEFAULT_SESSION, updatedAt: Date.now() };
    data.sessionStartedAt = null;
    data.pairingToken = createPairingToken();
  }, env);
  return { session: store.session, pairingToken: store.pairingToken };
}

export async function joinSession(
  pairingToken: string,
  env?: StorageEnv,
): Promise<SessionPatchResult> {
  return patchSession({ state: "scanned" }, { pairingToken, env });
}

export async function getVisitors(env?: StorageEnv): Promise<VisitorRecord[]> {
  const store = await readStore(env);
  return store.visitors;
}

export async function clearVisitors(env?: StorageEnv): Promise<void> {
  await mutateStore((data) => {
    data.visitors = [];
  }, env);
}

export async function deleteVisitor(id: string, env?: StorageEnv): Promise<boolean> {
  let removed = false;
  await mutateStore((data) => {
    const next = data.visitors.filter((v) => v.id !== id);
    removed = next.length !== data.visitors.length;
    data.visitors = next;
  }, env);
  return removed;
}

export async function appendAnalyticsEvent(
  event: Omit<AnalyticsEvent, "id" | "timestamp"> & { timestamp?: number },
  env?: StorageEnv,
): Promise<void> {
  await mutateStore((data) => {
    const entry: AnalyticsEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: event.timestamp ?? Date.now(),
      type: event.type,
      meta: event.meta,
    };
    data.analytics = [entry, ...data.analytics].slice(0, MAX_ANALYTICS_EVENTS);
  }, env);
}

export async function getAnalytics(env?: StorageEnv): Promise<AnalyticsEvent[]> {
  const store = await readStore(env);
  return store.analytics;
}

export async function setMaintenanceMode(enabled: boolean, env?: StorageEnv): Promise<boolean> {
  await mutateStore((data) => {
    data.maintenanceMode = enabled;
    if (enabled) {
      data.session = { ...DEFAULT_SESSION, updatedAt: Date.now() };
      data.sessionStartedAt = null;
      data.pairingToken = createPairingToken();
    }
  }, env);
  return enabled;
}

export async function setConsentRequired(required: boolean, env?: StorageEnv): Promise<boolean> {
  await mutateStore((data) => {
    data.consentRequired = required;
  }, env);
  return required;
}

export async function updateChapterOverrides(
  overrides: ChapterOverride[],
  env?: StorageEnv,
): Promise<ChapterOverride[]> {
  const store = await mutateStore((data) => {
    data.chapterOverrides = overrides;
  }, env);
  return store.chapterOverrides;
}

export async function persistAdminSessions(
  sessions: Record<string, number>,
  env?: StorageEnv,
): Promise<void> {
  await mutateStore((data) => {
    data.adminSessions = sessions;
  }, env);
}

export async function readAdminSessions(env?: StorageEnv): Promise<Record<string, number>> {
  const store = await readStore(env);
  return store.adminSessions;
}

export { readStore, ensureStoreLoaded, createDefaultStore };
