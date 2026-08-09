import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { SyncIndicator } from "@/components/experience/SyncIndicator";
import {
  SPX_PROJECTS,
  fetchSharedSession,
  joinServerSession,
  trackAnalyticsEvent,
  useSharedSession,
} from "@/lib/experience-state";
import { readSessionTokenFromUrl, writePairingToken } from "@/lib/pairing";
import { isSessionBusy } from "@/lib/session-utils";

export const Route = createFileRoute("/phone")({ component: PhoneView });

function PhoneView() {
  const { session, update, reset, online, synced, syncError, clearSyncError } = useSharedSession();
  const { state, visitorName, visitorEmail, processedImage, capturedImage } = session;
  const souvenirImage = processedImage ?? capturedImage;

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

  const endSession = useCallback(() => {
    setSessionEnded(false);
    setSessionBusy(false);
    hadActiveSessionRef.current = false;
    void reset();
  }, [reset]);

  const retrySession = useCallback(() => {
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
  }, []);

  // On mobile we skip the LED flow entirely — once the visitor saves their
  // details we jump straight to the completed (business profile) view.
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback(
    (name: string, email: string) => {
      void update({ visitorName: name, visitorEmail: email, state: "completed" });
      setSubmitted(true);
    },
    [update],
  );

  const showCompleted = submitted || state === "completed";

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
          {joining && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <div className="size-8 animate-soft-pulse rounded-full border-2 border-primary border-t-transparent" />
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Connecting…</p>
            </div>
          )}

          {invalidPairing && <InvalidPairingScreen />}
          {sessionBusy && !invalidPairing && <SessionBusyScreen onRetry={retrySession} />}
          {sessionEnded && !invalidPairing && <SessionEndedScreen onRestart={retrySession} />}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && !showCompleted && (
            <VisitorFormScreen
              initialName={visitorName}
              initialEmail={visitorEmail}
              onSubmit={handleSubmit}
            />
          )}

          {!joining && !sessionEnded && !sessionBusy && !invalidPairing && showCompleted && (
            <CompletedScreen visitorName={visitorName} souvenirImage={souvenirImage} onReset={endSession} />
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

function VisitorFormScreen({
  initialName,
  initialEmail,
  onSubmit,
}: {
  initialName: string;
  initialEmail: string;
  onSubmit: (name: string, email: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);

  return (
    <div className="flex flex-1 flex-col justify-center animate-entrance">
      <StepChip step="Welcome" title="Register your visit." subtitle="Enter your details to log your visit and explore SPX." />
      <div className="glass-panel glow-primary mb-4 rounded-2xl p-5 space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value.slice(0, 48))}
          placeholder="Your name (optional)"
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email address (optional)"
          style={{ fontSize: "16px" }}
          className="w-full rounded-xl border border-border bg-background/60 px-4 py-3 text-sm placeholder:text-muted-foreground focus:border-primary/60 focus:outline-none"
        />
      </div>
      <button
        onClick={() => onSubmit(name, email)}
        className="w-full rounded-xl bg-primary py-4 text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98]"
      >
        Save &amp; Continue
      </button>
    </div>
  );
}

function CompletedScreen({
  visitorName,
  souvenirImage,
  onReset,
}: {
  visitorName: string;
  souvenirImage: string | null;
  onReset: () => void;
}) {
  const [overlay, setOverlay] = useState<"projects" | "contact" | null>(null);

  return (
    <div className="flex flex-1 flex-col animate-entrance">
      <StepChip
        step="Welcome"
        title={visitorName ? `Welcome, ${visitorName}.` : "Welcome to SPX."}
        subtitle="Explore our business below."
      />

      {souvenirImage && (
        <div className="relative mb-4 min-h-[220px] overflow-hidden rounded-2xl ring-2 ring-primary/30">
          <img src={souvenirImage} alt="Souvenir" className="absolute inset-0 size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
          <div className="absolute inset-x-4 bottom-4">
            <span className="block font-mono text-[9px] uppercase tracking-[0.3em] text-primary">Souvenir</span>
            <span className="text-lg font-bold italic tracking-tight">SPX / {new Date().toLocaleDateString()}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {souvenirImage && (
          <a
            href={souvenirImage}
            download={`spx-souvenir-${Date.now()}.jpg`}
            className="w-full rounded-xl bg-primary py-4 text-center text-xs font-bold uppercase tracking-[0.2em] text-primary-foreground transition-all hover:brightness-110"
          >
            Save souvenir photo
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


