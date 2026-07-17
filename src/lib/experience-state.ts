import { useEffect, useState, useCallback, useRef } from "react";

import chapterCoffee from "@/assets/chapter-coffee.jpg";
import chapterAi from "@/assets/chapter-ai.jpg";
import chapterBiotech from "@/assets/chapter-biotech.jpg";
import chapterEnergy from "@/assets/chapter-energy.jpg";
import chapterLogistics from "@/assets/chapter-logistics.jpg";
import chapterFuture from "@/assets/chapter-future.jpg";

import type { ChapterOverride, ExperienceState, SessionEnvelope, SharedSession } from "./shared-types";
import { DEFAULT_SESSION } from "./shared-types";
import { readPairingToken, writePairingToken } from "./pairing";

export type { ExperienceState, SharedSession } from "./shared-types";

export type Chapter = {
  id: string;
  title: string;
  caption: string;
  image: string;
};

const BASE_CHAPTERS: Chapter[] = [
  { id: "01", title: "The Harvest", caption: "Coffee plantations & exports", image: chapterCoffee },
  { id: "02", title: "Intelligence", caption: "AI & software platforms", image: chapterAi },
  { id: "03", title: "Living Sciences", caption: "Biotechnology laboratories", image: chapterBiotech },
  { id: "04", title: "Powering Africa", caption: "Renewable energy grid", image: chapterEnergy },
  { id: "05", title: "In Motion", caption: "Logistics & supply chains", image: chapterLogistics },
  { id: "06", title: "Future Forward", caption: "Pan-African horizons", image: chapterFuture },
];

export function getChapters(overrides: ChapterOverride[] = []): Chapter[] {
  return BASE_CHAPTERS.map((chapter) => {
    const override = overrides.find((o) => o.id === chapter.id);
    if (!override) return chapter;
    return {
      ...chapter,
      title: override.title ?? chapter.title,
      caption: override.caption ?? chapter.caption,
    };
  });
}

export const CHAPTERS = BASE_CHAPTERS;

export const SPX_PROJECTS = [
  { title: "Tana Beles Sugar", category: "Agro-Industry", desc: "Large-scale sugar production & irrigation infrastructure in Ethiopia." },
  { title: "Hawassa Industrial Park", category: "Infrastructure", desc: "World-class industrial park powering Ethiopia's textile & apparel sector." },
  { title: "SPX AI Platform", category: "Technology", desc: "Proprietary AI suite for supply-chain optimisation across Africa." },
  { title: "Green Energy Grid", category: "Energy", desc: "Renewable energy installations spanning solar & hydro across East Africa." },
  { title: "Pan-African Logistics", category: "Logistics", desc: "End-to-end freight & cold-chain network connecting 12 countries." },
  { title: "BioTech Labs", category: "Biotechnology", desc: "R&D facilities advancing pharmaceutical manufacturing in Africa." },
];

export const STATE_LABELS: Record<ExperienceState, { step: string; label: string; hint: string }> = {
  idle: { step: "01", label: "Idle", hint: "Ambient loop — awaiting visitor" },
  scanned: { step: "02", label: "Scanned", hint: "Session opened on device" },
  camera_ready: { step: "03", label: "Camera", hint: "Framing yourself" },
  countdown: { step: "03", label: "Countdown", hint: "Hold still" },
  capturing: { step: "03", label: "Capture", hint: "Freezing the frame" },
  processing: { step: "04", label: "Compose", hint: "Removing background" },
  rendering: { step: "04", label: "Render", hint: "Assembling your film" },
  playing: { step: "05", label: "Playback", hint: "You are on screen" },
  completed: { step: "06", label: "Complete", hint: "Welcome to SPX" },
  error: { step: "—", label: "Error", hint: "Something went wrong" },
};

const LS_STATE_KEY = "spx-exp-state";
const LS_IMAGE_KEY = "spx-exp-image";
const LS_PROCESSED_KEY = "spx-exp-processed-image";
const LS_NAME_KEY = "spx-exp-name";
const LS_CHAPTER_KEY = "spx-exp-chapter";
const LS_CONSENT_KEY = "spx-exp-consent";
const LS_BROADCAST_KEY = "spx-exp-broadcast";
const LS_MAINTENANCE_KEY = "spx-exp-maintenance";
const SESSION_EVENT = "spx-shared-session-updated";

function readSession(): SharedSession {
  if (typeof window === "undefined") return DEFAULT_SESSION;
  return {
    state: (localStorage.getItem(LS_STATE_KEY) as ExperienceState) ?? "idle",
    capturedImage: localStorage.getItem(LS_IMAGE_KEY),
    processedImage: localStorage.getItem(LS_PROCESSED_KEY),
    visitorName: localStorage.getItem(LS_NAME_KEY) ?? "",
    chapterIndex: Number(localStorage.getItem(LS_CHAPTER_KEY) ?? 0),
    consentGiven: localStorage.getItem(LS_CONSENT_KEY) === "true",
    updatedAt: Number(localStorage.getItem("spx-exp-updated-at") ?? 0),
  };
}

