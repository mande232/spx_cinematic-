import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { QRCode } from "@/components/experience/QRCode";
import { SyncIndicator } from "@/components/experience/SyncIndicator";
import { applyClientCutout } from "@/lib/background-removal";
import { CHAPTERS, getChapters, processPortraitRemote, STATE_LABELS, trackAnalyticsEvent, useSharedSession } from "@/lib/experience-state";
import type { Chapter, ExperienceState } from "@/lib/experience-state";
import { compressPortrait } from "@/lib/image-utils";
import { getPhoneUrlFromToken } from "@/lib/pairing";

export const Route = createFileRoute("/")({ component: WallView });

const SESSION_TIMEOUT_MS = 90_000;
const COMPLETED_RESET_MS = 30_000;
const AUDIO_URL =
  "https://res.cloudinary.com/djwboszae/video/upload/v1783506840/ElevenLabs_2026-07-08T10_28_27_Caty_-_Droll_Wry_and_Dry_pvc_s50_m2_rl2hy4.mp3";

function WallView() {
  const { session, update, reset, online, synced, pairingToken, maintenanceMode, chapterOverrides } = useSharedSession();
  const { state, capturedImage, processedImage, visitorName, chapterIndex } = session;
  const displayImage = processedImage ?? capturedImage;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chapterIndexRef = useRef(chapterIndex);
  const [phoneUrl, setPhoneUrl] = useState("/phone");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [wallCountdown, setWallCountdown] = useState(3);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
    const base = configured?.replace(/\/$/, "") ? `${configured.replace(/\/$/, "")}/phone` : `${window.location.origin}/phone`;
    setPhoneUrl(pairingToken ? getPhoneUrlFromToken(base, pairingToken) : base);

    const savedTheme = window.localStorage.getItem("spx-theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, [pairingToken]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("spx-theme", theme);
    }
  }, [theme]);

  chapterIndexRef.current = chapterIndex;

  const stopWallCamera = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraRef.current) cameraRef.current.srcObject = null;
  }, []);

  useEffect(() => () => stopWallCamera(), [stopWallCamera]);

  useEffect(() => {
    if (state !== "camera_ready" && state !== "countdown") {
      if (state !== "capturing") stopWallCamera();
      return;
    }
    if (cameraStreamRef.current) return;

    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        cameraStreamRef.current = stream;
        setCameraError(null);
        if (cameraRef.current) {
          cameraRef.current.srcObject = stream;
          await cameraRef.current.play().catch(() => undefined);
        }
      })
      .catch(() => {
        setCameraError("LED camera unavailable. Allow camera access on this display and retry.");
        update({ state: "error" });
      });

    return () => {
      cancelled = true;
    };
  }, [state, stopWallCamera, update]);

  useEffect(() => {
    if (state !== "countdown") return;
    setWallCountdown(3);
    let remaining = 3;
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setWallCountdown(remaining);
        return;
      }

      window.clearInterval(timer);
      const video = cameraRef.current;
      const canvas = captureCanvasRef.current;
      if (!video || !canvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        setCameraError("The LED camera was not ready. Please retry.");
        update({ state: "error" });
        stopWallCamera();
        return;
      }

      update({ state: "capturing" });
      void (async () => {
        const width = video.videoWidth || 1280;
        const height = video.videoHeight || 720;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          update({ state: "error" });
          return;
        }
        context.translate(width, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, width, height);
        const portrait = await compressPortrait(canvas.toDataURL("image/jpeg", 0.92));
        update({ capturedImage: portrait, processedImage: null, state: "capturing" });
        void trackAnalyticsEvent("wall_camera_captured", {});
        stopWallCamera();
      })();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state, stopWallCamera, update]);

  useEffect(() => {
    if (state !== "processing" || !capturedImage) return;
    let cancelled = false;
    void (async () => {
      const remote = await processPortraitRemote(capturedImage);
      const processed = remote?.processedImage ?? (await applyClientCutout(capturedImage));
      if (cancelled) return;
      update({ processedImage: processed, state: "rendering" });
      void trackAnalyticsEvent("portrait_processed", { method: remote?.method ?? "client_cutout" });
    })();
    return () => {
      cancelled = true;
    };
  }, [capturedImage, state, update]);

  useEffect(() => {
    if (state !== "rendering") return;
    const timer = window.setTimeout(() => {
      update({ state: "playing", chapterIndex: 0 });
      void trackAnalyticsEvent("playback_started", {});
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [state, update]);

  useEffect(() => {
    if (state !== "playing") return;

    let cancelled = false;
    let current = chapterIndexRef.current;

    const advance = () => {
      if (cancelled) return;
      const next = current + 1;
      if (next >= CHAPTERS.length) {
        setTimeout(() => {
          if (!cancelled) update({ state: "completed" });
        }, 800);
        return;
      }
      current = next;
      update({ chapterIndex: next });
      setTimeout(advance, 3200);
    };

    const timer = setTimeout(advance, 3200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
    void reset();
  }, [reset]);

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

  const chapters = getChapters(chapterOverrides);
  const activeChapter = chapters[Math.min(chapterIndex, chapters.length - 1)];
  const meta = STATE_LABELS[state];

  if (maintenanceMode) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center font-display">
        <div className="max-w-lg space-y-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-primary">Maintenance mode</span>
          <h1 className="text-3xl font-bold tracking-tight">SPX reception display is temporarily offline.</h1>
          <p className="text-sm text-muted-foreground">Please check back shortly or speak with reception staff.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-display selection:bg-primary/30">
      <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between border-b border-border bg-background/85 px-4 py-4 backdrop-blur-md md:px-8">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary font-mono text-sm font-bold tracking-tighter text-primary-foreground">
            SPX
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold tracking-tight">Cinematic Welcome</p>
            <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">LED Reception Display</p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <SyncIndicator online={online} synced={synced} />
          <button
            type="button"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            className="rounded-full border border-border bg-background/95 px-3 py-1.5 text-[9px] text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {theme === "dark" ? "Light" : "Dark"}
          </button>
          <span className={`hidden rounded-full border px-2.5 py-1 md:inline ${state === "idle" ? "border-border text-muted-foreground" : "border-primary/30 bg-primary/10 text-primary"}`}>
            {meta.step} · {meta.label}
          </span>
          {state !== "idle" && (
            <button
              onClick={resetSession}
              className="rounded border border-border px-2 py-1 text-[9px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              Reset
            </button>
          )}
          <a
            href="/admin"
            className="hidden rounded border border-border px-2 py-1 text-[9px] text-muted-foreground transition-colors hover:text-foreground lg:inline"
          >
            Admin
          </a>
        </div>
      </header>

      <main className="pt-28 md:pt-32 p-4 md:p-8 space-y-5">
        <div className="flex items-center justify-between px-1">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Primary LED Surface [2.35:1]
          </h2>
          <span className="font-mono text-[10px] uppercase tracking-widest text-foreground">{meta.hint}</span>
        </div>

        <LedWall
          state={state}
          chapter={activeChapter}
          chapterIndex={chapterIndex}
          capturedImage={displayImage}
          visitorName={visitorName}
          phoneUrl={phoneUrl}
          cameraRef={cameraRef}
          countdown={wallCountdown}
          cameraError={cameraError}
          onDemoStart={() => {
            update({ state: "scanned" });
            void trackAnalyticsEvent("wall_demo_start", {});
            if (typeof window !== "undefined" && phoneUrl.includes("session=")) {
              window.location.assign(phoneUrl);
            }
          }}
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
                  <span className={`font-mono text-[9px] uppercase tracking-widest ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                    {item.step} / {item.label}
                  </span>
                  <div className={`h-[2px] w-full ${isActive ? "bg-primary" : "bg-foreground/10 dark:bg-white/10"}`} />
                  <span className={`text-xs font-medium uppercase tracking-wider ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
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
                {String(chapterIndex + 1).padStart(2, "0")} / {String(chapters.length).padStart(2, "0")}
              </span>
            </div>
          )}
        </nav>
      </main>

      <footer className="pointer-events-none fixed bottom-0 left-0 right-0 hidden items-end justify-between p-6 lg:flex">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className={`size-2 rounded-full ${state === "error" ? "bg-destructive" : online && synced ? "bg-green-500" : "bg-yellow-400"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {state === "error" ? "System halted" : online && synced ? "LED sync active" : "Syncing…"}
            </span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            Addis Ababa · ET · SPX Reception
          </div>
        </div>
        <div className="text-right">
          <span className="block text-4xl font-black italic leading-none tracking-tighter text-foreground/15 uppercase dark:text-white/10">
            Future / Forward
          </span>
        </div>
      </footer>

      <audio ref={audioRef} src={AUDIO_URL} preload="auto" />
      <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
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
  cameraRef,
  countdown,
  cameraError,
  onDemoStart,
}: {
  state: ExperienceState;
  chapter: Chapter;
  chapterIndex: number;
  capturedImage: string | null;
  visitorName: string;
  phoneUrl: string;
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  countdown: number;
  cameraError: string | null;
  onDemoStart: () => void;
}) {
  const isIdle = state === "idle" || state === "scanned";

  return (
    <div className="relative aspect-[21/9] overflow-hidden rounded-sm bg-surface ring-1 ring-black/10 dark:ring-white/10">
      <div
        key={chapter.id + state}
        className="absolute inset-0 animate-kenburns"
        style={{
          backgroundImage: `url(${chapter.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: isIdle ? "grayscale(0.45) brightness(0.72)" : "brightness(0.78)",
          transition: "filter 1.2s var(--ease-cinematic)",
        }}
      />
      <div className="led-vignette absolute inset-0" />
      <div className="absolute top-0 inset-x-0 z-30 h-6 border-b border-border/70 bg-background/70 backdrop-blur-sm md:h-8 dark:border-white/5 dark:bg-black/60" />
      <div className="absolute bottom-0 inset-x-0 z-30 h-6 border-t border-border/70 bg-background/70 backdrop-blur-sm md:h-8 dark:border-white/5 dark:bg-black/60" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="absolute inset-0 z-20 flex items-center justify-center px-6 md:px-12">
        {isIdle && (
          <IdleLedContent
            scanned={state === "scanned"}
            phoneUrl={phoneUrl}
            visitorName={visitorName}
            onDemoStart={onDemoStart}
          />
        )}

        {(state === "camera_ready" || state === "countdown" || state === "capturing") && (
          <WallCameraContent
            state={state}
            videoRef={cameraRef}
            countdown={countdown}
            capturedImage={capturedImage}
            error={cameraError}
          />
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
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary">Chapter {chapter.id}</span>
          <span className="font-display text-base italic tracking-[-0.03em] text-foreground md:text-[1.6rem]">
            {chapter.title}
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground md:inline">
            · {chapter.caption}
          </span>
        </div>
      )}

      <div className="absolute top-10 right-8 z-30 flex items-center gap-2">
        <div className={`size-1.5 rounded-full ${state === "idle" ? "bg-foreground/25 dark:bg-white/20" : "bg-primary animate-soft-pulse"}`} />
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-foreground dark:text-muted">
          {state === "idle" ? "Standby" : "Live"}
        </span>
      </div>

      {state === "playing" && (
        <div className="absolute top-10 left-8 z-30 flex gap-1">
          {CHAPTERS.map((c, i) => (
            <div key={c.id} className={`h-[2px] w-6 transition-colors ${i <= chapterIndex ? "bg-primary" : "bg-foreground/15 dark:bg-white/15"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function IdleLedContent({
  scanned,
  phoneUrl,
  visitorName,
  onDemoStart,
}: {
  scanned: boolean;
  phoneUrl: string;
  visitorName: string;
  onDemoStart: () => void;
}) {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
      {/* Left — welcome + demo */}
      <div className="led-copy-panel w-full max-w-md animate-entrance rounded-2xl p-6 text-center md:text-left">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary">
          {scanned ? "Connected" : "Welcome to SPX"}
        </span>
        <h1 className="led-text-shadow mt-3 text-3xl font-extrabold uppercase italic tracking-[-0.04em] text-foreground md:text-4xl">
          Step into
          <br />
          <span className="text-primary">the story.</span>
        </h1>
        {scanned ? (
          <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-primary">
            {visitorName ? `${visitorName} connected` : "Phone connected"} — continue on your device
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Scan the QR with your phone, or open the phone flow here for a demo.
          </p>
        )}
        <button
          type="button"
          onClick={onDemoStart}
          disabled={scanned || !phoneUrl.includes("session=")}
          className={`mt-6 w-full rounded-xl px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] transition md:w-auto ${
            scanned || !phoneUrl.includes("session=")
              ? "cursor-not-allowed border border-border bg-background/60 text-muted-foreground"
              : "bg-primary text-primary-foreground hover:brightness-110"
          }`}
        >
          {scanned ? "Session active" : phoneUrl.includes("session=") ? "Demo start" : "Preparing…"}
        </button>
      </div>

      {/* Right — QR only */}
      <div className="w-full max-w-[260px] shrink-0 animate-entrance">
        <div className={`rounded-[1.75rem] bg-white p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.3)] ring-1 ring-black/5 ${scanned ? "ring-2 ring-primary/40" : ""}`}>
          <div className="overflow-hidden rounded-[1.25rem]">
            <QRCode value={phoneUrl} size={240} className="size-full object-contain" />
          </div>
        </div>
        <p className="mt-3 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          Scan with your phone
        </p>
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
      <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.34em] text-primary block mb-3">
        {state === "processing" ? "Isolating subject" : "Assembling film"}
      </span>
      <h1 className="led-text-shadow text-3xl font-extrabold uppercase italic tracking-[-0.04em] text-foreground md:text-5xl">
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
        <div className="w-40 md:w-72 h-[3px] overflow-hidden rounded-full bg-foreground/10 dark:bg-white/10">
          <div className="h-full bg-primary" style={{ width: state === "processing" ? "45%" : "88%", transition: "width 1.6s var(--ease-cinematic)" }} />
        </div>
      </div>
    </div>
  );
}

function WallCameraContent({
  state,
  videoRef,
  countdown,
  capturedImage,
  error,
}: {
  state: ExperienceState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  countdown: number;
  capturedImage: string | null;
  error: string | null;
}) {
  const reviewing = state === "capturing" && Boolean(capturedImage);

  return (
    <div className="grid w-full max-w-4xl items-center gap-6 animate-entrance md:grid-cols-[1.2fr_0.8fr]">
      <div className="relative aspect-video overflow-hidden rounded-2xl border border-primary/30 bg-black shadow-2xl">
        {reviewing ? (
          <img src={capturedImage!} alt="Captured visitor" className="size-full object-cover" />
        ) : (
          <video ref={videoRef} className="size-full -scale-x-100 object-cover" playsInline muted />
        )}
        <div className="pointer-events-none absolute inset-5 rounded-xl border border-primary/35" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" />
        {state === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/25">
            <span key={countdown} className="animate-entrance text-7xl font-black italic text-primary md:text-9xl">
              {countdown}
            </span>
          </div>
        )}
        <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-white">
          {reviewing ? "Photo sent to phone for review" : "LED camera active"}
        </span>
      </div>
      <div className="text-center md:text-left">
        <span className="font-mono text-[9px] uppercase tracking-[0.35em] text-primary">
          {reviewing ? "Review on your phone" : state === "countdown" ? "Capturing portrait" : "Camera ready"}
        </span>
        <h1 className="led-text-shadow mt-3 text-3xl font-extrabold uppercase italic tracking-[-0.04em] text-foreground md:text-5xl">
          {reviewing ? "Approve or retake." : "Look at the camera."}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {error ?? (reviewing
            ? "Your phone is now the remote control for this portrait."
            : "Stand in the marked area. Trigger the photo from your phone when ready.")}
        </p>
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
        <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2 animate-entrance md:left-6">
          <div className="relative size-36 overflow-hidden rounded-full border-2 border-primary/45 bg-transparent shadow-[0_14px_36px_rgba(0,0,0,0.5)] md:size-52 lg:size-64">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-black/15" />
            <img
              src={capturedImage}
              alt="Visitor"
              className="relative z-10 size-full object-contain drop-shadow-[0_10px_16px_rgba(0,0,0,0.55)]"
            />
            <div className="pointer-events-none absolute inset-0 z-20 rounded-full ring-1 ring-inset ring-white/15" />
          </div>
        </div>
      )}
      <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 z-20 text-right max-w-xs animate-entrance">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary block mb-2">Chapter {chapter.id}</span>
        <h2 className="led-text-shadow text-2xl font-bold italic tracking-[-0.04em] text-foreground md:text-[2.5rem]">{chapter.title}</h2>
        <p className="mt-2 text-pretty text-xs leading-5 text-muted-foreground md:text-sm">{chapter.caption}</p>
      </div>
    </>
  );
}

function CompletedLedContent({ visitorName }: { visitorName: string }) {
  return (
    <div className="text-center animate-entrance">
      <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.34em] text-primary block mb-4">The film is yours</span>
      <h1 className="led-text-shadow text-4xl font-extrabold uppercase italic leading-none tracking-[-0.05em] text-foreground md:text-6xl">
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
      <p className="mt-5 text-sm text-muted-foreground">A souvenir is waiting on your device.</p>
    </div>
  );
}