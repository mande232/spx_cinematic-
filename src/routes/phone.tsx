import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { CHAPTERS, SPX_PROJECTS, useSharedSession } from "@/lib/experience-state";
import type { ExperienceState } from "@/lib/experience-state";

export const Route = createFileRoute("/phone")({ component: PhoneView });

function PhoneView() {
  const { session, update } = useSharedSession();
  const { state, capturedImage, visitorName, chapterIndex } = session;

  const [countdown, setCountdown] = useState(3);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  // If visitor lands on /phone while idle, auto-advance to scanned
  useEffect(() => {
    if (state === "idle") {
      update({ state: "scanned" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch {
        setErrorMessage("Camera access denied. Enable camera permission in your browser.");
        update({ state: "error" });
      }
    })();
    return () => { cancelled = true; };
  }, [state, update]);

  // Countdown → capture
  useEffect(() => {
    if (state !== "countdown") return;
    setCountdown(3);
    let n = 3;
    const id = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(id);
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
            update({ capturedImage: canvas.toDataURL("image/jpeg", 0.9) });
          }
        }
        stopCamera();
        update({ state: "capturing" });
      } else {
        setCountdown(n);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state, stopCamera, update]);

  // Pipeline: capturing → processing → rendering → playing
  useEffect(() => {
    if (state === "capturing") {
      const t = setTimeout(() => update({ state: "processing" }), 600);
      return () => clearTimeout(t);
    }
    if (state === "processing") {
      const t = setTimeout(() => update({ state: "rendering" }), 2400);
      return () => clearTimeout(t);
    }
    if (state === "rendering") {
      const t = setTimeout(() => update({ state: "playing", chapterIndex: 0 }), 1800);
      return () => clearTimeout(t);
    }
  }, [state, update]);

  const reset = useCallback(() => {
    stopCamera();
    setErrorMessage(null);
    setCountdown(3);
    update({ state: "scanned", capturedImage: null, visitorName: "", chapterIndex: 0 });
  }, [stopCamera, update]);

  const activeChapter = CHAPTERS[Math.min(chapterIndex, CHAPTERS.length - 1)];

  return (
    <div className="min-h-screen bg-background text-foreground font-display dark">
      <div className="max-w-sm mx-auto min-h-screen flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            <div className="size-6 bg-primary rounded-sm flex items-center justify-center font-mono text-primary-foreground font-bold text-[9px] tracking-tighter">
              SPX
            </div>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted">Experience</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-1.5 bg-primary rounded-full animate-soft-pulse" />
            <span className="font-mono text-[9px] text-muted">Live</span>
          </div>
        </div>

        <div className="flex-1 px-4 pb-8 pt-4 flex flex-col">
          {(state === "idle" || state === "scanned") && (
            <ScannedScreen
              visitorName={visitorName}
              setVisitorName={(v) => update({ visitorName: v })}
              onNext={() => update({ state: "camera_ready" })}
            />
          )}
          {(state === "camera_ready" || state === "countdown" || state === "capturing") && (
            <CameraScreen
              state={state}
              countdown={countdown}
              videoRef={videoRef}
              onCapture={() => update({ state: "countdown" })}
            />
          )}
          {(state === "processing" || state === "rendering") && (
            <ProcessingScreen state={state} capturedImage={capturedImage} />
          )}
          {state === "playing" && <PlayingScreen activeChapter={activeChapter} />}
          {state === "completed" && (
            <CompletedScreen
              visitorName={visitorName}
              capturedImage={capturedImage}
              onReset={reset}
            />
          )}
          {state === "error" && (
            <ErrorScreen message={errorMessage} onReset={reset} />
          )}
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
    </div>
  );
}

/* ─────────────────────────── Shared ─────────────────────────── */

function StepChip({ step, title }: { step: string; title: string }) {
  return (
    <div className="mb-6">
      <span className="text-primary font-mono text-[10px] uppercase tracking-widest">{step}</span>
      <h3 className="text-xl font-bold tracking-tight text-balance leading-tight mt-1">{title}</h3>
    </div>
  );
}

/* ─────────────────────────── Screens ─────────────────────────── */