function writeSession(patch: Partial<SharedSession>) {
  if (typeof window === "undefined") return;
  if (patch.state !== undefined) localStorage.setItem(LS_STATE_KEY, patch.state);
  if (patch.capturedImage !== undefined) {
    if (patch.capturedImage) localStorage.setItem(LS_IMAGE_KEY, patch.capturedImage);
    else localStorage.removeItem(LS_IMAGE_KEY);
  }
  if (patch.processedImage !== undefined) {
    if (patch.processedImage) localStorage.setItem(LS_PROCESSED_KEY, patch.processedImage);
    else localStorage.removeItem(LS_PROCESSED_KEY);
  }
  if (patch.visitorName !== undefined) localStorage.setItem(LS_NAME_KEY, patch.visitorName);
  if (patch.chapterIndex !== undefined) localStorage.setItem(LS_CHAPTER_KEY, String(patch.chapterIndex));
  if (patch.consentGiven !== undefined) localStorage.setItem(LS_CONSENT_KEY, String(patch.consentGiven));
  if (patch.updatedAt !== undefined) localStorage.setItem("spx-exp-updated-at", String(patch.updatedAt));

  localStorage.setItem(LS_BROADCAST_KEY, String(Date.now()));
  window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

function writeWholeSession(session: SharedSession) {
  writeSession(session);
}

async function fetchServerEnvelope(): Promise<SessionEnvelope | null> {
  if (typeof window === "undefined") return null;

  try {
    const response = await fetch("/api/session", { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as SessionEnvelope;
  } catch {
    return null;
  }
}

async function writeServerSession(
  patch: Partial<SharedSession>,
  pairingToken?: string | null,
): Promise<{ session: SharedSession | null; pairingToken?: string; error?: string }> {
  if (typeof window === "undefined") return { session: null };

  const token = pairingToken ?? readPairingToken();
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...patch, pairingToken: token }),
    });
    const data = (await response.json()) as {
      error?: string;
      session?: SharedSession;
      pairingToken?: string;
    };
    if (!response.ok) {
      if (response.status === 409 && data.error === "session_busy" && data.session) {
        return { session: data.session, pairingToken: data.pairingToken, error: "session_busy" };
      }
      return { session: data.session ?? null, pairingToken: data.pairingToken, error: data.error ?? "request_failed" };
    }
    return { session: data.session ?? (data as unknown as SharedSession), pairingToken: data.pairingToken };
  } catch {
    return { session: null, error: "network" };
  }
}

async function resetServerSession(
  pairingToken?: string | null,
): Promise<{ session: SharedSession; pairingToken: string } | null> {
  if (typeof window === "undefined") return null;

  const token = pairingToken ?? readPairingToken();
  try {
    const response = await fetch("/api/session/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingToken: token }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { session: SharedSession; pairingToken: string };
  } catch {
    return null;
  }
}

export async function joinServerSession(
  pairingToken: string,
): Promise<{ session: SharedSession | null; pairingToken?: string; error?: string }> {
  try {
    const response = await fetch("/api/session/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pairingToken }),
    });
    const data = (await response.json()) as {
      error?: string;
      session?: SharedSession;
      pairingToken?: string;
    };
    if (!response.ok) {
      return { session: data.session ?? null, pairingToken: data.pairingToken, error: data.error };
    }
    return { session: data.session!, pairingToken: data.pairingToken };
  } catch {
    return { session: null, error: "network" };
  }
}

export async function trackAnalyticsEvent(
  type: string,
  meta?: Record<string, string | number | boolean>,
): Promise<void> {
  const pairingToken = readPairingToken();
  if (!pairingToken) return;
  try {
    await fetch("/api/analytics/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, pairingToken, meta }),
    });
  } catch {
    // Non-blocking analytics.
  }
}

export async function processPortraitRemote(
  image: string,
): Promise<{ processedImage: string; method: string } | null> {
  const pairingToken = readPairingToken();
  if (!pairingToken) return null;
  try {
    const response = await fetch("/api/process-portrait", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image, pairingToken }),
    });
    if (!response.ok) return null;
    return (await response.json()) as { processedImage: string; method: string };
  } catch {
    return null;
  }
}

