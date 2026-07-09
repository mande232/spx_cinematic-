import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getVisitorLog, clearVisitorLog, exportLogAsCSV } from "@/lib/visitor-log";
import { useSharedSession, CHAPTERS } from "@/lib/experience-state";
import type { VisitorRecord } from "@/lib/visitor-log";
import type { SharedSession } from "@/lib/experience-state";

export const Route = createFileRoute("/admin")({ component: AdminDashboard });

const PIN = "1234"; // change before deployment

/* ─────────────────────────── Admin dashboard ─────────────────────────── */

function AdminDashboard() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  if (!authed) {
    return (
      <div className="min-h-screen bg-background text-foreground font-display dark flex items-center justify-center px-4">
        <div className="w-full max-w-xs space-y-5">
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
              if (e.key === "Enter") {
                if (pin === PIN) setAuthed(true);
                else { setPinError(true); setPin(""); }
              }
            }}
            placeholder="PIN"
            className={`w-full bg-surface border rounded-xl px-4 py-3 text-sm text-center tracking-[0.4em] focus:outline-none focus:border-primary/60 ${pinError ? "border-destructive" : "border-border"}`}
          />
          {pinError && <p className="text-xs text-destructive text-center">Incorrect PIN</p>}
          <button
            onClick={() => {
              if (pin === PIN) setAuthed(true);
              else { setPinError(true); setPin(""); }
            }}
            className="w-full py-3 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  return <Dashboard onLogout={() => setAuthed(false)} />;
}