function ScannedScreen({
  visitorName,
  setVisitorName,
  onNext,
}: {
  visitorName: string;
  setVisitorName: (v: string) => void;
  onNext: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col animate-entrance">
      <StepChip step="Step 01" title="Welcome. Let's compose your scene." />
      <div className="rounded-2xl bg-gradient-to-br from-primary/20 via-black to-black ring-1 ring-white/10 p-5 flex flex-col justify-end mb-5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-primary mb-1">Optional</span>
        <label className="text-xs text-muted-foreground mb-2">What should we call you on screen?</label>
        <input
          value={visitorName}
          onChange={(e) => setVisitorName(e.target.value.slice(0, 24))}
          placeholder="Your first name"
          style={{ fontSize: "16px" }} // prevents iOS zoom on focus
          className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm placeholder:text-muted focus:outline-none focus:border-primary/60"
        />
      </div>
      <button
        onClick={onNext}
        className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all active:scale-95"
      >
        Enable camera
      </button>
      <p className="mt-4 text-center text-[10px] text-muted font-mono leading-relaxed">
        We use your photo only for this playback. Nothing is stored.
      </p>
    </div>
  );
}

function CameraScreen({
  state,
  countdown,
  videoRef,
  onCapture,
}: {
  state: ExperienceState;
  countdown: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onCapture: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col animate-entrance">
      <StepChip
        step={state === "countdown" ? "Hold still" : "Step 02"}
        title={state === "countdown" ? "Rolling in…" : "Position yourself in the light."}
      />
      <div className="relative min-h-[260px] rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover -scale-x-100" playsInline muted />
        <div className="absolute inset-4 pointer-events-none">
          <div className="absolute top-0 left-0 size-5 border-t-2 border-l-2 border-primary" />
          <div className="absolute top-0 right-0 size-5 border-t-2 border-r-2 border-primary" />
          <div className="absolute bottom-0 left-0 size-5 border-b-2 border-l-2 border-primary" />
          <div className="absolute bottom-0 right-0 size-5 border-b-2 border-r-2 border-primary" />
        </div>
        {state === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <div className="size-28 rounded-full border border-primary/40 flex items-center justify-center">
              <span key={countdown} className="text-6xl font-black italic tracking-tighter text-primary animate-entrance">
                {countdown}
              </span>
            </div>
          </div>
        )}
        {state === "capturing" && <div className="absolute inset-0 bg-white animate-soft-pulse" />}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center">
          <div className="px-3 py-1.5 bg-black/60 backdrop-blur-lg rounded-full border border-white/10">
            <span className="text-[10px] font-mono text-muted-foreground tracking-widest">
              {state === "camera_ready" ? "Auto-focus ready" : "Recording"}
            </span>
          </div>
        </div>
      </div>
      {state === "camera_ready" ? (
        <button
          onClick={onCapture}
          className="w-full py-4 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-xs rounded-xl hover:brightness-110 transition-all active:scale-95"
        >
          Capture moment
        </button>
      ) : (
        <div className="w-full py-4 bg-white/5 rounded-xl text-center">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Please stand by</span>
        </div>
      )}
    </div>
  );
}

function ProcessingScreen({ state, capturedImage }: { state: ExperienceState; capturedImage: string | null }) {
  return (
    <div className="flex-1 flex flex-col animate-entrance">
      <StepChip
        step={state === "processing" ? "Step 03" : "Step 04"}
        title={state === "processing" ? "Removing the background…" : "Assembling your cinematic scenes."}
      />
      <div className="relative min-h-[240px] rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5">
        {capturedImage && <img src={capturedImage} alt="You" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-black/40" />
        <div
          className="absolute inset-x-0 top-0 h-1 bg-primary/70"
          style={{ animation: "shimmer 1.6s linear infinite", backgroundImage: "linear-gradient(90deg, transparent, var(--color-primary), transparent)", backgroundSize: "200% 100%" }}
        />
        <div className="absolute inset-x-4 bottom-4 space-y-2">
          <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: state === "processing" ? "45%" : "88%" }} />
          </div>
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-muted">
            <span>Neural cut-out</span>
            <span className="text-primary">{state === "processing" ? "0.45x" : "0.88x"}</span>
          </div>
        </div>
      </div>
      <div className="w-full py-4 bg-white/5 rounded-xl text-center">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">
          Watch the wall — you're being placed inside the story.
        </span>
      </div>
    </div>
  );
}

