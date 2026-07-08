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
      <Header state={state} />

      <main className="pt-24 p-4 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <section className="lg:col-span-8 space-y-4">
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

        <section className="lg:col-span-4 flex flex-col items-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted mb-4">
            Visitor Mobile Interface
          </span>
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

function Header({ state }: { state: ExperienceState }) {
  const session = useMemo(
    () => `${String(Math.floor(Math.random() * 9000) + 1000)}-X`,
    []
  );
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-6 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="size-8 bg-primary rounded-sm flex items-center justify-center font-mono text-primary-foreground font-bold tracking-tighter">
          SPX
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted hidden sm:inline">
          Innovation Center / Reception Experience
        </span>
      </div>
      <div className="flex items-center gap-8 text-[10px] font-mono uppercase tracking-widest text-muted">
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
    <div className="w-full flex items-center justify-between gap-12">
      <div className="max-w-xl animate-entrance">
        <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.5em] text-primary block mb-4">
          Welcome to SPX
        </span>
        <h1 className="text-4xl md:text-7xl font-extrabold tracking-tighter uppercase italic leading-[0.95]">
          Step onto the
          <br />
          <span className="text-primary">stage.</span>
        </h1>
        <p className="mt-6 text-sm md:text-base text-muted-foreground max-w-md text-pretty">
          Scan the code, capture a portrait, and become the main character in a
          cinematic journey across the SPX ecosystem.
        </p>
      </div>

      <button
        onClick={onScan}
        className="group relative shrink-0 p-3 md:p-4 bg-white rounded-md size-32 md:size-44 hover:scale-[1.02] transition-transform"
      >
        <QrGlyph />
        <div className="absolute -bottom-8 left-0 right-0 text-center">
          <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.3em] text-muted">
            {scanned ? "Session opened →" : "Scan to begin"}
          </span>
        </div>
      </button>
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
        <div
          key={chapter.id}
          className="absolute inset-0 flex items-end justify-center pb-8 animate-entrance z-10"
        >
          <div className="relative h-[95%] aspect-[3/4] max-w-[45%]">
            <img
              src={capturedImage}
              alt="Visitor"
              className="size-full object-cover"
              style={{
                maskImage:
                  "linear-gradient(to bottom, black 70%, transparent 100%), radial-gradient(ellipse at center, black 55%, transparent 78%)",
                maskComposite: "intersect",
                WebkitMaskImage:
                  "linear-gradient(to bottom, black 70%, transparent 100%), radial-gradient(ellipse at center, black 55%, transparent 78%)",
                filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.7)) contrast(1.05)",
              }}
            />
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
    <div className="w-full max-w-[340px] aspect-[9/19.5] bg-surface rounded-[42px] overflow-hidden relative shadow-[0_40px_80px_-20px_rgba(0,0,0,0.9)] ring-[10px] ring-neutral-900">
      <div className="absolute top-2 left-1/2 -translate-x-1/2 h-6 w-32 bg-black rounded-full z-40" />
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
    <div className="h-full w-full pt-10 p-5 flex flex-col overflow-hidden">
      <div className="h-4 mb-4 flex items-center justify-between px-2 text-[10px] font-mono text-muted-foreground">
        <span>9:41</span>
        <span>SPX · 5G</span>
      </div>

      {state === "idle" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-entrance">
          <div className="size-16 rounded-full border border-primary/30 flex items-center justify-center mb-6">
            <div className="size-3 bg-primary rounded-full animate-soft-pulse" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted">
            Awaiting scan
          </span>
          <p className="mt-3 text-sm text-muted-foreground max-w-[24ch]">
            Point your camera at the QR code on the wall.
          </p>
        </div>
      )}

      {state === "scanned" && (
        <div className="flex-1 flex flex-col animate-entrance">
          <StepChip step="Step 01" title="Welcome. Let's compose your scene." />
          <div className="flex-1 rounded-2xl bg-gradient-to-br from-primary/20 via-black to-black ring-1 ring-white/10 p-5 flex flex-col justify-end mb-5">
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
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5">
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
          <div className="relative flex-1 rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5">
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
          <div className="flex-1 rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5 relative">
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
          <div className="flex-1 rounded-2xl overflow-hidden ring-1 ring-primary/40 mb-5 relative">
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
    <div className="mt-6 w-full max-w-[340px]">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2 bg-white/5 border border-white/10 text-[10px] font-mono uppercase tracking-widest hover:bg-white/10 transition-colors rounded-md"
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
