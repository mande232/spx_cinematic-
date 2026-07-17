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

export type SharedSession = {
  state: ExperienceState;
  capturedImage: string | null;
  processedImage: string | null;
  visitorName: string;
  chapterIndex: number;
  consentGiven: boolean;
  updatedAt: number;
};

export type VisitorRecord = {
  id: string;
  name: string;
  timestamp: number;
  date: string;
  time: string;
  photo: string | null;
  completedChapters: number;
  duration: number;
  consentGiven: boolean;
};

export type AnalyticsEvent = {
  id: string;
  type: string;
  timestamp: number;
  meta?: Record<string, string | number | boolean>;
};

export type ChapterOverride = {
  id: string;
  title?: string;
  caption?: string;
};

export type StoreData = {
  session: SharedSession;
  visitors: VisitorRecord[];
  sessionStartedAt: number | null;
  pairingToken: string;
  maintenanceMode: boolean;
  consentRequired: boolean;
  adminSessions: Record<string, number>;
  analytics: AnalyticsEvent[];
  chapterOverrides: ChapterOverride[];
};

export type SessionEnvelope = {
  session: SharedSession;
  pairingToken: string;
  maintenanceMode: boolean;
  consentRequired: boolean;
  chapterOverrides: ChapterOverride[];
};

export const CHAPTER_COUNT = 6;
export const MAX_ANALYTICS_EVENTS = 2000;
export const MAX_VISITOR_RECORDS = 500;

export const DEFAULT_SESSION: SharedSession = {
  state: "idle",
  capturedImage: null,
  processedImage: null,
  visitorName: "",
  chapterIndex: 0,
  consentGiven: false,
  updatedAt: Date.now(),
};

export function createPairingToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

export function createDefaultStore(): StoreData {
  return {
    // updatedAt 0 so a freshly created store (e.g. on a cold serverless
    // instance) never wins over a live client session during sync.
    session: { ...DEFAULT_SESSION, updatedAt: 0 },
    visitors: [],
    sessionStartedAt: null,
    pairingToken: createPairingToken(),
    maintenanceMode: false,
    consentRequired: true,
    adminSessions: {},
    analytics: [],
    chapterOverrides: [],
  };
}

export function migrateStoreData(raw: Partial<StoreData>): StoreData {
  const defaults = createDefaultStore();
  return {
    session: {
      ...defaults.session,
      ...raw.session,
      processedImage: raw.session?.processedImage ?? null,
      consentGiven: raw.session?.consentGiven ?? false,
    },
    visitors: (raw.visitors ?? []).map((v) => ({
      ...v,
      consentGiven: v.consentGiven ?? false,
    })),
    sessionStartedAt: raw.sessionStartedAt ?? null,
    pairingToken: raw.pairingToken ?? createPairingToken(),
    maintenanceMode: raw.maintenanceMode ?? false,
    consentRequired: raw.consentRequired ?? true,
    adminSessions: raw.adminSessions ?? {},
    analytics: raw.analytics ?? [],
    chapterOverrides: raw.chapterOverrides ?? [],
  };
}

export function toSessionEnvelope(store: StoreData): SessionEnvelope {
  return {
    session: store.session,
    pairingToken: store.pairingToken,
    maintenanceMode: store.maintenanceMode,
    consentRequired: store.consentRequired,
    chapterOverrides: store.chapterOverrides,
  };
}
