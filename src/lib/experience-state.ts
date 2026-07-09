import { useEffect, useState, useCallback, useRef } from "react";
import { appendVisitorRecord } from "./visitor-log";

import chapterCoffee from "@/assets/chapter-coffee.jpg";
import chapterAi from "@/assets/chapter-ai.jpg";
import chapterBiotech from "@/assets/chapter-biotech.jpg";
import chapterEnergy from "@/assets/chapter-energy.jpg";
import chapterLogistics from "@/assets/chapter-logistics.jpg";
import chapterFuture from "@/assets/chapter-future.jpg";

export type ExperienceState =
  | "idle"
  | "scanned"
  | "camera_ready"
  | "countdown"
  | "capturing"
  | "processing"
  | "rendering"
  | "playing"
  | "completed"
  | "error";

export type Chapter = {
  id: string;
  title: string;
  caption: string;
  image: string;
};

export const CHAPTERS: Chapter[] = [
  { id: "01", title: "The Harvest", caption: "Coffee plantations & exports", image: chapterCoffee },
  { id: "02", title: "Intelligence", caption: "AI & software platforms", image: chapterAi },
  { id: "03", title: "Living Sciences", caption: "Biotechnology laboratories", image: chapterBiotech },
  { id: "04", title: "Powering Africa", caption: "Renewable energy grid", image: chapterEnergy },
  { id: "05", title: "In Motion", caption: "Logistics & supply chains", image: chapterLogistics },
  { id: "06", title: "Future Forward", caption: "Pan-African horizons", image: chapterFuture },
];

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
const LS_NAME_KEY = "spx-exp-name";
const LS_CHAPTER_KEY = "spx-exp-chapter";
const LS_BROADCAST_KEY = "spx-exp-broadcast";

export type SharedSession = {
  state: ExperienceState;
  capturedImage: string | null;
  visitorName: string;
  chapterIndex: number;
};

function readSession(): SharedSession {
  if (typeof window === "undefined") return { state: "idle", capturedImage: null, visitorName: "", chapterIndex: 0 };
  return {
    state: (localStorage.getItem(LS_STATE_KEY) as ExperienceState) ?? "idle",
    capturedImage: localStorage.getItem(LS_IMAGE_KEY),
    visitorName: localStorage.getItem(LS_NAME_KEY) ?? "",
    chapterIndex: Number(localStorage.getItem(LS_CHAPTER_KEY) ?? 0),
  };
}

function writeSession(patch: Partial<SharedSession>) {
  if (typeof window === "undefined") return;
  if (patch.state !== undefined) localStorage.setItem(LS_STATE_KEY, patch.state);
  if (patch.capturedImage !== undefined) {
    if (patch.capturedImage) localStorage.setItem(LS_IMAGE_KEY, patch.capturedImage);
    else localStorage.removeItem(LS_IMAGE_KEY);
  }
  if (patch.visitorName !== undefined) localStorage.setItem(LS_NAME_KEY, patch.visitorName);
  if (patch.chapterIndex !== undefined) localStorage.setItem(LS_CHAPTER_KEY, String(patch.chapterIndex));
  // Trigger cross-tab sync via a broadcast key change
  localStorage.setItem(LS_BROADCAST_KEY, String(Date.now()));
}

export function useSharedSession() {
  const [session, setSession] = useState<SharedSession>(readSession);
  const sessionStartRef = useRef<number | null>(null);

  // Sync from storage events (cross-tab) — no polling needed
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_BROADCAST_KEY || e.key === LS_STATE_KEY) {
        setSession(readSession());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<SharedSession>) => {
    if (patch.state === "scanned") {
      sessionStartRef.current = Date.now();
    }
    if (patch.state === "completed") {
      const current = readSession();
      appendVisitorRecord({
        name: patch.visitorName ?? current.visitorName ?? "",
        timestamp: Date.now(),
        photo: patch.capturedImage ?? current.capturedImage,
        completedChapters: CHAPTERS.length,
        duration: sessionStartRef.current
          ? Math.round((Date.now() - sessionStartRef.current) / 1000)
          : 0,
      });
      sessionStartRef.current = null;
    }
    writeSession(patch);
    setSession((prev) => ({ ...prev, ...patch }));
  }, []);

  return { session, update };
}
