import type { ExperienceState } from "./shared-types";

export const ACTIVE_SESSION_STATES: ExperienceState[] = [
  "camera_ready",
  "countdown",
  "capturing",
  "processing",
  "rendering",
  "playing",
];

export function isSessionBusy(state: ExperienceState): boolean {
  return ACTIVE_SESSION_STATES.includes(state);
}

export const PHONE_STEPS = [
  { id: "01", label: "Welcome" },
  { id: "02", label: "Preparing" },
  { id: "03", label: "On screen" },
  { id: "04", label: "Finale" },
] as const;

export function getPhoneStepIndex(state: ExperienceState, reviewing: boolean): number {
  if (reviewing) return 1;
  if (state === "idle" || state === "scanned") return 0;
  if (state === "camera_ready" || state === "countdown" || state === "capturing") return 1;
  if (state === "processing" || state === "rendering" || state === "playing") return 2;
  if (state === "completed") return 3;
  return 0;
}