export function useSharedSession() {
  // Start from the default session on both server and client so SSR hydration
  // matches; localStorage state is restored in an effect after mount.
  const [session, setSession] = useState<SharedSession>(() => ({ ...DEFAULT_SESSION }));
  const [pairingToken, setPairingToken] = useState<string | null>(null);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [chapterOverrides, setChapterOverrides] = useState<ChapterOverride[]>([]);
  const [online, setOnline] = useState(true);
  const [synced, setSynced] = useState(true);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [storageShared, setStorageShared] = useState<boolean | null>(null);
  const latestUpdatedAtRef = useRef<number>(0);

  useEffect(() => {
    const restored = readSession();
    latestUpdatedAtRef.current = restored.updatedAt ?? 0;
    setSession(restored);
    setPairingToken(readPairingToken());
    if (typeof navigator !== "undefined") setOnline(navigator.onLine);
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => {
      setOnline(false);
      setSynced(false);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_BROADCAST_KEY || e.key === LS_STATE_KEY) {
        setSession(readSession());
      }
    };

    const onSessionEvent = () => {
      setSession(readSession());
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SESSION_EVENT, onSessionEvent);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SESSION_EVENT, onSessionEvent);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const envelope = await fetchServerEnvelope();
      if (cancelled) return;
      if (!envelope) {
        setSynced(false);
        return;
      }

      if (envelope.pairingToken) {
        writePairingToken(envelope.pairingToken);
        setPairingToken(envelope.pairingToken);
      }
      setMaintenanceMode(envelope.maintenanceMode);
      setChapterOverrides(envelope.chapterOverrides ?? []);
      if (typeof envelope.storageShared === "boolean") {
        setStorageShared(envelope.storageShared);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(LS_MAINTENANCE_KEY, String(envelope.maintenanceMode));
      }

      const serverUpdatedAt = envelope.session.updatedAt ?? 0;
      if (serverUpdatedAt >= latestUpdatedAtRef.current) {
        latestUpdatedAtRef.current = serverUpdatedAt;
        writeWholeSession(envelope.session);
        setSession(envelope.session);
      }
      setSynced(true);
    };

    void sync();
    const id = window.setInterval(sync, 750);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const update = useCallback((patch: Partial<SharedSession>) => {
    const nextSession = { ...readSession(), ...patch, updatedAt: Date.now() };
    writeWholeSession(nextSession);
    setSession(nextSession);
    latestUpdatedAtRef.current = nextSession.updatedAt;

    void writeServerSession(patch, readPairingToken()).then(({ session: serverSession, pairingToken: nextToken, error }) => {
      if (error === "session_busy" && serverSession) {
        if (nextToken) {
          writePairingToken(nextToken);
          setPairingToken(nextToken);
        }
        writeWholeSession(serverSession);
        setSession(serverSession);
        setSynced(true);
        return;
      }
      if (error) {
        // Do NOT overwrite local state (e.g. a name being typed) with the
        // stale server session on rejected writes; surface the error instead.
        setSyncError(error);
        setSynced(false);
        return;
      }
      if (!serverSession) {
        setSynced(false);
        return;
      }
      if (nextToken) {
        writePairingToken(nextToken);
        setPairingToken(nextToken);
      }
      setSyncError(null);
      latestUpdatedAtRef.current = serverSession.updatedAt ?? Date.now();
      writeWholeSession(serverSession);
      setSession(serverSession);
      setSynced(true);
    });
  }, []);

  const clearSyncError = useCallback(() => setSyncError(null), []);

  const reset = useCallback(async () => {
    const result = await resetServerSession(readPairingToken());
    const next = result?.session ?? { ...DEFAULT_SESSION, updatedAt: Date.now() };
    if (result?.pairingToken) {
      writePairingToken(result.pairingToken);
      setPairingToken(result.pairingToken);
    }
    latestUpdatedAtRef.current = next.updatedAt;
    writeWholeSession(next);
    setSession(next);
    setSynced(Boolean(result));
    return next;
  }, []);

  return {
    session,
    update,
    reset,
    online,
    synced,
    pairingToken,
    maintenanceMode,
    chapterOverrides,
    syncError,
    clearSyncError,
    storageShared,
  };
}

export async function fetchSharedSession(): Promise<SessionEnvelope | null> {
  return fetchServerEnvelope();
}

export async function adminPatchSession(
  patch: Partial<SharedSession>,
): Promise<{ session: SharedSession | null; pairingToken?: string; error?: string }> {
  try {
    const response = await fetch("/api/admin/session", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await response.json()) as {
      session?: SharedSession;
      pairingToken?: string;
      error?: string;
    };
    if (!response.ok) return { session: null, error: data.error ?? "request_failed" };
    return { session: data.session ?? null, pairingToken: data.pairingToken };
  } catch {
    return { session: null, error: "network" };
  }
}

export async function adminResetSession(): Promise<{
  session: SharedSession | null;
  pairingToken?: string;
}> {
  try {
    const response = await fetch("/api/admin/session/reset", {
      method: "POST",
      credentials: "include",
    });
    if (!response.ok) return { session: null };
    return (await response.json()) as { session: SharedSession; pairingToken: string };
  } catch {
    return { session: null };
  }
}
