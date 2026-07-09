import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { CHAPTERS, STATE_LABELS, useSharedSession } from "@/lib/experience-state";
import type { Chapter, ExperienceState } from "@/lib/experience-state";

export const Route = createFileRoute("/")({ component: WallView });

const SESSION_TIMEOUT_MS = 90_000;
const COMPLETED_RESET_MS = 30_000;
const AUDIO_URL =
  "https://res.cloudinary.com/djwboszae/video/upload/v1783506840/ElevenLabs_2026-07-08T10_28_27_Caty_-_Droll_Wry_and_Dry_pvc_s50_m2_rl2hy4.mp3";

function WallView() {
  const { session, update } = useSharedSession();
  const { state, capturedImage, visitorName, chapterIndex } = session;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [phoneUrl, setPhoneUrl] = useState("/phone");
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    if (typeof window === "undefined") return;
    setPhoneUrl(`${window.location.origin}/phone`);

    const savedTheme = window.localStorage.getItem("spx-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("spx-theme", theme);
    }
  }, [theme]);

  useEffect(() => {
    if (state !== "playing") return;

    const id = setInterval(() => {
      const current = Number(localStorage.getItem("spx-exp-chapter") ?? 0);
      const next = current + 1;
      if (next >= CHAPTERS.length) {
        clearInterval(id);
        setTimeout(() => update({ state: "completed" }), 800);
      } else {
        update({ chapterIndex: next });
      }
    }, 3200);

    return () => clearInterval(id);
  }, [state, update]);

  useEffect(() => {
    if (state === "playing") {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => undefined);
      }
    } else {
      audioRef.current?.pause();
    }
  }, [state]);

  const resetSession = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    update({ state: "idle", capturedImage: null, visitorName: "", chapterIndex: 0 });
  }, [update]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const stuckStates: ExperienceState[] = [
      "scanned",
      "camera_ready",
      "countdown",
      "capturing",
      "processing",
      "rendering",
      "error",
    ];

    if (stuckStates.includes(state)) {
      timeoutRef.current = setTimeout(resetSession, SESSION_TIMEOUT_MS);
    }

    if (state === "completed") {
      timeoutRef.current = setTimeout(resetSession, COMPLETED_RESET_MS);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetSession, state]);

  const activeChapter = CHAPTERS[Math.min(chapterIndex, CHAPTERS.length - 1)];
  const meta = STATE_LABELS[state];

  return (
    <div className="min-h-screen bg-background text-foreground font-display selection:bg-primary/30">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex items-center gap-4 text-foreground">
          <div className="size-8 bg-primary rounded-sm flex items-center justify-center font-mono text-primary-foreground font-bold tracking-tighter">
            SPX
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/75 hidden sm:inline dark:text-muted">
            Innovation Center / LED Wall
          </span>
        </div>

        <div className="flex items-center gap-2 md:gap-4 text-[10px] font-mono uppercase tracking-widest text-foreground/70 dark:text-muted">
          <button
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            className="rounded-full border border-border bg-background/95 px-3 py-1.5 text-[9px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <span className={state === "idle" ? "opacity-50 text-foreground/55 dark:text-muted" : "text-primary/90"}>
            {meta.step} · {meta.label}
          </span>
          <span className="hidden md:inline text-foreground/65 dark:text-muted">Addis Ababa · ET</span>
          {state !== "idle" && (
            <button
              onClick={resetSession}
              className="px-2 py-1 rounded border border-white/10 text-[9px] text-muted hover:text-foreground hover:border-white/30 transition-colors"
            >
              Reset
            </button>
          )}
          <a
            href="/admin"
            className="px-2 py-1 rounded border border-white/10 text-[9px] text-muted hover:text-foreground hover:border-white/30 transition-colors"
          >
            Admin
          </a>
        </div>
      </header>

      <main className="pt-28 md:pt-32 p-4 md:p-8 space-y-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Primary LED Surface [2.35:1]
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{meta.hint}</span>
        </div>

        <LedWall
          state={state}
          chapter={activeChapter}
          chapterIndex={chapterIndex}
          capturedImage={capturedImage}
          visitorName={visitorName}
          phoneUrl={phoneUrl}
          onScan={() => update({ state: "scanned" })}
        />

        <nav className="pt-6 flex justify-between border-t border-border">
          <div className="flex gap-6 md:gap-8 overflow-x-auto pb-4 no-scrollbar">
            {[
              { step: "01", label: "Idle", hint: "Ambient loop" },
              { step: "02", label: "Scan", hint: "Entry flow" },
              { step: "03", label: "Capture", hint: "Live preview" },
              { step: "04", label: "Compose", hint: "AI segments" },
              { step: "05", label: "Playback", hint: "Chapter reel" },
              { step: "06", label: "Finale", hint: "Souvenir" },
            ].map((item) => {
              const isActive = item.step === meta.step;
              return (
                <div key={item.step} className="flex flex-col gap-2 min-w-28">
                  <span className={`font-mono text-[9px] uppercase tracking-widest ${isActive ? "text-primary" : "text-muted"}`}>
                    {item.step} / {item.label}
                  </span>
                  <div className={`h-[2px] w-full ${isActive ? "bg-primary" : "bg-white/10"}`} />
                  <span className={`text-xs font-medium uppercase tracking-wider ${isActive ? "text-foreground" : "opacity-40"}`}>
                    {item.hint}
                  </span>
                </div>
              );
            })}
          </div>

          {state === "playing" && (
            <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
              <span className="font-mono text-[9px] uppercase tracking-widest text-muted">Chapter progress</span>
              <span className="font-mono text-xs text-primary">
                {String(chapterIndex + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}
              </span>
            </div>
          )}
        </nav>
      </main>

      <footer className="hidden lg:flex fixed bottom-0 left-0 right-0 p-6 items-end justify-between pointer-events-none">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${state === "error" ? "bg-destructive" : "bg-green-500"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/70 dark:text-muted">
              {state === "error" ? "System halted" : "System nominal"}
            </span>
          </div>
          <div className="text-[10px] font-mono text-foreground/55 dark:text-muted/60">
            LATENCY 12ms · BUFFER 4K_RAW · LED SYNC OK
          </div>
        </div>
        <div className="text-right">
          <span className="block text-4xl font-black italic text-foreground/10 dark:text-white/10 leading-none tracking-tighter uppercase">
            Future / Forward
          </span>
        </div>
      </footer>

      <audio ref={audioRef} src={AUDIO_URL} preload="auto" />
    </div>
  );
}

function LedWall({
  state,
  chapter,
  chapterIndex,
  capturedImage,
  visitorName,
  phoneUrl,
  onScan,
}: {
  state: ExperienceState;
  chapter: Chapter;
  chapterIndex: number;
  capturedImage: string | null;
  visitorName: string;
  phoneUrl: string;
  onScan: () => void;
}) {
  return (
    <div className="relative aspect-[21/9] overflow-hidden rounded-sm bg-surface ring-1 ring-black/10 dark:ring-white/10">
      <div
        key={chapter.id + state}
        className="absolute inset-0 animate-kenburns"
        style={{
          backgroundImage: `url(${chapter.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: state === "idle" || state === "scanned" ? "grayscale(0.6) brightness(0.5)" : "brightness(0.65)",
          transition: "filter 1.2s var(--ease-cinematic)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-background/55 dark:from-background dark:via-background/20 dark:to-background/60" />
      <div className="absolute top-0 inset-x-0 z-30 h-6 border-b border-black/8 bg-white/45 backdrop-blur-sm dark:border-white/5 dark:bg-black/60 md:h-8" />
      <div className="absolute bottom-0 inset-x-0 z-30 h-6 border-t border-black/8 bg-white/45 backdrop-blur-sm dark:border-white/5 dark:bg-black/60 md:h-8" />
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="absolute inset-0 z-20 flex items-center justify-center px-6 md:px-12">
        {(state === "idle" || state === "scanned") && (
          <IdleLedContent onScan={onScan} scanned={state === "scanned"} phoneUrl={phoneUrl} />
        )}

        {(state === "camera_ready" || state === "countdown" || state === "capturing") && (
          <div className="text-center animate-entrance">
            <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.38em] text-primary/90 block mb-3">
              Composing you into the frame
            </span>
            <h1 className="text-3xl md:text-5xl font-extrabold tracking-[-0.04em] uppercase italic text-foreground">
              Hold still.
              <br />
              <span className="text-primary">The film is rolling.</span>
            </h1>
          </div>
        )}

        {(state === "processing" || state === "rendering") && (
          <ProcessingLedContent capturedImage={capturedImage} state={state} />
        )}
        {state === "playing" && <PlayingLedContent chapter={chapter} capturedImage={capturedImage} />}
        {state === "completed" && <CompletedLedContent visitorName={visitorName} />}
        {state === "error" && (
          <div className="text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-destructive block mb-3">
              System paused
            </span>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground">
              Awaiting the next visitor.
            </h1>
          </div>
        )}
      </div>

      {state === "playing" && (
        <div className="absolute bottom-10 left-6 md:left-12 z-30 flex items-end gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary/90">Chapter {chapter.id}</span>
          <span className="font-display text-base italic tracking-[-0.03em] text-foreground md:text-[1.6rem]">
            {chapter.title}
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-foreground/65 dark:text-muted md:inline">
            · {chapter.caption}
          </span>
        </div>
      )}

      <div className="absolute top-10 right-8 z-30 flex items-center gap-2">
        <div className={`size-1.5 rounded-full ${state === "idle" ? "bg-white/20" : "bg-primary animate-pulse"}`} />
        <span className="font-mono text-[8px] uppercase tracking-[0.24em] text-foreground/70 dark:text-muted">
          {state === "idle" ? "Standby" : "Live"}
        </span>
      </div>

      {state === "playing" && (
        <div className="absolute top-10 left-8 z-30 flex gap-1">
          {CHAPTERS.map((c, i) => (
            <div key={c.id} className={`h-[2px] w-6 transition-colors ${i <= chapterIndex ? "bg-primary" : "bg-white/15"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdleLedContent({
  onScan,
  scanned,
  phoneUrl,
}: {
  onScan: () => void;
  scanned: boolean;
  phoneUrl: string;
}) {
  return (
    <div className="w-full flex items-center justify-between gap-6 md:gap-10">
      <div className="max-w-lg animate-entrance">
        <span className="font-mono text-[8px] md:text-[9px] uppercase tracking-[0.32em] text-primary/90 block mb-3">
          Welcome to SPX
        </span>
        <h1 className="text-3xl md:text-[3.4rem] font-extrabold tracking-[-0.05em] uppercase italic leading-[0.96] text-foreground">
          Step into the
          <br />
          <span className="text-primary">SPX story.</span>
        </h1>
        <p className="mt-4 max-w-md text-pretty text-[12px] leading-5 text-foreground/72 dark:text-muted-foreground md:text-sm md:leading-6">
          Scan the code to open the separate phone experience, then watch the story unfold here on the wall.
        </p>
        <div className="mt-4 grid max-w-md grid-cols-3 gap-2">
          {["Scan", "Capture", "Watch"].map((label, i) => (
            <div key={label} className="rounded-xl border border-black/10 bg-white/35 px-3 py-2 text-center dark:border-white/10 dark:bg-black/20">
              <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-primary">{i + 1}</span>
              <span className="mt-1 block text-[11px] font-semibold text-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[220px] shrink-0 self-center">
        <div className={`rounded-2xl border p-3 md:p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.35)] backdrop-blur-md dark:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.75)] ${scanned ? "border-primary/30 bg-white/80 dark:bg-black/55" : "border-black/10 bg-white/72 dark:border-white/10 dark:bg-black/45"}`}>
          <div className="mb-3 text-center">
            <p className="font-mono text-[8px] uppercase tracking-[0.24em] text-primary">{scanned ? "Connected" : "Start here"}</p>
            <p className="mt-1 text-[11px] text-foreground/72 dark:text-white/75">
              {scanned ? "Phone route opened." : "Open /phone to begin."}
            </p>
          </div>
          <button onClick={onScan} className="w-full p-2.5 md:p-3 rounded-xl bg-white hover:scale-[1.02] transition-transform">
            <div className="aspect-square w-full">
              {scanned ? (
                <div className="flex h-full items-center justify-center rounded-lg border border-primary/30 bg-primary/10 dark:bg-black/20">
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-primary">Route active</span>
                </div>
              ) : (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(phoneUrl)}&bgcolor=ffffff&color=000000&margin=2`}
                  alt="Scan to open phone experience"
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          </button>
          <div className="mt-3 text-center">
            <span className="font-mono text-[8px] uppercase tracking-[0.18em] text-foreground/65 dark:text-white/65 md:text-[9px]">
              {scanned ? "Continue at /phone" : "Scan to begin"}
            </span>
          </div>
          <button
            onClick={onScan}
            className={`mt-3 w-full rounded-lg px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition ${scanned ? "bg-white/10 text-white/80" : "bg-primary text-primary-foreground hover:brightness-110"}`}
          >
            {scanned ? "Phone route live" : "Start experience"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProcessingLedContent({
  capturedImage,
  state,
}: {
  capturedImage: string | null;
  state: ExperienceState;
}) {
  return (
    <div className="text-center animate-entrance">
      <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.34em] text-primary/90 block mb-3">
        {state === "processing" ? "Isolating subject" : "Assembling film"}
      </span>
      <h1 className="text-3xl md:text-5xl font-extrabold tracking-[-0.04em] uppercase italic text-foreground">
        Generative
        <br />
        Experience
      </h1>
      <div className="mt-8 flex items-center justify-center gap-6">
        {capturedImage && (
          <div className="relative size-24 md:size-32 rounded-md overflow-hidden ring-1 ring-primary/40">
            <img src={capturedImage} alt="You" className="size-full object-cover" />
          </div>
        )}
        <div className="w-40 md:w-72 h-[3px] bg-white/10 overflow-hidden rounded-full">
          <div className="h-full bg-primary" style={{ width: state === "processing" ? "45%" : "88%", transition: "width 1.6s var(--ease-cinematic)" }} />
        </div>
      </div>
    </div>
  );
}

function PlayingLedContent({
  chapter,
  capturedImage,
}: {
  chapter: Chapter;
  capturedImage: string | null;
}) {
  return (
    <>
      {capturedImage && (
        <div className="absolute left-6 top-14 md:left-12 md:top-16 z-20 animate-entrance">
          <div className="size-14 md:size-16 overflow-hidden rounded-full border border-primary/50 bg-black/40 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <img src={capturedImage} alt="Visitor" className="size-full object-cover" />
          </div>
        </div>
      )}
      <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 z-20 text-right max-w-xs animate-entrance">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary/90 block mb-2">Chapter {chapter.id}</span>
        <h2 className="text-2xl md:text-[2.5rem] font-bold italic tracking-[-0.04em] text-foreground">{chapter.title}</h2>
        <p className="mt-2 text-xs md:text-sm text-foreground/70 dark:text-muted-foreground text-pretty leading-5">{chapter.caption}</p>
      </div>
    </>
  );
}

function CompletedLedContent({ visitorName }: { visitorName: string }) {
  return (
    <div className="text-center animate-entrance">
      <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.34em] text-primary/90 block mb-4">The film is yours</span>
      <h1 className="text-4xl md:text-6xl font-extrabold tracking-[-0.05em] uppercase italic leading-none text-foreground">
        Welcome
        {visitorName ? (
          <>
            ,
            <br />
            <span className="text-primary">{visitorName}.</span>
          </>
        ) : (
          <>
            {" "}to
            <br />
            <span className="text-primary">SPX.</span>
          </>
        )}
      </h1>
      <p className="mt-5 text-sm text-foreground/70 dark:text-muted-foreground">A souvenir is waiting on your device.</p>
    </div>
  );
}