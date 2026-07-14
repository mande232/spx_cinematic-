export type { VisitorRecord, SharedSession, AnalyticsEvent, ChapterOverride } from "./shared-types";

import type { AnalyticsEvent, ChapterOverride, SharedSession, VisitorRecord } from "./shared-types";

export type AdminDashboardData = {
  visitors: VisitorRecord[];
  session: SharedSession;
  pairingToken: string;
  maintenanceMode: boolean;
  consentRequired: boolean;
  chapterOverrides: ChapterOverride[];
  analytics: AnalyticsEvent[];
  stats: {
    total: number;
    today: number;
    avgDuration: number;
    namedCount: number;
    photoCount: number;
    eventCount: number;
  };
};

export type AdminApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; unauthorized: boolean; error?: string };

async function adminFetch<T>(url: string, init?: RequestInit): Promise<AdminApiResult<T>> {
  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      ...init,
      headers: {
        "content-type": "application/json",
        ...init?.headers,
      },
    });

    if (response.status === 401) {
      return { ok: false, unauthorized: true };
    }

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, unauthorized: false, error: body.error ?? "request_failed" };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, unauthorized: false, error: "network" };
  }
}

export async function fetchAdminDashboard(): Promise<AdminApiResult<AdminDashboardData>> {
  return adminFetch<AdminDashboardData>("/api/admin/dashboard");
}

export async function fetchVisitorLog(): Promise<AdminApiResult<VisitorRecord[]>> {
  const result = await adminFetch<VisitorRecord[]>("/api/visitors");
  if (!result.ok) return result;
  return { ok: true, data: result.data };
}

export async function clearVisitorLogRemote(): Promise<AdminApiResult<{ ok: true }>> {
  return adminFetch<{ ok: true }>("/api/visitors", { method: "DELETE" });
}

export async function deleteVisitorRecord(id: string): Promise<AdminApiResult<{ ok: true }>> {
  return adminFetch<{ ok: true }>(`/api/visitors/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function setMaintenanceModeRemote(
  enabled: boolean,
): Promise<AdminApiResult<{ maintenanceMode: boolean; pairingToken: string }>> {
  return adminFetch("/api/admin/maintenance", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function setConsentRequiredRemote(
  required: boolean,
): Promise<AdminApiResult<{ consentRequired: boolean }>> {
  return adminFetch("/api/admin/consent", {
    method: "POST",
    body: JSON.stringify({ required }),
  });
}

export async function updateChapterOverridesRemote(
  overrides: ChapterOverride[],
): Promise<AdminApiResult<{ chapterOverrides: ChapterOverride[] }>> {
  return adminFetch("/api/admin/chapters", {
    method: "POST",
    body: JSON.stringify({ overrides }),
  });
}

export async function exportCrmRemote(): Promise<AdminApiResult<{ ok: true; count: number }>> {
  return adminFetch("/api/admin/crm-export", { method: "POST" });
}

export async function loginAdmin(pin: string): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function logoutAdmin(): Promise<void> {
  try {
    await fetch("/api/admin/logout", { method: "POST", credentials: "include" });
  } catch {
    // Ignore network errors on logout.
  }
}

export async function checkAdminSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/admin/session", { credentials: "include", cache: "no-store" });
    if (!response.ok) return false;
    const data = (await response.json()) as { authenticated?: boolean };
    return Boolean(data.authenticated);
  } catch {
    return false;
  }
}

function csvEscape(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function exportLogAsCSV(log: VisitorRecord[]): void {
  const header = "ID,Name,Date,Time,Chapters Completed,Duration (s),Consent";
  const rows = log.map((r) =>
    [
      csvEscape(r.id),
      csvEscape(r.name || "Anonymous"),
      csvEscape(r.date),
      csvEscape(r.time),
      csvEscape(r.completedChapters),
      csvEscape(r.duration),
      csvEscape(r.consentGiven ? "yes" : "no"),
    ].join(","),
  );
  const csv = [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `spx-visitors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadVisitorPhoto(photo: string, name: string): void {
  const a = document.createElement("a");
  a.href = photo;
  a.download = `spx-visitor-${name || "anonymous"}-${Date.now()}.jpg`;
  a.click();
}
