const LS_LOG_KEY = "spx-visitor-log";
import { StringDecoder } from "string_decoder";

export type VisitorRecord = {
  id: string;
  name: string;
  timestamp: number; // ms since epoch
  date: string;      // human-readable
  time: string;
  photo: string | null;
  completedChapters: number;
  duration: number;  // seconds from scanned → completed
};

export function getVisitorLog(): VisitorRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_LOG_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function appendVisitorRecord(record: Omit<VisitorRecord, "id" | "date" | "time">): VisitorRecord {
  const full: VisitorRecord = {
    ...record,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    date: new Date(record.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: new Date(record.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
  };
  const log = getVisitorLog();
  log.unshift(full); // newest first
  // Keep max 500 records
  localStorage.setItem(LS_LOG_KEY, JSON.stringify(log.slice(0, 500)));
  return full;
}

export function clearVisitorLog() {
  localStorage.removeItem(LS_LOG_KEY);
}

export function exportLogAsCSV(log: VisitorRecord[]): void {
  const header = "ID,Name,Date,Time,Chapters Completed,Duration (s)";
  const rows = log.map((r) =>
    [r.id, r.name || "Anonymous", r.date, r.time, r.completedChapters, r.duration].join(",")
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
