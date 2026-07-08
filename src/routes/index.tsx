import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import chapterCoffee from "@/assets/chapter-coffee.jpg";
import chapterAi from "@/assets/chapter-ai.jpg";
import chapterBiotech from "@/assets/chapter-biotech.jpg";
import chapterEnergy from "@/assets/chapter-energy.jpg";
import chapterLogistics from "@/assets/chapter-logistics.jpg";
import chapterFuture from "@/assets/chapter-future.jpg";

export const Route = createFileRoute("/")({
  component: ReceptionExperience,
});

type ExperienceState =
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

type Chapter = {
  id: string;
  title: string;
  caption: string;
  image: string;
};

const CHAPTERS: Chapter[] = [
  { id: "01", title: "The Harvest", caption: "Coffee plantations & exports", image: chapterCoffee },
  { id: "02", title: "Intelligence", caption: "AI & software platforms", image: chapterAi },
  { id: "03", title: "Living Sciences", caption: "Biotechnology laboratories", image: chapterBiotech },
  { id: "04", title: "Powering Africa", caption: "Renewable energy grid", image: chapterEnergy },
  { id: "05", title: "In Motion", caption: "Logistics & supply chains", image: chapterLogistics },
  { id: "06", title: "Future Forward", caption: "Pan-African horizons", image: chapterFuture },
];

const POST_EXPERIENCE_ACTIONS = [
  "Visit SPX Website",
  "Download Company Profile",
  "Explore Our Projects",
  "Connect With SPX",
] as const;