/* ─────────────────────────── Main dashboard ─────────────────────────── */

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [log, setLog] = useState<VisitorRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "visitors" | "live">("overview");
  const { session, update } = useSharedSession();

  // Refresh log on storage events + every 10s fallback
  useEffect(() => {
    const load = () => setLog(getVisitorLog());
    load();
    const id = setInterval(load, 10_000);
    window.addEventListener("storage", load);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", load);
    };
  }, []);

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

  const handleClear = () => {
    if (confirm("Clear all visitor records? This cannot be undone.")) {
      clearVisitorLog();
      setLog([]);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground font-display dark">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b border-border bg-background/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="size-8 bg-primary rounded-sm flex items-center justify-center font-mono text-primary-foreground font-bold tracking-tighter">
            SPX
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted hidden sm:inline">
            Admin / Visitor Dashboard
          </span>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" className="font-mono text-[9px] uppercase tracking-widest text-muted hover:text-foreground transition-colors">
            Wall →
          </a>
          <button
            onClick={onLogout}
            className="px-3 py-1.5 rounded border border-border text-[9px] font-mono uppercase tracking-widest text-muted hover:text-foreground hover:border-white/30 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="pt-24 p-4 md:p-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-6 items-start">
          <aside className="rounded-2xl border border-border bg-surface p-4 space-y-4 lg:sticky lg:top-24">
            <div>
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-2">
                Admin navigation
              </span>
              <div className="space-y-1.5">
                {([
                  { id: "overview", label: "Overview", desc: "Stats & recent activity" },
                  { id: "visitors", label: "Visitors", desc: "Search, export, manage log" },
                  { id: "live", label: "Live Control", desc: "Control active experience" },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                      tab === item.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background/40 text-foreground hover:border-primary/30 hover:bg-white/5"
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

            <div className="border-t border-border pt-4 space-y-2">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted block">
                Quick links
              </span>
              <a
                href="/"
                className="block rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Wall display
              </a>
              <a
                href="/phone"
                className="block rounded-lg border border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted hover:text-foreground hover:border-primary/30 transition-colors"
              >
                Phone route
              </a>
            </div>
          </aside>

          <section className="space-y-6">
            {/* ── Overview tab ── */}
            {tab === "overview" && (
              <div className="space-y-6 animate-entrance">
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Visitors", value: totalCount, sub: "all time" },
                { label: "Today", value: todayCount, sub: today },
                { label: "Avg Duration", value: `${avgDuration}s`, sub: "scan → complete" },
                { label: "Named Visitors", value: namedCount, sub: `${totalCount ? Math.round((namedCount / totalCount) * 100) : 0}% provided name` },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-surface p-4 space-y-1">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted block">{s.label}</span>
                  <span className="text-3xl font-black tracking-tight text-foreground">{s.value}</span>
                  <span className="font-mono text-[9px] text-muted block">{s.sub}</span>
                </div>
              ))}
            </div>

            {/* Visits by day — last 7 days */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-4">Visits — last 7 days</span>
              <BarChart log={log} />
            </div>

            {/* Recent 5 visitors */}
            <div className="rounded-xl border border-border bg-surface p-5">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-4">Recent visitors</span>
              <VisitorTable
                records={log.slice(0, 5)}
                onPhotoClick={setSelectedPhoto}
              />
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
                onClick={handleClear}
                className="px-4 py-2 border border-destructive/40 text-destructive font-mono text-[10px] uppercase tracking-widest rounded-lg hover:bg-destructive/10 transition-all"
              >
                Clear log
              </button>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-xl border border-border bg-surface p-12 text-center">
                <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                  {log.length === 0 ? "No visitors recorded yet" : "No results match your search"}
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface overflow-hidden">
                <VisitorTable records={filtered} onPhotoClick={setSelectedPhoto} />
              </div>
            )}
              </div>
            )}

            {/* ── Live tab ── */}
            {tab === "live" && (
              <div className="space-y-4 animate-entrance">
                <LiveMonitor session={session} update={update} />
              </div>
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
            <img src={selectedPhoto} alt="Visitor photo" className="w-full rounded-2xl ring-1 ring-white/10" />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 size-8 rounded-full bg-black/60 text-white flex items-center justify-center text-lg"
            >
              ×
            </button>
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
}: {
  records: VisitorRecord[];
  onPhotoClick: (photo: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Photo", "Name", "Date", "Time", "Duration", "Chapters"].map((h) => (
              <th key={h} className="px-4 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-border/50 hover:bg-white/5 transition-colors">
              <td className="px-4 py-3">
                {r.photo ? (
                  <button onClick={() => onPhotoClick(r.photo!)} className="hover:opacity-80 transition-opacity">
                    <img src={r.photo} alt={r.name} className="size-9 rounded-full object-cover ring-1 ring-primary/30" />
                  </button>
                ) : (
                  <div className="size-9 rounded-full bg-surface border border-border flex items-center justify-center">
                    <span className="text-[10px] text-muted font-mono">—</span>
                  </div>
                )}
              </td>
              <td className="px-4 py-3 font-medium text-foreground">
                {r.name || <span className="text-muted italic text-xs">Anonymous</span>}
              </td>
              <td className="px-4 py-3 font-mono text-[11px] text-muted">{r.date}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-muted">{r.time}</td>
              <td className="px-4 py-3 font-mono text-[11px] text-primary">{r.duration}s</td>
              <td className="px-4 py-3">
                <div className="flex gap-0.5">
                  {Array.from({ length: CHAPTERS.length }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 w-4 rounded-full ${i < r.completedChapters ? "bg-primary" : "bg-white/10"}`}
                    />
                  ))}
                </div>
              </td>
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
          <div className="w-full rounded-t-sm bg-white/5 relative overflow-hidden" style={{ height: "80px" }}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-primary rounded-t-sm transition-all duration-700"
              style={{ height: `${(counts[i] / max) * 100}%` }}
            />
          </div>
          <span className="font-mono text-[9px] text-muted">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Live monitor ─────────────────────────── */

function LiveMonitor({
  session,
  update,
}: {
  session: SharedSession;
  update: (patch: Partial<SharedSession>) => void;
}) {
  const { state, visitorName, capturedImage, chapterIndex } = session;
  const [draftName, setDraftName] = useState(visitorName);

  const stateColor: Record<string, string> = {
    idle: "bg-white/20",
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
    "idle", "scanned", "camera_ready", "processing", "rendering", "playing", "completed", "error",
  ] as const;

  useEffect(() => {
    setDraftName(visitorName);
  }, [visitorName]);

  return (
    <div className="space-y-4">
      {/* Live status card */}
      <div className="rounded-xl border border-border bg-surface p-5 flex items-start gap-5">
        {capturedImage ? (
          <img src={capturedImage} alt="Current visitor" className="size-16 rounded-full object-cover ring-2 ring-primary/40 shrink-0" />
        ) : (
          <div className="size-16 rounded-full bg-white/5 border border-border flex items-center justify-center shrink-0">
            <span className="text-muted text-xs font-mono">—</span>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className={`size-2 rounded-full ${stateColor[state] ?? "bg-white/20"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{state}</span>
          </div>
          <p className="text-lg font-bold tracking-tight truncate">
            {visitorName || <span className="text-muted italic text-sm font-normal">No name entered</span>}
          </p>
          {state === "playing" && (
            <p className="font-mono text-[10px] text-muted mt-1">
              Chapter {chapterIndex + 1} / {CHAPTERS.length}
            </p>
          )}
        </div>
      </div>

      {/* Manual state control */}
      <div className="rounded-xl border border-border bg-surface p-5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-3">Force state</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {STATES.map((s) => (
            <button
              key={s}
              onClick={() => update({ state: s })}
              className={`py-2 px-3 rounded-lg border font-mono text-[10px] uppercase tracking-wider transition-colors ${
                state === s
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border text-muted hover:text-foreground hover:border-white/30"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => update({ state: "idle", capturedImage: null, visitorName: "", chapterIndex: 0 })}
          className="mt-3 w-full py-2 bg-destructive/10 border border-destructive/30 text-destructive font-mono text-[10px] uppercase tracking-widest rounded-lg hover:bg-destructive/20 transition-all"
        >
          Reset session
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted block">Session controls</span>

        <div className="space-y-2">
          <label className="font-mono text-[9px] uppercase tracking-widest text-muted block">Visitor name</label>
          <div className="flex gap-2">
            <input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value.slice(0, 24))}
              placeholder="Edit current visitor name"
              className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary/60"
            />
            <button
              onClick={() => update({ visitorName: draftName })}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-mono text-[10px] uppercase tracking-widest hover:brightness-110 transition-all"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="font-mono text-[9px] uppercase tracking-widest text-muted block">Playback position</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CHAPTERS.map((chapter, index) => (
              <button
                key={chapter.id}
                onClick={() => update({ state: "playing", chapterIndex: index })}
                className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                  chapterIndex === index && state === "playing"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-foreground hover:border-primary/40 hover:bg-white/5"
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
            onClick={() => update({ state: "scanned", capturedImage: null, chapterIndex: 0 })}
            className="py-2 rounded-lg border border-border text-foreground font-mono text-[10px] uppercase tracking-widest hover:border-primary/40 hover:bg-white/5 transition-colors"
          >
            Restart from phone
          </button>
          <button
            onClick={() => update({ state: "playing", chapterIndex: 0 })}
            className="py-2 rounded-lg border border-border text-foreground font-mono text-[10px] uppercase tracking-widest hover:border-primary/40 hover:bg-white/5 transition-colors"
          >
            Start playback
          </button>
          <button
            onClick={() => update({ state: "completed" })}
            className="py-2 rounded-lg border border-border text-foreground font-mono text-[10px] uppercase tracking-widest hover:border-primary/40 hover:bg-white/5 transition-colors"
          >
            Jump to complete
          </button>
        </div>
      </div>

      {/* Session data */}
      <div className="rounded-xl border border-border bg-surface p-5 space-y-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-3">Session data</span>
        {[
          { label: "State", value: state },
          { label: "Visitor name", value: visitorName || "—" },
          { label: "Chapter", value: `${chapterIndex + 1} / ${CHAPTERS.length}` },
          { label: "Photo captured", value: capturedImage ? "Yes" : "No" },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{row.label}</span>
            <span className="font-mono text-[11px] text-foreground">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