function PlayingScreen({ activeChapter }: { activeChapter: { id: string; title: string; image: string } }) {
  return (
    <div className="flex-1 flex flex-col animate-entrance">
      <StepChip step="Step 05" title="Your scene is on the wall." />
      <div className="min-h-[220px] rounded-2xl overflow-hidden bg-black ring-1 ring-white/10 mb-5 relative">
        <div
          className="absolute inset-0 animate-kenburns"
          style={{ backgroundImage: `url(${activeChapter.image})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary block">Chapter {activeChapter.id}</span>
          <span className="text-lg font-bold italic tracking-tight text-foreground">{activeChapter.title}</span>
        </div>
      </div>
      <div className="w-full py-4 bg-white/5 rounded-xl text-center">
        <span className="text-[10px] font-mono uppercase tracking-widest text-primary">Live on the LED wall</span>
      </div>
    </div>
  );
}

function CompletedScreen({
  visitorName,
  capturedImage,
  onReset,
}: {
  visitorName: string;
  capturedImage: string | null;
  onReset: () => void;
}) {
  const [overlay, setOverlay] = useState<"projects" | "contact" | null>(null);

  return (
    <div className="flex-1 flex flex-col animate-entrance">
      <StepChip
        step="All done"
        title={visitorName ? `Thank you, ${visitorName}.` : "Thank you for stepping in."}
      />
      <div className="min-h-[220px] rounded-2xl overflow-hidden ring-1 ring-primary/40 mb-5 relative">
        {capturedImage && <img src={capturedImage} alt="Souvenir" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-primary block">Souvenir</span>
          <span className="text-base font-bold italic tracking-tight">SPX / {new Date().toLocaleDateString()}</span>
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
          <a
            href="https://spxafrica.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-3 py-3 transition-colors hover:bg-white/10"
          >
            <span className="text-[11px] font-medium tracking-tight text-foreground">Visit SPX Website</span>
            <span className="text-primary">→</span>
          </a>
          <a
            href="https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
            target="_blank"
            rel="noopener noreferrer"
            download="SPX-Company-Profile.pdf"
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-3 py-3 transition-colors hover:bg-white/10"
          >
            <span className="text-[11px] font-medium tracking-tight text-foreground">Download Company Profile</span>
            <span className="text-primary">↓</span>
          </a>
          <button
            type="button"
            onClick={() => setOverlay("projects")}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-3 py-3 text-left transition-colors hover:bg-white/10"
          >
            <span className="text-[11px] font-medium tracking-tight text-foreground">Explore Our Projects</span>
            <span className="text-primary">→</span>
          </button>
          <button
            type="button"
            onClick={() => setOverlay("contact")}
            className="flex w-full items-center justify-between rounded-lg border border-white/10 bg-background/50 px-3 py-3 text-left transition-colors hover:bg-white/10"
          >
            <span className="text-[11px] font-medium tracking-tight text-foreground">Connect With SPX</span>
            <span className="text-primary">→</span>
          </button>
        </div>
        <button
          onClick={onReset}
          className="w-full py-3 bg-white/5 border border-white/10 font-mono uppercase tracking-widest text-[10px] rounded-xl hover:bg-white/10"
        >
          End session
        </button>
      </div>

      {overlay && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setOverlay(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-2xl bg-surface border border-white/10 p-5 pb-8 animate-entrance max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                {overlay === "projects" ? "Our Projects" : "Connect With SPX"}
              </span>
              <button onClick={() => setOverlay(null)} className="text-muted text-xl leading-none">×</button>
            </div>
            {overlay === "projects" && (
              <div className="space-y-3">
                {SPX_PROJECTS.map((p) => (
                  <div key={p.title} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-primary block mb-1">{p.category}</span>
                    <p className="text-sm font-semibold text-foreground">{p.title}</p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-5">{p.desc}</p>
                  </div>
                ))}
              </div>
            )}
            {overlay === "contact" && (
              <div className="space-y-3">
                {[
                  { label: "Website", value: "spxafrica.com", href: "https://spxafrica.com/" },
                  { label: "Email", value: "info@spxafrica.com", href: "mailto:info@spxafrica.com" },
                  { label: "Phone", value: "+251 11 557 0000", href: "tel:+251115570000" },
                  { label: "Address", value: "Bole Road, Addis Ababa, Ethiopia", href: null },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-primary block mb-1">{c.label}</span>
                    {c.href ? (
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-sm text-foreground hover:text-primary transition-colors">
                        {c.value}
                      </a>
                    ) : (
                      <p className="text-sm text-foreground">{c.value}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ErrorScreen({ message, onReset }: { message: string | null; onReset: () => void }) {
  return (
    <div className="flex-1 flex flex-col justify-center items-center text-center animate-entrance">
      <div className="size-14 rounded-full bg-destructive/15 border border-destructive/40 mb-4 flex items-center justify-center">
        <span className="text-destructive text-lg">!</span>
      </div>
      <h3 className="text-lg font-bold tracking-tight mb-2">Camera unavailable</h3>
      <p className="text-xs text-muted-foreground max-w-[28ch]">
        {message ?? "We couldn't access your camera. Please check your browser permissions."}
      </p>
      <button
        onClick={onReset}
        className="mt-6 px-5 py-3 bg-primary text-primary-foreground font-bold uppercase tracking-[0.2em] text-[11px] rounded-xl"
      >
        Try again
      </button>
    </div>
  );
}
