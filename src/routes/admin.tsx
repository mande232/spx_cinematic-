import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  checkAdminSession,
  clearVisitorLogRemote,
  deleteVisitorRecord,
  downloadVisitorPhoto,
  exportLogAsCSV,
  fetchAdminDashboard,
  loginAdmin,
  logoutAdmin,
} from "@/lib/visitor-log";
import { useSharedSession, CHAPTERS, adminPatchSession, adminResetSession } from "@/lib/experience-state";
import {
  exportCrmRemote,
  setConsentRequiredRemote,
  setMaintenanceModeRemote,
  updateChapterOverridesRemote,
} from "@/lib/visitor-log";
import { ThemeToggle } from "@/components/admin/ThemeToggle";
import { useSpxTheme } from "@/hooks/use-spx-theme";
import type { VisitorRecord } from "@/lib/visitor-log";
import type { SharedSession } from "@/lib/experience-state";

const LIVE_STATE_LABELS: Record<SharedSession["state"], string> = {
  idle: "Idle",
  scanned: "Scanned",
  camera_ready: "Camera ready",
  countdown: "Countdown",
  capturing: "Capturing",
  processing: "Processing",
  rendering: "Rendering",
  playing: "Playing",
  completed: "Completed",
  error: "Error",
};

export const Route = createFileRoute("/admin")({ component: AdminDashboard });

/* ─────────────────────────── Admin dashboard ─────────────────────────── */

