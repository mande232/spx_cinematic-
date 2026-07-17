import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ExperienceProgress } from "@/components/experience/ExperienceProgress";
import { SyncIndicator } from "@/components/experience/SyncIndicator";
import {
  CHAPTERS,
  SPX_PROJECTS,
  fetchSharedSession,
  joinServerSession,
  trackAnalyticsEvent,
  useSharedSession,
} from "@/lib/experience-state";
import type { ExperienceState } from "@/lib/experience-state";
import { readSessionTokenFromUrl, writePairingToken } from "@/lib/pairing";
import { getPhoneStepIndex, isSessionBusy } from "@/lib/session-utils";

export const Route = createFileRoute("/phone")({ component: PhoneView });

function PhoneView() {
  const { session, update, reset, online, synced, syncError, clearSyncError } = useSharedSession();
  const { state, capturedImage, processedImage, visitorName, chapterIndex, consentGiven } = session;

  const [countdown, setCountdown] = useState(3);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [invalidPairing, setInvalidPairing] = useState(false);
  const [joining, setJoining] = useState(true);
  const hadActiveSessionRef = useRef(false);
  const bootstrappedRef = useRef(false);
  const urlTokenRef = useRef(readSessionTokenFromUrl());

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    const token = urlTokenRef.current;
    if (!token) {
      setJoining(false);
      setInvalidPairing(true);
      return;
    }

    writePairingToken(token);
    void joinServerSession(token).then((result) => {
      setJoining(false);
      if (result.error === "invalid_pairing") {
        setInvalidPairing(true);
        return;
      }
      if (result.error === "session_busy") {
        setSessionBusy(true);
        return;
      }
      if (result.session) {
        void trackAnalyticsEvent("phone_joined", { token });
      }
    });
  }, []);

  useEffect(() => {
    if (!sessionBusy) return;
    const id = setInterval(() => {
      void fetchSharedSession().then((envelope) => {
        if (!envelope) return;
        if (envelope.session.state === "idle" || envelope.session.state === "completed") {
          setSessionBusy(false);
          if (urlTokenRef.current) {
            void joinServerSession(urlTokenRef.current).then((result) => {
              if (!result.error && result.session) {
                void trackAnalyticsEvent("phone_rejoined", {});
              }
            });
          }
        }
      });
    }, 2000);
    return () => clearInterval(id);
  }, [sessionBusy]);

  useEffect(() => {
    if (hadActiveSessionRef.current) return;
    if (isSessionBusy(state)) {
      setSessionBusy(true);
    }
  }, [state]);

  useEffect(() => {
    if (state !== "idle" && !isSessionBusy(state)) {
      hadActiveSessionRef.current = true;
      setSessionEnded(false);
      setSessionBusy(false);
    }
    if (state === "idle" && hadActiveSessionRef.current) {
      setSessionEnded(true);
    }
  }, [state]);

  // A rejected write usually means our pairing token went stale (e.g. the
  // wall reset the session). Try rejoining with the URL token once; if that
  // also fails, ask the visitor to rescan the QR code.
  const rejoiningRef = useRef(false);
  useEffect(() => {
    if (syncError !== "invalid_pairing" || rejoiningRef.current) return;
    rejoiningRef.current = true;

    const token = urlTokenRef.current;
    if (!token) {
      setInvalidPairing(true);
      rejoiningRef.current = false;
      return;
    }

    void joinServerSession(token).then((result) => {
      rejoiningRef.current = false;
      clearSyncError();
      if (result.error === "invalid_pairing") {
        setInvalidPairing(true);
        return;
      }
      if (result.error === "session_busy") {
        setSessionBusy(true);
      }
    });
  }, [syncError, clearSyncError]);

  // Mirror the LED-wall countdown locally for remote UI feedback.
  useEffect(() => {
    if (state !== "countdown") {
      setCountdown(3);
      return;
    }
    setCountdown(3);
    let remaining = 3;
    const timer = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        window.clearInterval(timer);
        setCountdown(0);
        return;
      }
      setCountdown(remaining);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [state]);

  const confirmPortrait = useCallback(() => {
    if (!capturedImage) return;
    update({ state: "processing" });
    void trackAnalyticsEvent("portrait_confirmed", {});
  }, [capturedImage, update]);

  const retakePortrait = useCallback(() => {
    update({ state: "camera_ready", capturedImage: null, processedImage: null });
  }, [update]);

  const endSession = useCallback(() => {
    setErrorMessage(null);
    setSessionEnded(false);
    setSessionBusy(false);
    hadActiveSessionRef.current = false;
    void reset();
  }, [reset]);

  const retrySession = useCallback(() => {
    setErrorMessage(null);
    setSessionEnded(false);
    setSessionBusy(false);
    void fetchSharedSession().then((envelope) => {
      if (envelope && isSessionBusy(envelope.session.state)) {
        setSessionBusy(true);
        return;
      }
      const token = urlTokenRef.current;
      if (token) {
        void joinServerSession(token).then((result) => {
          if (result.error === "session_busy") setSessionBusy(true);
        });
      }
    });
  }, [update]);

  const activeChapter = CHAPTERS[Math.min(chapterIndex, CHAPTERS.length - 1)];
  const reviewing = state === "capturing" && Boolean(capturedImage);
  const stepIndex = getPhoneStepIndex(state, reviewing);

  return (
    <div className="min-h-screen bg-background text-foreground font-display dark">
      <div className="mx-auto flex min-h-screen max-w-md flex-col">
        <header className="flex items-center justify-between border-b border-border/50 px-5 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary font-mono text-[10px] font-bold tracking-tighter text-primary-foreground">
              SPX
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Cinematic Welcome</p>
              <p className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground">Mobile experience</p>
            </div>
          </div>
          <SyncIndicator online={online} synced={synced} />
        </header>

        <div className="flex flex-1 flex-col px-4 pb-8 pt-4">
          {!joining && !sessionEnded && !sessionBusy && (
            <ExperienceProgress activeIndex={stepIndex} />
          )}

          {joining && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="size-8 animate-soft-pulse rounded-full border-2 border-primary border-t-transparent" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Connecting to LED…</p>
            </div>
          )}

          {invalidPairing && <InvalidPairingScreen />}
          {sessionBusy && !invalidPairing && <SessionBusyScreen onRetry={retrySession} />}
          {sessionEnded && !invalidPairing && <SessionEndedScreen onRestart={retrySession} />}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && reviewing && (
            <ReviewScreen image={capturedImage!} onRetake={retakePortrait} onConfirm={confirmPortrait} />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !reviewing && (state === "idle" || state === "scanned") && (
            <ScannedScreen
              visitorName={visitorName}
              consentGiven={consentGiven}
              setVisitorName={(v) => update({ visitorName: v })}
              setConsentGiven={(v) => update({ consentGiven: v })}
              onNext={() => update({ state: "camera_ready" })}
            />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !reviewing && (state === "camera_ready" || state === "countdown" || state === "capturing") && (
            <RemoteCameraScreen
              state={state}
              countdown={countdown}
              onCapture={() => update({ state: "countdown" })}
            />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !reviewing && (state === "processing" || state === "rendering") && (
            <ProcessingScreen state={state} capturedImage={processedImage ?? capturedImage} />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !reviewing && state === "playing" && (
            <PlayingScreen activeChapter={activeChapter} visitorName={visitorName} />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !reviewing && state === "completed" && (
            <CompletedScreen
              visitorName={visitorName}
              capturedImage={processedImage ?? capturedImage}
              onReset={endSession}
            />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !reviewing && state === "error" && (
            <ErrorScreen message={errorMessage} onReset={retrySession} />
          )}
        </div>
      </div>
    </div>
  );
}

function StepChip({ step, title, subtitle }: { step: string; title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <span className="font-mono text-[10px] uppercase tracking-widest text-primary">{step}</span>
      <h3 className="mt-1 text-2xl font-bold tracking-tight text-balance leading-tight">{title}</h3>
      {subtitle && <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

function InvalidPairingScreen() {
  return (
    <div className="flex flex-1 flex-col justify-center animate-entrance">
      <StepChip
        step="Invalid link"
        title="This QR code is not valid."
        subtitle="Scan the code displayed on the LED wall to join the current session."
      />
    </div>
  );
}

function SessionBusyScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center animate-entrance">
      <StepChip
        step="Please wait"
        title="Another visitor is on screen."
        subtitle="The LED presentation is currently in progress. You can try again when the session ends."
      />
      <button
        onClick={onRetry}
        className="w-full rounded-xl bg-primary py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110"
      >
        Check again
      </button>
    </div>
  );
}

function SessionEndedScreen({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="flex flex-1 flex-col justify-center animate-entrance">
      <StepChip
        step="Session ended"
        title="The LED wall has reset."
        subtitle="This visit has finished or timed out. Start again when you are ready."
      />
      <button
        onClick={onRestart}
        className="w-full rounded-xl bg-primary py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110"
      >
        Start new visit
      </button>
    </div>
  );
}

function ScannedScreen({
  visitorName,
  consentGiven,
  setVisitorName,
  setConsentGiven,
  onNext,
}: {
  visitorName: string;
  consentGiven: boolean;
  setVisitorName: (v: string) => void;
  setConsentGiven: (v: boolean) => void;
  onNext: () => void;
}) {
  // Keep typing local; sync to the shared session only after a pause so each
  // keystroke doesn't trigger a server write (and can't be clobbered by one).
  const [localName, setLocalName] = useState(visitorName);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localNameRef = useRef(localName);
  localNameRef.current = localName;

  useEffect(() => () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
  }, []);

  const handleNameChange = (value: string) => {
    const next = value.slice(0, 24);
    setLocalName(next);
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => setVisitorName(localNameRef.current), 600);
  };

  const handleNext = () => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    if (localName !== visitorName) setVisitorName(localName);
    onNext();
  };

  return (
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip
        step="Step 01"
        title="Welcome to SPX."
        subtitle="You're connected to the LED wall. Add your name if you'd like it on screen, then enable your camera."
      />
      <div className="glass-panel glow-primary mb-5 rounded-2xl p-5">
        <label className="mb-2 block font-mono text-[9px] uppercase tracking-widest text-primary">Optional</label>
        <p className="mb-3 text-sm text-muted-foreground">What should we call you on screen?</p>
        <input
          value={localName}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={() => {
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
            if (localName !== visitorName) setVisitorName(localName);
          }}
          placeholder="Your first name"
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
        />
      </div>
      <label className="mb-5 flex items-start gap-3 rounded-xl border border-border bg-background/40 p-4">
        <input
          type="checkbox"
          checked={consentGiven}
          onChange={(e) => setConsentGiven(e.target.checked)}
          className="mt-1 size-4 rounded border-border"
        />
        <span className="text-xs leading-relaxed text-muted-foreground">
          I consent to my portrait being captured, displayed on the LED wall, and stored in the visitor log for this reception experience.
        </span>
      </label>
      <button
        onClick={handleNext}
        disabled={!consentGiven}
        className="w-full rounded-xl bg-primary py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50"
      >
        Prepare LED camera
      </button>
      <p className="mt-4 text-center font-mono text-[10px] leading-relaxed text-muted-foreground">
        The camera mounted at the LED wall takes your photo. This phone is only your remote and review screen.
      </p>
    </div>
  );
}

function RemoteCameraScreen({
  state,
  countdown,
  onCapture,
}: {
  state: ExperienceState;
  countdown: number;
  onCapture: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip
        step={state === "countdown" || state === "capturing" ? "Hold still" : "Step 02"}
        title={state === "countdown" ? "LED camera is counting down…" : state === "capturing" ? "Photo captured." : "Position yourself at the LED wall."}
        subtitle={state === "camera_ready" ? "Look at the camera mounted above the display, then trigger it here." : "Keep looking at the LED camera."}
      />
      <div className="relative mb-5 flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-muted/30">
        <div className="absolute inset-6 rounded-2xl border border-dashed border-primary/30" />
        <div className="relative flex flex-col items-center gap-4 text-center">
          <div className="flex size-24 items-center justify-center rounded-full border border-primary/40 bg-primary/10">
            <span className="text-4xl" aria-hidden="true">◉</span>
          </div>
          <div>
            <span className="block font-mono text-[9px] uppercase tracking-[0.25em] text-primary">LED wall camera</span>
            <span className="mt-1 block text-sm text-muted-foreground">
              {state === "camera_ready" ? "Ready for remote trigger" : state === "countdown" ? "Capturing in a moment" : "Sending preview to this phone"}
            </span>
          </div>
        </div>
        {state === "countdown" && (
          <div className="absolute right-4 top-4 flex size-12 items-center justify-center rounded-full border border-primary/40 bg-background/80">
            <span className="font-mono text-lg font-bold text-primary">{countdown}</span>
          </div>
        )}
      </div>
      {state === "camera_ready" ? (
        <button
          onClick={onCapture}
          className="w-full rounded-xl bg-primary py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
        >
          Take photo on LED camera
        </button>
      ) : (
        <div className="w-full rounded-xl bg-muted/30 py-4 text-center">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {state === "capturing" ? "Waiting for photo preview…" : "Please hold still and watch the wall"}
          </span>
        </div>
      )}
    </div>
  );
}

function ReviewScreen({
  image,
  onRetake,
  onConfirm,
}: {
  image: string;
  onRetake: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip step="Review" title="Happy with this portrait?" subtitle="You'll appear on the LED wall with this image." />
      <div className="relative mb-5 min-h-[320px] overflow-hidden rounded-2xl ring-2 ring-primary/40">
        <img src={image} alt="Your portrait preview" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4">
          <span className="font-mono text-[9px] uppercase tracking-widest text-primary">Preview</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onRetake}
          className="rounded-xl border border-border py-4 text-xs font-bold uppercase tracking-[0.15em] transition-colors hover:bg-muted/30"
        >
          Retake
        </button>
        <button
          onClick={onConfirm}
          className="rounded-xl bg-primary py-4 text-xs font-bold uppercase tracking-[0.15em] text-primary-foreground transition-all hover:brightness-110"
        >
          Use photo
        </button>
      </div>
    </div>
  );
}