const STATE_LABELS: Record<ExperienceState, { step: string; label: string; hint: string }> = {
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

function ReceptionExperience() {
  const [state, setState] = useState<ExperienceState>("idle");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [visitorName, setVisitorName] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Stop camera when leaving camera states
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (typeof window === "undefined") return;

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

  // Camera bootstrap
  useEffect(() => {
    if (state !== "camera_ready" && state !== "countdown") return;
    if (streamRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (err) {
        console.error(err);
        setErrorMessage(
          "Camera access denied. Enable camera permission in your browser to continue."
        );
        setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  // Countdown loop
  useEffect(() => {
    if (state !== "countdown") return;
    setCountdown(3);
    let n = 3;
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
        // capture
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (video && canvas) {
          const w = video.videoWidth || 720;
          const h = video.videoHeight || 720;
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, w, h);
            setCapturedImage(canvas.toDataURL("image/jpeg", 0.9));
          }
        }
        stopCamera();
        setState("capturing");
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state, stopCamera]);

  // Simulated processing → rendering → playing
  useEffect(() => {
    if (state === "capturing") {
      const t = setTimeout(() => setState("processing"), 600);
      return () => clearTimeout(t);
    }
    if (state === "processing") {
      const t = setTimeout(() => setState("rendering"), 2400);
      return () => clearTimeout(t);
    }
    if (state === "rendering") {
      const t = setTimeout(() => {
        setChapterIndex(0);
        setState("playing");
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Chapter auto-advance during playback
  useEffect(() => {
    if (state !== "playing") return;
    const id = setInterval(() => {
      setChapterIndex((i) => {
        if (i >= CHAPTERS.length - 1) {
          clearInterval(id);
          setTimeout(() => setState("completed"), 800);
          return i;
        }
        return i + 1;
      });
    }, 3200);
    return () => clearInterval(id);
  }, [state]);

  const reset = useCallback(() => {
    stopCamera();
    setCapturedImage(null);
    setErrorMessage(null);
    setChapterIndex(0);
    setCountdown(3);
    setVisitorName("");
    setState("idle");
  }, [stopCamera]);

  // Simulate a QR scan from the LED wall
  const handleScan = useCallback(() => setState("scanned"), []);

  const activeChapter = CHAPTERS[Math.min(chapterIndex, CHAPTERS.length - 1)];
  const meta = STATE_LABELS[state];

  return (
    <div className="min-h-screen bg-background text-foreground font-display selection:bg-primary/30">
      <Header
        state={state}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <main className="pt-32 md:pt-36 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-5 md:gap-6 xl:gap-8">
        <section className="lg:col-span-9 space-y-4 md:space-y-5">
          <div className="space-y-2 px-1">
            <h1 className="text-3xl font-black tracking-tight text-balance md:text-5xl">
              Step into the SPX cinematic journey.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              Scan the QR code, take a portrait, and watch yourself appear on the LED wall.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
              Primary LED Surface [2.35:1]
            </h2>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
                {meta.step} · {meta.label}
              </span>
              <div className="size-1.5 bg-primary rounded-full animate-soft-pulse" />
            </div>
          </div>

          <LedWall
            state={state}
            chapter={activeChapter}
            chapterIndex={chapterIndex}
            capturedImage={capturedImage}
            visitorName={visitorName}
            onScan={handleScan}
          />

          <StateRibbon state={state} chapterIndex={chapterIndex} />
        </section>

        <section className="lg:col-span-3 flex flex-col items-center gap-3">
          <div className="w-full max-w-[280px] px-1">
            <p className="text-sm leading-6 text-muted-foreground">
              Use your phone to enter your name, allow camera access, and capture your portrait.
            </p>
          </div>

          <PhoneFrame>
            <MobileSurface
              state={state}
              visitorName={visitorName}
              setVisitorName={setVisitorName}
              countdown={countdown}
              capturedImage={capturedImage}
              errorMessage={errorMessage}
              videoRef={videoRef}
              onGrantCamera={() => setState("camera_ready")}
              onStartCountdown={() => setState("countdown")}
              onReset={reset}
              activeChapter={activeChapter}
            />
          </PhoneFrame>

          <AdminPanel state={state} setState={setState} reset={reset} />
        </section>
      </main>

      <FooterHUD state={state} />

      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

/* ─────────────────────────── Header ─────────────────────────── */

function Header({
  state,
  theme,
  onToggleTheme,
}: {
  state: ExperienceState;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  const session = useMemo(
    () => `${String(Math.floor(Math.random() * 9000) + 1000)}-X`,
    []
  );
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-4 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="size-8 bg-primary rounded-sm flex items-center justify-center font-mono text-primary-foreground font-bold tracking-tighter">
          SPX
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted hidden sm:inline">
          Innovation Center / Reception Experience
        </span>
      </div>
      <div className="flex items-center gap-2 md:gap-5 text-[10px] font-mono uppercase tracking-widest text-muted">
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-[9px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>
        <span className={state === "idle" ? "opacity-40" : "text-primary/80"}>
          Live Session: {session}
        </span>
        <span className="hidden md:inline">Addis Ababa · ET</span>
      </div>
    </header>
  );
}

/* ─────────────────────────── LED Wall ─────────────────────────── */

function LedWall({
  state,
  chapter,
  chapterIndex,
  capturedImage,
  visitorName,
  onScan,
}: {
  state: ExperienceState;
  chapter: Chapter;
  chapterIndex: number;
  capturedImage: string | null;
  visitorName: string;
  onScan: () => void;
}) {
  return (
    <div className="relative aspect-[21/9] bg-surface ring-1 ring-white/10 overflow-hidden rounded-sm">
      {/* Background chapter image with Ken Burns */}
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
      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-background/60" />
      {/* Letterbox bars */}
      <div className="absolute top-0 inset-x-0 h-6 md:h-8 bg-black/60 backdrop-blur-sm border-b border-white/5 z-30" />
      <div className="absolute bottom-0 inset-x-0 h-6 md:h-8 bg-black/60 backdrop-blur-sm border-t border-white/5 z-30" />

      {/* Grain overlay */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Content per state */}
      <div className="absolute inset-0 z-20 flex items-center justify-center px-6 md:px-12">
        {(state === "idle" || state === "scanned") && (
          <IdleLedContent onScan={onScan} scanned={state === "scanned"} />
        )}

        {(state === "camera_ready" || state === "countdown" || state === "capturing") && (
          <div className="text-center animate-entrance">
            <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.5em] text-primary block mb-3">
              Composing you into the frame
            </span>
            <h1 className="text-3xl md:text-6xl font-extrabold tracking-tighter uppercase italic">
              Hold still.
              <br />
              <span className="text-primary">The film is rolling.</span>
            </h1>
          </div>
        )}

        {(state === "processing" || state === "rendering") && (
          <ProcessingLedContent capturedImage={capturedImage} state={state} />
        )}

        {state === "playing" && (
          <PlayingLedContent chapter={chapter} capturedImage={capturedImage} />
        )}

        {state === "completed" && (
          <CompletedLedContent visitorName={visitorName} />
        )}

        {state === "error" && (
          <div className="text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-destructive block mb-3">
              System paused
            </span>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">
              Awaiting the next visitor.
            </h1>
          </div>
        )}
      </div>

      {/* Chapter marker overlay during playback */}
      {state === "playing" && (
        <div className="absolute bottom-10 left-6 md:left-12 z-30 flex items-end gap-3">
          <span className="font-mono text-[10px] text-primary uppercase tracking-[0.3em]">
            Chapter {chapter.id}
          </span>
          <span className="font-display text-lg md:text-2xl italic tracking-tight">
            {chapter.title}
          </span>
          <span className="font-mono text-[10px] text-muted uppercase tracking-widest hidden md:inline">
            · {chapter.caption}
          </span>
        </div>
      )}

      {/* Recording light */}
      <div className="absolute top-10 right-8 z-30 flex items-center gap-2">
        <div
          className={`size-1.5 rounded-full ${
            state === "idle" ? "bg-white/20" : "bg-primary animate-pulse"
          }`}
        />
        <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted">
          {state === "idle" ? "Standby" : "Live"}
        </span>
      </div>

      {/* Playback progress dots */}
      {state === "playing" && (
        <div className="absolute top-10 left-8 z-30 flex gap-1">
          {CHAPTERS.map((c, i) => (
            <div
              key={c.id}
              className={`h-[2px] w-6 transition-colors ${
                i <= chapterIndex ? "bg-primary" : "bg-white/15"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function IdleLedContent({ onScan, scanned }: { onScan: () => void; scanned: boolean }) {
  return (
    <div className="w-full flex items-center justify-between gap-6 md:gap-10">
      <div className="max-w-lg animate-entrance">
        <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.35em] text-primary block mb-3">
          Welcome to SPX
        </span>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tighter uppercase italic leading-[0.98]">
          Step into the
          <br />
          <span className="text-primary">SPX story.</span>
        </h1>
        <p className="mt-4 text-xs md:text-sm text-muted-foreground max-w-md text-pretty leading-5 md:leading-6">
          Scan the code, take a portrait, and see yourself featured in a cinematic journey across
          the SPX ecosystem.
        </p>

        <div className="mt-4 grid max-w-md grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
            <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-primary">1</span>
            <span className="mt-1 block text-xs font-medium">Scan</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
            <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-primary">2</span>
            <span className="mt-1 block text-xs font-medium">Capture</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-center">
            <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-primary">3</span>
            <span className="mt-1 block text-xs font-medium">Watch</span>
          </div>
        </div>
      </div>

      <div className="w-full max-w-[220px] shrink-0 self-center">
        <div className="rounded-2xl border border-white/10 bg-black/45 p-3 md:p-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.75)] backdrop-blur-md">
          <div className="mb-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary">Start here</p>
            <p className="mt-1 text-xs text-white/75">Scan the code to begin.</p>
          </div>
          <button
            onClick={onScan}
            className="group relative w-full p-2.5 md:p-3 bg-white rounded-xl hover:scale-[1.02] transition-transform"
          >
            <div className="aspect-square w-full">
              <QrGlyph />
            </div>
          </button>
          <div className="mt-3 text-center">
            <span className="font-mono text-[8px] md:text-[9px] uppercase tracking-[0.24em] text-white/65">
              {scanned ? "Session opened → continue on your phone" : "Scan to begin"}
            </span>
          </div>
          <button
            onClick={onScan}
            className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-foreground transition hover:brightness-110"
          >
            Start experience
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
      <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.5em] text-primary block mb-3">
        {state === "processing" ? "Isolating subject" : "Assembling film"}
      </span>
      <h1 className="text-3xl md:text-6xl font-extrabold tracking-tighter uppercase italic">
        Generative
        <br />
        Experience
      </h1>
      <div className="mt-8 flex items-center justify-center gap-6">
        {capturedImage && (
          <div className="relative size-24 md:size-32 rounded-md overflow-hidden ring-1 ring-primary/40">
            <img src={capturedImage} alt="You" className="size-full object-cover" />
            <div
              className="absolute inset-0 bg-gradient-to-b from-primary/20 via-transparent to-primary/20"
              style={{
                backgroundSize: "100% 200%",
                animation: "shimmer 1.6s linear infinite",
              }}
            />
          </div>
        )}
        <div className="w-40 md:w-72 h-[3px] bg-white/10 overflow-hidden rounded-full">
          <div
            className="h-full bg-primary"
            style={{
              width: state === "processing" ? "45%" : "88%",
              transition: "width 1.6s var(--ease-cinematic)",
            }}
          />
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
        <div key={chapter.id} className="absolute left-6 top-14 md:left-12 md:top-16 z-20 animate-entrance">
          <div className="size-14 md:size-16 overflow-hidden rounded-full border border-primary/50 bg-black/40 shadow-[0_10px_30px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <img src={capturedImage} alt="Visitor" className="size-full object-cover" />
          </div>
        </div>
      )}
      <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 z-20 text-right max-w-xs animate-entrance">
        <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-primary block mb-2">
          Chapter {chapter.id}
        </span>
        <h2 className="text-2xl md:text-4xl font-bold italic tracking-tight">
          {chapter.title}
        </h2>
        <p className="mt-2 text-xs md:text-sm text-muted-foreground text-pretty">
          {chapter.caption}
        </p>
      </div>
    </>
  );
}

function CompletedLedContent({ visitorName }: { visitorName: string }) {
  return (
    <div className="text-center animate-entrance">
      <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.5em] text-primary block mb-4">
        The film is yours
      </span>
      <h1 className="text-4xl md:text-7xl font-extrabold tracking-tighter uppercase italic leading-none">
        Welcome
        {visitorName ? (
          <>
            ,
            <br />
            <span className="text-primary">{visitorName}.</span>
          </>
        ) : (
          <>
            {" "}
            to
            <br />
            <span className="text-primary">SPX.</span>
          </>
        )}
      </h1>
      <p className="mt-6 text-sm text-muted-foreground">
        A souvenir is waiting on your device.
      </p>
    </div>
  );
}

function QrGlyph() {
  // Deterministic stylised QR made of 21×21 cells
  const cells = useMemo(() => {
    const grid: boolean[][] = [];
    for (let y = 0; y < 21; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < 21; x++) {
        // finder patterns
        const inFinder = (fx: number, fy: number) =>
          x >= fx && x < fx + 7 && y >= fy && y < fy + 7;
        if (inFinder(0, 0) || inFinder(14, 0) || inFinder(0, 14)) {
          const rel = inFinder(0, 0)
            ? [x, y]
            : inFinder(14, 0)
              ? [x - 14, y]
              : [x, y - 14];
          const [rx, ry] = rel;
          const border = rx === 0 || rx === 6 || ry === 0 || ry === 6;
          const inner = rx >= 2 && rx <= 4 && ry >= 2 && ry <= 4;
          row.push(border || inner);
        } else {
          // pseudo-random pattern seeded by coords
          row.push(((x * 73 + y * 179 + x * y * 13) % 7) < 3);
        }
      }
      grid.push(row);
    }
    return grid;
  }, []);

  return (
    <div className="grid size-full gap-[1px]" style={{ gridTemplateColumns: "repeat(21, 1fr)" }}>
      {cells.flat().map((on, i) => (
        <div key={i} className={on ? "bg-black" : "bg-transparent"} />
      ))}
    </div>
  );
}

/* ─────────────────────────── State ribbon ─────────────────────────── */

function StateRibbon({ state, chapterIndex }: { state: ExperienceState; chapterIndex: number }) {
  const active = STATE_LABELS[state].step;
  const steps: Array<{ step: string; label: string; hint: string }> = [
    { step: "01", label: "Idle", hint: "Ambient loop" },
    { step: "02", label: "Scan", hint: "Entry flow" },
    { step: "03", label: "Capture", hint: "Live preview" },
    { step: "04", label: "Compose", hint: "AI segments" },
    { step: "05", label: "Playback", hint: "Chapter reel" },
    { step: "06", label: "Finale", hint: "Souvenir" },
  ];
  return (
    <nav className="pt-6 flex justify-between border-t border-border">
      <div className="flex gap-6 md:gap-8 overflow-x-auto pb-4 no-scrollbar">
        {steps.map((s) => {
          const isActive = s.step === active;
          return (
            <div key={s.step} className="flex flex-col gap-2 min-w-28">
              <span
                className={`font-mono text-[9px] uppercase tracking-widest ${
                  isActive ? "text-primary" : "text-muted"
                }`}
              >
                {s.step} / {s.label}
              </span>
              <div className={`h-[2px] w-full ${isActive ? "bg-primary" : "bg-white/10"}`} />
              <span
                className={`text-xs font-medium uppercase tracking-wider ${
                  isActive ? "text-foreground" : "opacity-40"
                }`}
              >
                {s.hint}
              </span>
            </div>
          );
        })}
      </div>
      {state === "playing" && (
        <div className="hidden md:flex flex-col items-end gap-1 shrink-0">
          <span className="font-mono text-[9px] uppercase tracking-widest text-muted">
            Chapter progress
          </span>
          <span className="font-mono text-xs text-primary">
            {String(chapterIndex + 1).padStart(2, "0")} / {String(CHAPTERS.length).padStart(2, "0")}
          </span>
        </div>
      )}
    </nav>
  );
}

/* ─────────────────────────── Phone / Mobile ─────────────────────────── */

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[260px] min-h-[560px] bg-surface rounded-[32px] overflow-hidden relative shadow-[0_24px_48px_-24px_rgba(0,0,0,0.7)] ring-[7px] ring-neutral-900">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 h-5 w-28 bg-black rounded-full z-40" />
      {children}
    </div>
  );
}

function MobileSurface({
  state,
  visitorName,
  setVisitorName,
  countdown,
  capturedImage,
  errorMessage,
  videoRef,
  onGrantCamera,
  onStartCountdown,
  onReset,
  activeChapter,
}: {
  state: ExperienceState;
  visitorName: string;
  setVisitorName: (v: string) => void;
  countdown: number;
  capturedImage: string | null;
  errorMessage: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onGrantCamera: () => void;
  onStartCountdown: () => void;
  onReset: () => void;
  activeChapter: Chapter;
}) {
  const StepChip = ({ step, title }: { step: string; title: string }) => (
    <div className="mb-6">
      <span className="text-primary font-mono text-[10px] uppercase tracking-widest">
        {step}
      </span>
      <h3 className="text-xl font-bold tracking-tight text-balance leading-tight mt-1">
        {title}
      </h3>
    </div>
  );

  return (
    <div className="h-full w-full pt-8 p-4 flex flex-col overflow-y-auto no-scrollbar">
      <div className="h-4 mb-3 flex items-center justify-between px-2 text-[10px] font-mono text-muted-foreground">
        <span>9:41</span>
        <span>SPX · 5G</span>
      </div>

      {state === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-entrance">
          <div className="size-16 rounded-full border border-primary/30 flex items-center justify-center mb-6">
            <div className="size-3 bg-primary rounded-full animate-soft-pulse" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">Ready to begin</span>
          <h3 className="mt-3 text-xl font-bold tracking-tight">Scan the QR code on the wall</h3>
          <p className="mt-3 text-sm text-muted-foreground max-w-[26ch] leading-6">
            Open the experience on your phone to enter your name and take a quick portrait.
          </p>
          <div className="mt-6 w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-left">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                1
              </span>
              <p className="text-xs leading-5 text-muted-foreground">Scan the QR code shown on the LED wall.</p>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                2
              </span>
              <p className="text-xs leading-5 text-muted-foreground">Allow camera access and capture your portrait.</p>
            </div>
            <div className="mt-3 flex items-start gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                3
              </span>
              <p className="text-xs leading-5 text-muted-foreground">Watch your scene play on the big screen.</p>
            </div>
          </div>
        </div>
      )}

      {state === "scanned" && (
        <div className="flex-1 flex flex-col animate-entrance">
          <StepChip step="Step 01" title="Welcome. Let's compose your scene." />
          <div className="min-h-0 rounded-2xl bg-gradient-to-br from-primary/20 via-black to-black ring-1 ring-white/10 p-5 flex flex-col justify-end mb-5">
            <span className="font-mono text-[9px] uppercase tracking-widest text-primary mb-1">
              Optional
            </span>
            <label className="text-xs text-muted-foreground mb-2">
              What should we call you on screen?
            </label>
            <input
              value={visitorName}
              onChange={(e) => setVisitorName(e.target.value.slice(0, 24))}
              placeholder="Your first name"
              className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-primary/60"
            />
          </div>
          <button
            onClick={onGrantCamera}
            className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all active:scale-95"
          >
            Enable camera
          </button>
          <p className="mt-4 text-center text-[10px] text-muted font-mono leading-relaxed">
            We use your photo only for this playback. Nothing is stored.
          </p>
        </div>
      )}

      {(state === "camera_ready" || state === "countdown" || state === "capturing") && (
        <div className="flex-1 flex flex-col animate-entrance">
          <StepChip
            step={state === "countdown" ? "Hold still" : "Step 02"}
            title={state === "countdown" ? "Rolling in…" : "Position yourself in the light."}
          />
          <div className="relative min-h-[260px] rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5">
            <video
              ref={videoRef}
              className="absolute inset-0 size-full object-cover -scale-x-100"
              playsInline
              muted
            />
            {/* Framing corners */}
            <div className="absolute inset-4 pointer-events-none">
              <div className="absolute top-0 left-0 size-5 border-t-2 border-l-2 border-primary" />
              <div className="absolute top-0 right-0 size-5 border-t-2 border-r-2 border-primary" />
              <div className="absolute bottom-0 left-0 size-5 border-b-2 border-l-2 border-primary" />
              <div className="absolute bottom-0 right-0 size-5 border-b-2 border-r-2 border-primary" />
            </div>

            {state === "countdown" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
                <div className="size-28 rounded-full border border-primary/40 flex items-center justify-center">
                  <span
                    key={countdown}
                    className="text-6xl font-black italic tracking-tighter text-primary animate-entrance"
                  >
                    {countdown}
                  </span>
                </div>
              </div>
            )}
            {state === "capturing" && (
              <div className="absolute inset-0 bg-white animate-soft-pulse" />
            )}

            <div className="absolute bottom-3 left-0 right-0 flex justify-center">
              <div className="px-3 py-1.5 bg-black/60 backdrop-blur-lg rounded-full border border-white/10">
                <span className="text-[10px] font-mono text-muted-foreground tracking-widest">
                  {state === "camera_ready" ? "Auto-focus ready" : "Recording"}
                </span>
              </div>
            </div>
          </div>

          {state === "camera_ready" && (
            <button
              onClick={onStartCountdown}
              className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all active:scale-95"
            >
              Capture moment
            </button>
          )}
          {state !== "camera_ready" && (
            <div className="w-full py-4 bg-white/5 rounded-xl text-center">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
                Please stand by
              </span>
            </div>
          )}
        </div>
      )}

      {(state === "processing" || state === "rendering") && (
        <div className="flex-1 flex flex-col animate-entrance">
          <StepChip
            step={state === "processing" ? "Step 03" : "Step 04"}
            title={
              state === "processing"
                ? "Removing the background…"
                : "Assembling your cinematic scenes."
            }
          />
          <div className="relative min-h-[240px] rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5">
            {capturedImage && (
              <img src={capturedImage} alt="You" className="absolute inset-0 size-full object-cover" />
            )}
            <div className="absolute inset-0 bg-black/40" />
            <div
              className="absolute inset-x-0 top-0 h-1 bg-primary/70"
              style={{
                animation: "shimmer 1.6s linear infinite",
                backgroundImage:
                  "linear-gradient(90deg, transparent, var(--color-primary), transparent)",
                backgroundSize: "200% 100%",
              }}
            />
            <div className="absolute inset-x-4 bottom-4 space-y-2">
              <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-1000"
                  style={{ width: state === "processing" ? "45%" : "88%" }}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-muted">
                <span>Neural cut-out</span>
                <span className="text-primary">
                  {state === "processing" ? "0.45x" : "0.88x"}
                </span>
              </div>
            </div>
          </div>
          <div className="w-full py-4 bg-white/5 rounded-xl text-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
              Watch the wall — you're being placed inside the story.
            </span>
          </div>
        </div>
      )}

      {state === "playing" && (
        <div className="flex-1 flex flex-col animate-entrance">
          <StepChip step="Step 05" title="Your scene is on the wall." />
          <div className="min-h-[220px] rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5 relative">
            <div
              className="absolute inset-0 animate-kenburns"
              style={{
                backgroundImage: `url(${activeChapter.image})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
            <div className="absolute inset-x-4 bottom-4">
              <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary block">
                Chapter {activeChapter.id}
              </span>
              <span className="text-lg font-bold italic tracking-tight text-foreground">
                {activeChapter.title}
              </span>
            </div>
          </div>
          <div className="w-full py-4 bg-white/5 rounded-xl text-center">
            <span className="text-[10px] font-mono uppercase tracking-widest text-primary">
              Live on the LED wall
            </span>
          </div>
        </div>
      )}

      {state === "completed" && (
        <div className="flex-1 flex flex-col animate-entrance">
          <StepChip
            step="All done"
            title={visitorName ? `Thank you, ${visitorName}.` : "Thank you for stepping in."}
          />
          <div className="min-h-[220px] rounded-2xl overflow-hidden ring-1 ring-primary/40 mb-5 relative">
            {capturedImage && (
              <img
                src={capturedImage}
                alt="Souvenir"
                className="absolute inset-0 size-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute inset-x-4 bottom-4">
              <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary block">
                Souvenir
              </span>
              <span className="text-base font-bold italic tracking-tight">
                SPX / {new Date().toLocaleDateString()}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {capturedImage && (
              <a
                href={capturedImage}
                download={`spx-souvenir-${Date.now()}.jpg`}
                className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all text-center"
              >
                Save souvenir
              </a>
            )}
            <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
              {POST_EXPERIENCE_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-3 py-3 text-left transition-colors hover:bg-white/10"
                >
                  <span className="text-[11px] font-medium tracking-tight text-foreground">{action}</span>
                  <span className="text-primary">→</span>
                </button>
              ))}
            </div>
            <button
              onClick={onReset}
              className="w-full py-3 bg-white/5 border border-white/10 font-mono uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/10"
            >
              End session
            </button>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="flex-1 flex flex-col justify-center items-center text-center animate-entrance">
          <div className="size-14 rounded-full bg-destructive/15 border border-destructive/40 mb-4 flex items-center justify-center">
            <span className="text-destructive text-lg">!</span>
          </div>
          <h3 className="text-lg font-bold tracking-tight mb-2">Camera unavailable</h3>
          <p className="text-xs text-muted-foreground max-w-[28ch]">
            {errorMessage ??
              "We couldn't access your camera. Please check your browser permissions."}
          </p>
          <button
            onClick={onReset}
            className="mt-6 px-5 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-[11px] rounded-xl"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Admin panel ─────────────────────────── */

function AdminPanel({
  state,
  setState,
  reset,
}: {
  state: ExperienceState;
  setState: (s: ExperienceState) => void;
  reset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const jumpTargets: ExperienceState[] = [
    "idle",
    "scanned",
    "camera_ready",
    "processing",
    "rendering",
    "playing",
    "completed",
    "error",
  ];
  return (
    <div className="mt-4 w-full max-w-[280px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-white/5 border border-white/10 text-[9px] font-mono uppercase tracking-widest hover:bg-white/10 transition-colors rounded-md"
      >
        <span>Operator / Debug</span>
        <span className="text-primary">{open ? "hide" : "show"}</span>
      </button>
      {open && (
        <div className="mt-3 p-4 bg-surface border border-border rounded-md space-y-3 animate-entrance">
          <div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-2">
              Current state
            </span>
            <span className="font-mono text-xs text-primary">{state}</span>
          </div>
          <div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted block mb-2">
              Jump to state
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {jumpTargets.map((t) => (
                <button
                  key={t}
                  onClick={() => setState(t)}
                  className={`py-1.5 text-[10px] font-mono uppercase tracking-wider rounded-sm border transition-colors ${
                    state === t
                      ? "border-primary text-primary bg-primary/10"
                      : "border-white/10 text-muted hover:text-foreground hover:border-white/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={reset}
            className="w-full py-2 bg-primary/20 border border-primary/40 text-primary text-[10px] font-mono uppercase tracking-widest rounded-sm hover:bg-primary/30"
          >
            Reset session
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Footer HUD ─────────────────────────── */

function FooterHUD({ state }: { state: ExperienceState }) {
  return (
    <footer className="hidden lg:flex fixed bottom-0 left-0 right-0 p-6 items-end justify-between pointer-events-none">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div
            className={`size-2 rounded-full ${
              state === "error" ? "bg-destructive" : "bg-green-500"
            }`}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted">
            {state === "error" ? "System halted" : "System nominal"}
          </span>
        </div>
        <div className="text-[10px] font-mono text-muted/60">
          LATENCY 12ms · BUFFER 4K_RAW · LED SYNC OK
        </div>
      </div>
      <div className="text-right">
        <span className="block text-4xl font-black italic opacity-[0.08] leading-none tracking-tighter uppercase">
          Future / Forward
        </span>
      </div>
    </footer>
  );
}