const ADMIN_TABS = [
  { id: "overview", label: "Overview", desc: "Stats & recent activity" },
  { id: "visitors", label: "Visitors", desc: "Search, export, manage log" },
  { id: "live", label: "Live Control", desc: "Control active experience" },
  { id: "operations", label: "Operations", desc: "Maintenance, CMS, CRM" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["id"];

function AdminDashboard() {
  const { theme, toggleTheme } = useSpxTheme();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    void checkAdminSession().then(setAuthed);
  }, []);

  const handleLogin = async () => {
    setSubmitting(true);
    setPinError(false);
    const ok = await loginAdmin(pin);
    setSubmitting(false);
    if (ok) {
      setAuthed(true);
      setPin("");
      return;
    }
    setPinError(true);
    setPin("");
  };

  if (authed === null) {
    return (
      <div className="min-h-screen bg-background text-foreground font-display flex items-center justify-center">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Verifying access…</span>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="relative min-h-screen bg-background text-foreground font-display flex items-center justify-center px-4">
        <div className="absolute top-4 right-4 md:top-6 md:right-6">
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="text-center">
            <div className="size-10 bg-primary rounded-sm flex items-center justify-center font-mono text-primary-foreground font-bold tracking-tighter mx-auto mb-4">
              SPX
            </div>
            <h1 className="text-xl font-bold tracking-tight">Admin Access</h1>
            <p className="text-xs text-muted-foreground mt-1">Enter your PIN to continue</p>
          </div>
          <input
            type="password"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setPinError(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleLogin();
            }}
            placeholder="PIN"
            className={`w-full rounded-xl border bg-background px-4 py-3 text-sm text-center tracking-[0.4em] focus:outline-none focus:border-primary/60 ${pinError ? "border-destructive" : "border-border"}`}
          />
          {pinError && <p className="text-xs text-destructive text-center">Incorrect PIN</p>}
          <button
            onClick={() => void handleLogin()}
            disabled={submitting || pin.length === 0}
            className="w-full py-3 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
          >
            {submitting ? "Checking…" : "Enter"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      theme={theme}
      onToggleTheme={toggleTheme}
      onLogout={() => {
        void logoutAdmin();
        setAuthed(false);
      }}
      onUnauthorized={() => {
        toast.error("Session expired — please sign in again");
        setAuthed(false);
      }}
    />
  );
}

/* ─────────────────────────── Main dashboard ─────────────────────────── */

function Dashboard({
  theme,
  onToggleTheme,
  onLogout,
  onUnauthorized,
}: {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onLogout: () => void;
  onUnauthorized: () => void;
}) {
  const [log, setLog] = useState<VisitorRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<{ url: string; name: string } | null>(null);
  const [tab, setTab] = useState<AdminTab>("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [consentRequired, setConsentRequired] = useState(true);
  const [chapterOverrides, setChapterOverrides] = useState<{ id: string; title?: string; caption?: string }[]>([]);
  const [analyticsCount, setAnalyticsCount] = useState(0);
  const { session, online, synced } = useSharedSession();
  const prevSessionStateRef = useRef(session.state);

  const loadDashboard = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    const result = await fetchAdminDashboard();
    if (!silent) setRefreshing(false);
    setLoading(false);

    if (result.ok) {
      setLog(result.data.visitors);
      setMaintenanceMode(result.data.maintenanceMode);
      setConsentRequired(result.data.consentRequired);
      setChapterOverrides(result.data.chapterOverrides);
      setAnalyticsCount(result.data.stats.eventCount);
      return;
    }
    if (result.unauthorized) {
      onUnauthorized();
      return;
    }
    toast.error("Could not load dashboard data");
  }, [onUnauthorized]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const interval = tab === "live" ? 2_000 : tab === "overview" ? 5_000 : 10_000;
    const id = setInterval(() => void loadDashboard(true), interval);
    return () => clearInterval(id);
  }, [tab, loadDashboard]);

  useEffect(() => {
    if (session.state === "completed" && prevSessionStateRef.current !== "completed") {
      void loadDashboard(true);
      toast.success("New visitor recorded");
    }
    prevSessionStateRef.current = session.state;
  }, [session.state, loadDashboard]);

  const filtered = log.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.date.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const todayCount = log.filter((r) => r.date === today).length;
  const totalCount = log.length;
  const avgDuration = log.length
    ? Math.round(log.reduce((s, r) => s + r.duration, 0) / log.length)
    : 0;
  const namedCount = log.filter((r) => r.name).length;
  const photoCount = log.filter((r) => r.photo).length;

  const handleClear = async () => {
    if (!confirm("Clear all visitor records? This cannot be undone.")) return;
    const result = await clearVisitorLogRemote();
    if (result.ok) {
      setLog([]);
      toast.success("Visitor log cleared");
      return;
    }
    if (result.unauthorized) {
      onUnauthorized();
      return;
    }
    toast.error("Could not clear visitor log");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this visitor record?")) return;
    const result = await deleteVisitorRecord(id);
    if (result.ok) {
      setLog((prev) => prev.filter((r) => r.id !== id));
      toast.success("Visitor record deleted");
      return;
    }
    if (result.unauthorized) {
      onUnauthorized();
      return;
    }
    toast.error("Could not delete visitor record");
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-display">
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary font-mono text-[10px] font-bold tracking-tighter text-primary-foreground">
              SPX
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">Admin Dashboard</p>
              <p className="hidden font-mono text-[9px] uppercase tracking-widest text-muted-foreground sm:block">
                Visitor log & live control
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            <button
              onClick={() => void loadDashboard()}
              disabled={refreshing}
              className="hidden rounded border border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground disabled:opacity-50 sm:inline-block"
            >
              {refreshing ? "…" : "Refresh"}
            </button>
            <a
              href="/"
              className="hidden font-mono text-[9px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground sm:inline"
            >
              Wall
            </a>
            <button
              onClick={onLogout}
              className="rounded border border-border px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/40 hover:bg-accent hover:text-foreground"
            >
              Logout
            </button>
          </div>
        </div>

        <nav className="border-t border-border px-4 py-2 lg:hidden">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto pb-1 no-scrollbar">
            {ADMIN_TABS.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-widest transition-colors ${
                  tab === item.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30 hover:bg-accent"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-8 pt-28 md:px-8 lg:pt-24">
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="hidden space-y-4 rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-24 lg:block">
            <div>
              <span className="mb-2 block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Navigation
              </span>
              <div className="space-y-1.5">
                {ADMIN_TABS.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      tab === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/60 text-foreground hover:border-primary/30 hover:bg-accent"
                    }`}
                  >
                    <span className="block font-mono text-[9px] uppercase tracking-widest">
                      {item.label}
                    </span>
                    <span className={`mt-1 block text-xs ${tab === item.id ? "text-primary/90" : "text-muted-foreground"}`}>
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-4">
              <span className="block font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                Quick links
              </span>
              <a
                href="/"
                className="block rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-foreground"
              >
                Wall display
              </a>
              <a
                href="/phone"
                className="block rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-foreground"
              >
                Phone route
              </a>
            </div>
          </aside>

          <section className="min-w-0 space-y-6">
            {/* ── Overview tab ── */}
            {tab === "overview" && (
              <div className="space-y-6 animate-entrance">
            <LiveSessionBanner session={session} online={online} synced={synced} onGoLive={() => setTab("live")} />

            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { label: "Total Visitors", value: totalCount, sub: "all time" },
                { label: "Today", value: todayCount, sub: today },
                { label: "Avg Duration", value: `${avgDuration}s`, sub: "scan → complete" },
                  { label: "Named Visitors", value: namedCount, sub: `${totalCount ? Math.round((namedCount / totalCount) * 100) : 0}% provided name` },
                  { label: "Photos Captured", value: photoCount, sub: `${totalCount ? Math.round((photoCount / totalCount) * 100) : 0}% with souvenir` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-4 space-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">{s.label}</span>
                  <span className="text-3xl font-black tracking-tight text-foreground">{s.value}</span>
                  <span className="font-mono text-[9px] text-muted-foreground block">{s.sub}</span>
                </div>
              ))}
            </div>

            {/* Visits by day — last 7 days */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block mb-4">Visits — last 7 days</span>
              <BarChart log={log} />
            </div>

            {/* Recent 5 visitors */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block mb-4">Recent visitors</span>
              {loading ? (
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">Loading…</p>
              ) : (
                <VisitorTable
                  records={log.slice(0, 5)}
                  onPhotoClick={(url, name) => setSelectedPhoto({ url, name })}
                />
              )}
            </div>
              </div>
            )}

            {/* ── Visitors tab ── */}
            {tab === "visitors" && (
              <div className="space-y-4 animate-entrance">
            <div className="flex items-center gap-3 flex-wrap">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or date…"
                className="flex-1 min-w-[200px] bg-surface border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
              />
              <button
                onClick={() => exportLogAsCSV(filtered)}
                className="px-4 py-2 bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest rounded-lg hover:brightness-110 transition-all"
              >
                Export CSV
              </button>
              <button
                onClick={() => void loadDashboard()}
                className="px-4 py-2 border border-border text-foreground font-mono text-[10px] uppercase tracking-widest rounded-lg hover:border-primary/40 hover:bg-accent transition-all"
              >
                Refresh
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-2 border border-destructive/40 text-destructive font-mono text-[10px] uppercase tracking-widest rounded-lg hover:bg-destructive/10 transition-all"
              >
                Clear log
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-12 text-center">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {log.length === 0 ? "No visitors recorded yet" : "No results match your search"}
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <VisitorTable
                  records={filtered}
                  onPhotoClick={(url, name) => setSelectedPhoto({ url, name })}
                  onDelete={handleDelete}
                />
              </div>
            )}
              </div>
            )}

            {/* ── Live tab ── */}
            {tab === "live" && (
              <div className="space-y-4 animate-entrance">
                <LiveMonitor session={session} online={online} synced={synced} />
              </div>
            )}

            {tab === "operations" && (
              <OperationsPanel
                maintenanceMode={maintenanceMode}
                consentRequired={consentRequired}
                chapterOverrides={chapterOverrides}
                analyticsCount={analyticsCount}
                onUnauthorized={onUnauthorized}
                onChanged={() => void loadDashboard(true)}
              />
            )}
          </section>
        </div>
      </main>

      {/* Photo lightbox */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="relative max-w-sm w-full animate-entrance" onClick={(e) => e.stopPropagation()}>
            <img src={selectedPhoto.url} alt="Visitor photo" className="w-full rounded-2xl ring-1 ring-border" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={() => downloadVisitorPhoto(selectedPhoto.url, selectedPhoto.name)}
                className="size-8 rounded-full bg-black/60 text-white flex items-center justify-center text-xs font-mono uppercase"
                title="Download"
              >
                ↓
              </button>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="size-8 rounded-full bg-black/60 text-white flex items-center justify-center text-lg"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Visitor table ─────────────────────────── */

function VisitorTable({
  records,
  onPhotoClick,
  onDelete,
}: {
  records: VisitorRecord[];
  onPhotoClick: (url: string, name: string) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Photo", "Name", "Date", "Time", "Duration", "Chapters", ...(onDelete ? ["Actions"] : [])].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border/50 hover:bg-accent transition-colors">
              <td className="px-4 py-3">
                {r.photo ? (
                  <button onClick={() => onPhotoClick(r.photo!, r.name)} className="hover:opacity-80 transition-opacity">
                    <img src={r.photo} alt={r.name} className="size-9 rounded-full object-cover ring-1 ring-primary/30" />
                  </button>
                ) : (
                  <div className="size-9 rounded-full bg-surface border border-border flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground font-mono">—</span>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {r.name || <span className="text-muted-foreground italic text-xs">Anonymous</span>}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.date}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">{r.time}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-primary">{r.duration}s</td>
              <td className="px-4 py-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: CHAPTERS.length }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-4 rounded-full ${i < r.completedChapters ? "bg-primary" : "bg-muted"}`}
                    />
                  ))}
                </div>
              </td>
              {onDelete && (
                <td className="px-4 py-3">
                  <button
                    onClick={() => void onDelete(r.id)}
                    className="font-mono text-[9px] uppercase tracking-widest text-destructive hover:text-destructive/80 transition-colors"
                  >
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── Bar chart ─────────────────────────── */

function BarChart({ log }: { log: VisitorRecord[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return {
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    };
  });

  const counts = days.map((d) => log.filter((r) => r.date === d.date).length);
  const max = Math.max(...counts, 1);

  return (
    <div className="flex items-end gap-2 h-28">
      {days.map((d, i) => (
        <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
          <span className="font-mono text-[9px] text-primary">{counts[i] > 0 ? counts[i] : ""}</span>
          <div className="w-full rounded-t-sm bg-muted/60 relative overflow-hidden" style={{ height: "80px" }}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm transition-all duration-700"
              style={{ height: `${(counts[i] / max) * 100}%` }}
            />
          </div>
          <span className="font-mono text-[9px] text-muted-foreground">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Live session banner ─────────────────────────── */

function LiveSessionBanner({
  session,
  online,
  synced,
  onGoLive,
}: {
  session: SharedSession;
  online: boolean;
  synced: boolean;
  onGoLive: () => void;
}) {
  const isActive = session.state !== "idle" && session.state !== "completed";
  const stateColor: Record<string, string> = {
    idle: "bg-muted",
    scanned: "bg-blue-400",
    camera_ready: "bg-yellow-400",
    countdown: "bg-yellow-400 animate-pulse",
    capturing: "bg-orange-400",
    processing: "bg-orange-400 animate-pulse",
    rendering: "bg-orange-400 animate-pulse",
    playing: "bg-green-400 animate-pulse",
    completed: "bg-primary",
    error: "bg-destructive",
  };

  return (
    <div className="rounded-xl border border-border bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`size-3 rounded-full shrink-0 ${stateColor[session.state] ?? "bg-muted"}`} />
        <div className="min-w-0">
          <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
            Live session · {LIVE_STATE_LABELS[session.state]}
          </p>
          <p className="text-lg font-bold tracking-tight truncate">
            {isActive
              ? session.visitorName || "Visitor in progress"
              : session.state === "completed"
                ? "Last session completed"
                : "Waiting for next visitor"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className={`font-mono text-[9px] uppercase tracking-widest ${online && synced ? "text-primary" : "text-destructive"}`}>
          {online ? (synced ? "Synced" : "Sync issue") : "Offline"}
        </span>
        <button
          onClick={onGoLive}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
        >
          Open live control
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────── Live monitor ─────────────────────────── */

function LiveMonitor({
  session,
  online,
  synced,
}: {
  session: SharedSession;
  online: boolean;
  synced: boolean;
}) {
  const { state, visitorName, capturedImage, processedImage, chapterIndex } = session;
  const displayImage = processedImage ?? capturedImage;
  const [draftName, setDraftName] = useState(visitorName);
  const [draftChapter, setDraftChapter] = useState(chapterIndex);

  const stateColor: Record<string, string> = {
    idle: "bg-muted",
    scanned: "bg-blue-400",
    camera_ready: "bg-yellow-400",
    countdown: "bg-yellow-400 animate-pulse",
    capturing: "bg-orange-400",
    processing: "bg-orange-400 animate-pulse",
    rendering: "bg-orange-400 animate-pulse",
    playing: "bg-green-400 animate-pulse",
    completed: "bg-primary",
    error: "bg-destructive",
  };

  const STATES = [
    "idle", "scanned", "camera_ready", "countdown", "capturing", "processing", "rendering", "playing", "completed", "error",
  ] as const;

  const applyUpdate = async (patch: Partial<SharedSession>, label: string) => {
    const result = await adminPatchSession(patch);
    if (result.session) {
      toast.success(label);
      return;
    }
    toast.error(result.error ?? "Could not update session");
  };

  const applyReset = async () => {
    const result = await adminResetSession();
    if (result.session) {
      toast.success("Session reset to idle");
      return;
    }
    toast.error("Could not reset session");
  };

  useEffect(() => {
    setDraftName(visitorName);
  }, [visitorName]);

  useEffect(() => {
    setDraftChapter(chapterIndex);
  }, [chapterIndex]);

  const quickActions = [
    {
      label: "Ready for next visitor",
      desc: "Return to idle and clear the current session",
      action: () => void applyReset(),
    },
    {
      label: "Open phone step",
      desc: "Send the flow back to the scanned handoff",
      action: () => applyUpdate({ state: "scanned", capturedImage: null, chapterIndex: 0 }, "Sent to phone step"),
    },
    {
      label: "Resume playback",
      desc: "Continue playback from the current chapter",
      action: () => applyUpdate({ state: "playing", chapterIndex: Math.min(chapterIndex, CHAPTERS.length - 1) }, "Playback resumed"),
    },
    {
      label: "Fail-safe pause",
      desc: "Force the system into the error state",
      action: () => applyUpdate({ state: "error" }, "Forced error state"),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Connection</span>
        <span className={`font-mono text-[10px] uppercase tracking-widest ${online && synced ? "text-primary" : "text-destructive"}`}>
          {online ? (synced ? "Online · synced" : "Online · sync issue") : "Offline"}
        </span>
      </div>

      {/* Live status card */}
      <div className="rounded-xl border border-border bg-surface p-5 flex items-start gap-5">
        {displayImage ? (
          <img src={displayImage} alt="Current visitor" className="size-16 rounded-full object-cover ring-2 ring-primary/40 shrink-0" />
        ) : (
          <div className="size-16 rounded-full bg-muted/60 border border-border flex items-center justify-center shrink-0">
            <span className="text-muted-foreground text-xs font-mono">—</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`size-2 rounded-full ${stateColor[state] ?? "bg-muted"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{state}</span>
          </div>
          <p className="text-lg font-bold tracking-tight truncate">
            {visitorName || <span className="text-muted-foreground italic text-sm font-normal">No name entered</span>}
          </p>
          {state === "playing" && (
            <p className="font-mono text-[10px] text-muted-foreground mt-1">
              Chapter {chapterIndex + 1} / {CHAPTERS.length}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Current mode: <span className="text-foreground">{LIVE_STATE_LABELS[state]}</span>
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block mb-3">Quick actions</span>
        <div className="grid gap-2 md:grid-cols-2">
          {quickActions.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="rounded-xl border border-border bg-background/40 px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-accent"
            >
              <span className="block font-mono text-[9px] uppercase tracking-widest text-primary">{item.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Manual state control */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block mb-3">Force state</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => applyUpdate({ state: s }, `State set to ${s}`)}
              className={`py-2 px-3 rounded-lg border font-mono text-[10px] uppercase tracking-wider transition-colors ${
                state === s
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => void applyReset()}
          className="mt-3 w-full py-2 bg-destructive/10 border border-destructive/30 text-destructive font-mono text-[10px] uppercase tracking-widest rounded-lg hover:bg-destructive/20 transition-all"
        >
          Reset session
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">Session controls</span>

        <div className="space-y-2">
          <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">Visitor name</label>
          <div className="flex gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.slice(0, 24))}
              placeholder="Edit current visitor name"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={() => applyUpdate({ visitorName: draftName }, "Visitor name updated")}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">Playback position</label>
          <div className="flex gap-2">
            <button
              onClick={() => applyUpdate({ state: "playing", chapterIndex: Math.max(0, chapterIndex - 1) }, "Previous chapter")}
              className="flex-1 rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground hover:border-primary/40 hover:bg-accent transition-colors"
            >
              Previous chapter
            </button>
            <button
              onClick={() => applyUpdate({ state: "playing", chapterIndex: Math.min(CHAPTERS.length - 1, chapterIndex + 1) }, "Next chapter")}
              className="flex-1 rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-foreground hover:border-primary/40 hover:bg-accent transition-colors"
            >
              Next chapter
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={CHAPTERS.length}
              value={draftChapter + 1}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (Number.isNaN(next)) return;
                setDraftChapter(Math.min(CHAPTERS.length - 1, Math.max(0, next - 1)));
              }}
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={() => applyUpdate({ state: "playing", chapterIndex: draftChapter }, `Jumped to chapter ${draftChapter + 1}`)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
            >
              Jump
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CHAPTERS.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => applyUpdate({ state: "playing", chapterIndex: index }, `Chapter ${index + 1}`)}
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                  chapterIndex === index && state === "playing"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:border-primary/40 hover:bg-accent"
                }`}
              >
                <span className="block font-mono text-[9px] uppercase tracking-widest">{chapter.id}</span>
                <span className="block text-xs mt-1 font-medium">{chapter.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => applyUpdate({ state: "scanned", capturedImage: null, chapterIndex: 0 }, "Restarted from phone")}
            className="py-2 rounded-lg border border-border text-foreground font-mono text-[10px] uppercase tracking-widest hover:border-primary/40 hover:bg-accent transition-colors"
          >
            Restart from phone
          </button>
          <button
            onClick={() => applyUpdate({ state: "playing", chapterIndex: 0 }, "Playback started")}
            className="py-2 rounded-lg border border-border text-foreground font-mono text-[10px] uppercase tracking-widest hover:border-primary/40 hover:bg-accent transition-colors"
          >
            Start playback
          </button>
          <button
            onClick={() => applyUpdate({ state: "completed" }, "Marked as completed")}
            className="py-2 rounded-lg border border-border text-foreground font-mono text-[10px] uppercase tracking-widest hover:border-primary/40 hover:bg-accent transition-colors"
          >
            Jump to complete
          </button>
        </div>
      </div>

      {/* Session data */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block mb-3">Session data</span>
        {[
          { label: "State", value: state },
          { label: "Visitor name", value: visitorName || "—" },
          { label: "Chapter", value: `${chapterIndex + 1} / ${CHAPTERS.length}` },
          { label: "Photo captured", value: capturedImage ? "Yes" : "No" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{row.label}</span>
            <span className="font-mono text-[11px] text-foreground">{row.value}</span>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">Session snapshot</span>
        <div className="rounded-xl border border-border bg-background/40 p-3 font-mono text-[11px] leading-5 text-foreground overflow-x-auto">
          <pre>{JSON.stringify(session, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

function OperationsPanel({
  maintenanceMode,
  consentRequired,
  chapterOverrides,
  analyticsCount,
  onUnauthorized,
  onChanged,
}: {
  maintenanceMode: boolean;
  consentRequired: boolean;
  chapterOverrides: { id: string; title?: string; caption?: string }[];
  analyticsCount: number;
  onUnauthorized: () => void;
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState(chapterOverrides);

  useEffect(() => {
    setDrafts(chapterOverrides);
  }, [chapterOverrides]);

  const toggleMaintenance = async () => {
    const result = await setMaintenanceModeRemote(!maintenanceMode);
    if (result.ok) {
      toast.success(result.data.maintenanceMode ? "Maintenance mode enabled" : "Maintenance mode disabled");
      onChanged();
      return;
    }
    if (result.unauthorized) onUnauthorized();
    else toast.error("Could not update maintenance mode");
  };

  const toggleConsent = async () => {
    const result = await setConsentRequiredRemote(!consentRequired);
    if (result.ok) {
      toast.success(result.data.consentRequired ? "Consent required" : "Consent optional");
      onChanged();
      return;
    }
    if (result.unauthorized) onUnauthorized();
    else toast.error("Could not update consent setting");
  };

  const saveChapters = async () => {
    const result = await updateChapterOverridesRemote(drafts);
    if (result.ok) {
      toast.success("Chapter copy updated");
      onChanged();
      return;
    }
    if (result.unauthorized) onUnauthorized();
    else toast.error("Could not save chapters");
  };

  const exportCrm = async () => {
    const result = await exportCrmRemote();
    if (result.ok) {
      toast.success(`Exported ${result.data.count} visitors to CRM webhook`);
      return;
    }
    if (result.unauthorized) onUnauthorized();
    else toast.error("CRM export failed — check CRM_WEBHOOK_URL");
  };

  return (
    <div className="space-y-4 animate-entrance">
      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">System controls</span>
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => void toggleMaintenance()}
            className={`rounded-xl border px-4 py-3 text-left ${maintenanceMode ? "border-destructive/40 bg-destructive/10" : "border-border"}`}
          >
            <span className="block font-mono text-[9px] uppercase tracking-widest">Maintenance mode</span>
            <span className="mt-1 block text-sm">{maintenanceMode ? "Enabled — wall offline" : "Disabled — normal operation"}</span>
          </button>
          <button
            onClick={() => void toggleConsent()}
            className="rounded-xl border border-border px-4 py-3 text-left"
          >
            <span className="block font-mono text-[9px] uppercase tracking-widest">Consent workflow</span>
            <span className="mt-1 block text-sm">{consentRequired ? "Required before camera" : "Optional"}</span>
          </button>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Analytics events logged</span>
          <span className="font-mono text-sm text-primary">{analyticsCount}</span>
        </div>
        <button
          onClick={() => void exportCrm()}
          className="w-full rounded-xl bg-primary py-3 font-mono text-[10px] uppercase tracking-widest text-primary-foreground hover:brightness-110"
        >
          Export visitors to CRM webhook
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground block">Chapter media CMS</span>
        {CHAPTERS.map((chapter) => {
          const draft = drafts.find((d) => d.id === chapter.id) ?? { id: chapter.id };
          return (
            <div key={chapter.id} className="grid gap-2 md:grid-cols-2 rounded-lg border border-border p-3">
              <div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-primary">Chapter {chapter.id}</span>
                <input
                  value={draft.title ?? chapter.title}
                  onChange={(e) =>
                    setDrafts((prev) => {
                      const next = prev.filter((d) => d.id !== chapter.id);
                      return [...next, { ...draft, id: chapter.id, title: e.target.value }];
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Caption</span>
                <input
                  value={draft.caption ?? chapter.caption}
                  onChange={(e) =>
                    setDrafts((prev) => {
                      const next = prev.filter((d) => d.id !== chapter.id);
                      return [...next, { ...draft, id: chapter.id, caption: e.target.value }];
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
          );
        })}
        <button
          onClick={() => void saveChapters()}
          className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-primary"
        >
          Save chapter copy
        </button>
      </div>
    </div>
  );
}