function ProcessingScreen({ state, capturedImage }: { state: ExperienceState; capturedImage: string | null }) {
  const progress = state === "processing" ? 45 : 88;
  return (
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip
        step={state === "processing" ? "Step 03" : "Step 04"}
        title={state === "processing" ? "Composing your portrait…" : "Assembling your cinematic scenes."}
        subtitle="Watch the LED wall — you're being placed inside the story."
      />
      <div className="relative mb-5 min-h-[260px] overflow-hidden rounded-2xl bg-black ring-1 ring-primary/20">
        {capturedImage && <img src={capturedImage} alt="You" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-x-4 bottom-4 space-y-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-between font-mono text-[9px] uppercase tracking-widest text-white/70">
            <span>{state === "processing" ? "Isolating subject" : "Rendering scenes"}</span>
            <span className="text-primary">{progress}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayingScreen({
  activeChapter,
  visitorName,
}: {
  activeChapter: { id: string; title: string; caption: string; image: string };
  visitorName: string;
}) {
  return (
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip
        step="Step 04"
        title={visitorName ? `${visitorName}, you're on the wall.` : "You're on the wall."}
        subtitle="Look up at the LED screen for your cinematic moment."
      />
      <div className="relative mb-5 min-h-[240px] overflow-hidden rounded-2xl ring-1 ring-primary/30">
        <div
          className="absolute inset-0 animate-kenburns"
          style={{ backgroundImage: `url(${activeChapter.image})`, backgroundSize: "cover", backgroundPosition: "center" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-primary">Chapter {activeChapter.id}</span>
          <span className="text-xl font-bold italic tracking-tight">{activeChapter.title}</span>
          <p className="mt-1 text-xs text-white/75">{activeChapter.caption}</p>
        </div>
      </div>
      <div className="rounded-xl border border-primary/30 bg-primary/10 py-4 text-center">
        <span className="font-mono text-[10px] uppercase tracking-widest text-primary">Live on the LED wall</span>
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
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip
        step="All done"
        title={visitorName ? `Thank you, ${visitorName}.` : "Thank you for stepping in."}
        subtitle="Take a souvenir and explore SPX below."
      />
      <div className="relative mb-5 min-h-[220px] overflow-hidden rounded-2xl ring-2 ring-primary/30">
        {capturedImage && <img src={capturedImage} alt="Souvenir" className="absolute inset-0 size-full object-cover" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-primary">Souvenir</span>
          <span className="text-lg font-bold italic tracking-tight">SPX / {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {capturedImage && (
          <a
            href={capturedImage}
            download={`spx-souvenir-${Date.now()}.jpg`}
            className="w-full rounded-xl bg-primary py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110"
          >
            Save souvenir
          </a>
        )}
        <div className="glass-panel space-y-2 rounded-2xl p-3">
          <ActionLink href="https://spxafrica.com/" label="Visit SPX Website" icon="→" />
          <ActionLink href="/spx-company-profile.pdf" label="Download Company Profile" icon="↓" download />
          <ActionButton label="Explore Our Projects" icon="→" onClick={() => setOverlay("projects")} />
          <ActionButton label="Connect With SPX" icon="→" onClick={() => setOverlay("contact")} />
        </div>
        <button
          onClick={onReset}
          className="w-full rounded-xl border border-border py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:bg-muted/20"
        >
          End session
        </button>
      </div>

      {overlay && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={() => setOverlay(null)}>
          <div
            className="max-h-[80vh] w-full max-w-md animate-entrance overflow-y-auto rounded-t-2xl border border-border bg-surface p-5 pb-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-widest text-primary">
                {overlay === "projects" ? "Our Projects" : "Connect With SPX"}
              </span>
              <button type="button" onClick={() => setOverlay(null)} className="text-xl leading-none text-muted-foreground">×</button>
            </div>
            {overlay === "projects" && (
              <div className="space-y-3">
                {SPX_PROJECTS.map((p) => (
                  <div key={p.title} className="glass-panel rounded-xl p-3">
                    <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-primary">{p.category}</span>
                    <p className="text-sm font-semibold">{p.title}</p>
                    <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{p.desc}</p>
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
                  <div key={c.label} className="glass-panel rounded-xl px-4 py-3">
                    <span className="mb-1 block font-mono text-[9px] uppercase tracking-widest text-primary">{c.label}</span>
                    {c.href ? (
                      <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-sm transition-colors hover:text-primary">
                        {c.value}
                      </a>
                    ) : (
                      <p className="text-sm">{c.value}</p>
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

function ActionLink({
  href,
  label,
  icon,
  download,
}: {
  href: string;
  label: string;
  icon: string;
  download?: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      download={download ? "SPX-Company-Profile.pdf" : undefined}
      className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-3 transition-colors hover:bg-muted/20"
    >
      <span className="text-[11px] font-medium tracking-tight">{label}</span>
      <span className="text-primary">{icon}</span>
    </a>
  );
}

function ActionButton({ label, icon, onClick }: { label: string; icon: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border/60 bg-background/40 px-3 py-3 text-left transition-colors hover:bg-muted/20"
    >
      <span className="text-[11px] font-medium tracking-tight">{label}</span>
      <span className="text-primary">{icon}</span>
    </button>
  );
}

function ErrorScreen({ message, onReset }: { message: string | null; onReset: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center animate-entrance">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full border border-destructive/40 bg-destructive/10">
        <span className="text-2xl text-destructive">!</span>
      </div>
      <h3 className="mb-2 text-xl font-bold tracking-tight">Camera unavailable</h3>
      <p className="max-w-[30ch] text-sm text-muted-foreground">
        {message ?? "We couldn't access your camera. Please check your browser permissions."}
      </p>
      <button
        onClick={onReset}
        className="mt-6 rounded-xl bg-primary px-6 py-3 text-[11px] font-bold uppercase tracking-[0.2em] text-primary-foreground"
      >
        Try again
      </button>
    </div>
  );
}
