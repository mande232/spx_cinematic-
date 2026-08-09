import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

import { QRCode } from "@/components/experience/QRCode";
import { SyncIndicator } from "@/components/experience/SyncIndicator";
import { CHAPTERS, getChapters, STATE_LABELS, trackAnalyticsEvent, useSharedSession } from "@/lib/experience-state";
import type { Chapter, ExperienceState } from "@/lib/experience-state";
import { compressPortrait } from "@/lib/image-utils";
import { getPhoneUrlFromToken } from "@/lib/pairing";

export const Route = createFileRoute("/")({ component: WallView });

const SESSION_TIMEOUT_MS = 90_000;
const COMPLETED_RESET_MS = 30_000;
const IDLE_MOTION_THRESHOLD = 8;
const IDLE_WAVE_PIXEL_THRESHOLD = 90;
const IDLE_WAVE_DELTA_THRESHOLD = 6;
const IDLE_WAVE_COOLDOWN_MS = 2000;
const OPEN_HAND_MIN_FRAMES = 2;
const HAND_WAVE_MIN_AMPLITUDE = 0.08;
const HAND_WAVE_MIN_DELTA = 0.012;
const HAND_WAVE_MIN_REVERSALS = 2;
const PLAYBACK_GESTURE_COOLDOWN_MS = 1200;
const AUDIO_URL =
  "https://res.cloudinary.com/djwboszae/video/upload/v1783506840/ElevenLabs_2026-07-08T10_28_27_Caty_-_Droll_Wry_and_Dry_pvc_s50_m2_rl2hy4.mp3";

const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function isOpenHandGesture(landmarks: Array<{ x: number; y: number }>) {
  if (landmarks.length < 21) return false;

  const fingerChains: Array<[number, number, number]> = [
    [8, 6, 5],
    [12, 10, 9],
    [16, 14, 13],
    [20, 18, 17],
  ];

  const extendedFingers = fingerChains.filter(([tip, pip, mcp]) => {
    return landmarks[tip].y < landmarks[pip].y && landmarks[pip].y < landmarks[mcp].y;
  }).length;

  const palmWidth = Math.abs(landmarks[5].x - landmarks[17].x);
  const thumbSpread = Math.hypot(
    landmarks[4].x - landmarks[5].x,
    landmarks[4].y - landmarks[5].y,
  );

  return extendedFingers >= 3 && palmWidth > 0.1 && thumbSpread > 0.08;
}

function isFistGesture(landmarks: Array<{ x: number; y: number }>) {
  if (landmarks.length < 21) return false;

  const fingerChains: Array<[number, number]> = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];

  const curledFingers = fingerChains.filter(([tip, pip]) => landmarks[tip].y > landmarks[pip].y).length;
  const thumbNearPalm = Math.hypot(
    landmarks[4].x - landmarks[9].x,
    landmarks[4].y - landmarks[9].y,
  ) < 0.16;

  return curledFingers >= 3 && thumbNearPalm;
}

function WallView() {
  const { session, update, reset, online, synced, pairingToken, maintenanceMode, chapterOverrides, storageShared } = useSharedSession();
  const { state, capturedImage, processedImage, visitorName, chapterIndex } = session;
  const displayImage = processedImage ?? capturedImage;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cameraRef = useRef<HTMLVideoElement | null>(null);
  const idleWallCameraRef = useRef<HTMLVideoElement | null>(null);
  const gestureVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const idleDetectionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackAudioStartedRef = useRef(false);
  const idleWaveRef = useRef<{
    rafId: number | null;
    previousSample: Uint8ClampedArray | null;
    previousCenterX: number | null;
    lastTriggerAt: number;
    handXs: number[];
    openHandFrames: number;
  }>({ rafId: null, previousSample: null, previousCenterX: null, lastTriggerAt: 0, handXs: [], openHandFrames: 0 });
  const playbackGestureRef = useRef<{
    rafId: number | null;
    openHandFrames: number;
    fistFrames: number;
    lastGestureAt: number;
  }>({ rafId: null, openHandFrames: 0, fistFrames: 0, lastGestureAt: 0 });
  const [phoneUrl, setPhoneUrl] = useState("/phone");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [wallCountdown, setWallCountdown] = useState(3);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [idleCameraReady, setIdleCameraReady] = useState(false);
  const [waveDetected, setWaveDetected] = useState(false);
  const [isNonLocalHost, setIsNonLocalHost] = useState(false);
  const [idleDebug, setIdleDebug] = useState({ changedPixels: 0, horizontalDelta: 0 });
  const [idleHandLandmarks, setIdleHandLandmarks] = useState<Array<{ x: number; y: number }>>([]);
  const [playbackPaused, setPlaybackPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
        );
        const handLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          },
          runningMode: "VIDEO",
          numHands: 1,
          minHandDetectionConfidence: 0.35,
          minHandPresenceConfidence: 0.35,
          minTrackingConfidence: 0.35,
        });

        if (!cancelled) {
          handLandmarkerRef.current = handLandmarker;
        }
      } catch {
        handLandmarkerRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      handLandmarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const configured = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined;
    const base = configured?.replace(/\/$/, "") ? `${configured.replace(/\/$/, "")}/phone` : `${window.location.origin}/phone`;
    setPhoneUrl(pairingToken ? getPhoneUrlFromToken(base, pairingToken) : base);
    setIsNonLocalHost(!["localhost", "127.0.0.1"].includes(window.location.hostname));

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

  const stopWallCamera = useCallback(() => {
    if (idleWaveRef.current.rafId) {
      window.cancelAnimationFrame(idleWaveRef.current.rafId);
      idleWaveRef.current.rafId = null;
    }
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    if (cameraRef.current) cameraRef.current.srcObject = null;
    if (idleWallCameraRef.current) idleWallCameraRef.current.srcObject = null;
    if (gestureVideoRef.current) gestureVideoRef.current.srcObject = null;
    idleWaveRef.current.previousSample = null;
    idleWaveRef.current.previousCenterX = null;
    idleWaveRef.current.handXs = [];
    idleWaveRef.current.openHandFrames = 0;
    if (playbackGestureRef.current.rafId) {
      window.cancelAnimationFrame(playbackGestureRef.current.rafId);
      playbackGestureRef.current.rafId = null;
    }
    playbackGestureRef.current.openHandFrames = 0;
    playbackGestureRef.current.fistFrames = 0;
    playbackAudioStartedRef.current = false;
    setIdleCameraReady(false);
    setWaveDetected(false);
    setIdleHandLandmarks([]);
    setPlaybackPaused(false);
  }, []);

  useEffect(() => () => stopWallCamera(), [stopWallCamera]);

  useEffect(() => {
    if (state !== "idle" && state !== "camera_ready" && state !== "countdown" && state !== "playing") {
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
        setIdleCameraReady(true);
        if (cameraRef.current) {
          cameraRef.current.srcObject = stream;
          await cameraRef.current.play().catch(() => undefined);
        }
        if (idleWallCameraRef.current) {
          idleWallCameraRef.current.srcObject = stream;
          await idleWallCameraRef.current.play().catch(() => undefined);
        }
        if (gestureVideoRef.current) {
          gestureVideoRef.current.srcObject = stream;
          await gestureVideoRef.current.play().catch(() => undefined);
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
    const stream = cameraStreamRef.current;
    if (!stream) return;

    if (cameraRef.current && cameraRef.current.srcObject !== stream) {
      cameraRef.current.srcObject = stream;
      void cameraRef.current.play().catch(() => undefined);
    }

    if (idleWallCameraRef.current && idleWallCameraRef.current.srcObject !== stream) {
      idleWallCameraRef.current.srcObject = stream;
      void idleWallCameraRef.current.play().catch(() => undefined);
    }

    if (gestureVideoRef.current && gestureVideoRef.current.srcObject !== stream) {
      gestureVideoRef.current.srcObject = stream;
      void gestureVideoRef.current.play().catch(() => undefined);
    }
  }, [state]);

  useEffect(() => {
    if (state !== "playing" || !gestureVideoRef.current) return;

    let cancelled = false;
    const video = gestureVideoRef.current;

    const detectPlaybackGesture = () => {
      if (cancelled || state !== "playing" || !gestureVideoRef.current) return;

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        playbackGestureRef.current.rafId = window.requestAnimationFrame(detectPlaybackGesture);
        return;
      }

      const handResult = handLandmarkerRef.current?.detectForVideo(video, Date.now());
      const landmarks = handResult?.landmarks?.[0]?.map((point) => ({ x: 1 - point.x, y: point.y })) ?? [];

      const openHandDetected = isOpenHandGesture(landmarks);
      const fistDetected = isFistGesture(landmarks);

      playbackGestureRef.current.openHandFrames = openHandDetected
        ? playbackGestureRef.current.openHandFrames + 1
        : 0;
      playbackGestureRef.current.fistFrames = fistDetected
        ? playbackGestureRef.current.fistFrames + 1
        : 0;

      const now = Date.now();
      if (now - playbackGestureRef.current.lastGestureAt > PLAYBACK_GESTURE_COOLDOWN_MS) {
        if (playbackGestureRef.current.openHandFrames >= 2 && !playbackPaused) {
          playbackGestureRef.current.lastGestureAt = now;
          setPlaybackPaused(true);
          void trackAnalyticsEvent("playback_gesture", { gesture: "open_palm_pause" });
        } else if (playbackGestureRef.current.fistFrames >= 2 && playbackPaused) {
          playbackGestureRef.current.lastGestureAt = now;
          setPlaybackPaused(false);
          void trackAnalyticsEvent("playback_gesture", { gesture: "fist_play" });
        }
      }

      playbackGestureRef.current.rafId = window.requestAnimationFrame(detectPlaybackGesture);
    };

    playbackGestureRef.current.rafId = window.requestAnimationFrame(detectPlaybackGesture);

    return () => {
      cancelled = true;
      if (playbackGestureRef.current.rafId) {
        window.cancelAnimationFrame(playbackGestureRef.current.rafId);
        playbackGestureRef.current.rafId = null;
      }
      playbackGestureRef.current.openHandFrames = 0;
      playbackGestureRef.current.fistFrames = 0;
    };
  }, [chapterIndex, playbackPaused, state, update]);

  useEffect(() => {
    if (state !== "idle" || !idleWallCameraRef.current) return;

    let cancelled = false;
    const video = idleWallCameraRef.current;
    const analysisCanvas = idleDetectionCanvasRef.current ?? document.createElement("canvas");
    idleDetectionCanvasRef.current = analysisCanvas;
    const context = analysisCanvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;

    const analyze = () => {
      if (cancelled || !idleWallCameraRef.current || state !== "idle") return;

      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        idleWaveRef.current.rafId = window.requestAnimationFrame(analyze);
        return;
      }

      const width = 160;
      const height = 90;
      analysisCanvas.width = width;
      analysisCanvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      const frame = context.getImageData(0, 0, width, height);
      const previous = idleWaveRef.current.previousSample;

      let changedPixels = 0;
      let xSum = 0;
      if (previous) {
        for (let i = 0; i < frame.data.length; i += 16) {
          const diff =
            Math.abs(frame.data[i] - previous[i]) +
            Math.abs(frame.data[i + 1] - previous[i + 1]) +
            Math.abs(frame.data[i + 2] - previous[i + 2]);
          if (diff > IDLE_MOTION_THRESHOLD) {
            changedPixels += 1;
            xSum += (i / 4) % width;
          }
        }
      }

      idleWaveRef.current.previousSample = new Uint8ClampedArray(frame.data);

      const handResult = handLandmarkerRef.current?.detectForVideo(video, Date.now());
      const landmarks =
        handResult?.landmarks?.[0]?.map((point) => ({ x: 1 - point.x, y: point.y })) ?? [];
      setIdleHandLandmarks(landmarks);

      const openHandDetected = isOpenHandGesture(landmarks);
      idleWaveRef.current.openHandFrames = openHandDetected
        ? idleWaveRef.current.openHandFrames + 1
        : 0;
      const openHandReady = idleWaveRef.current.openHandFrames >= OPEN_HAND_MIN_FRAMES;

      const trackedHandX =
        landmarks.length > 0
          ? landmarks.reduce((sum, point) => sum + point.x, 0) / landmarks.length
          : null;
      if (trackedHandX !== null && openHandReady) {
        idleWaveRef.current.handXs = [...idleWaveRef.current.handXs.slice(-9), trackedHandX];
      } else {
        idleWaveRef.current.handXs = [];
      }

      let landmarkWaveDetected = false;
      const xs = idleWaveRef.current.handXs;
      if (xs.length >= 4) {
        const amplitude = Math.max(...xs) - Math.min(...xs);
        let reversals = 0;
        let lastDirection = 0;
        for (let i = 1; i < xs.length; i += 1) {
          const delta = xs[i] - xs[i - 1];
          if (Math.abs(delta) < HAND_WAVE_MIN_DELTA) continue;
          const direction = delta > 0 ? 1 : -1;
          if (lastDirection !== 0 && direction !== lastDirection) reversals += 1;
          lastDirection = direction;
        }
        landmarkWaveDetected =
          openHandReady && amplitude >= HAND_WAVE_MIN_AMPLITUDE && reversals >= HAND_WAVE_MIN_REVERSALS;
      }

      if (changedPixels > IDLE_WAVE_PIXEL_THRESHOLD) {
        const centerX = xSum / Math.max(changedPixels, 1);
        const previousCenterX = idleWaveRef.current.previousCenterX;
        const horizontalDelta = previousCenterX === null ? 0 : Math.abs(centerX - previousCenterX);
        idleWaveRef.current.previousCenterX = centerX;
        const motionWaveDetected = openHandReady && horizontalDelta > IDLE_WAVE_DELTA_THRESHOLD;
        const detected = landmarkWaveDetected || motionWaveDetected;
        setWaveDetected(detected);
        setIdleDebug({ changedPixels, horizontalDelta: Number(horizontalDelta.toFixed(1)) });

        const now = Date.now();
        if (detected && now - idleWaveRef.current.lastTriggerAt > IDLE_WAVE_COOLDOWN_MS) {
          idleWaveRef.current.lastTriggerAt = now;
          update({ state: "camera_ready", consentGiven: true });
          void trackAnalyticsEvent("wall_wave_started", {
            trigger: landmarkWaveDetected ? "open_hand_wave" : "open_hand_motion_wave",
          });
          return;
        }
      } else {
        idleWaveRef.current.previousCenterX = null;
        setWaveDetected(landmarkWaveDetected);
        setIdleDebug({ changedPixels, horizontalDelta: 0 });
        if (!landmarks.length) setIdleHandLandmarks([]);

        const now = Date.now();
        if (landmarkWaveDetected && now - idleWaveRef.current.lastTriggerAt > IDLE_WAVE_COOLDOWN_MS) {
          idleWaveRef.current.lastTriggerAt = now;
          update({ state: "camera_ready", consentGiven: true });
          void trackAnalyticsEvent("wall_wave_started", { trigger: "landmark_wave" });
          return;
        }
      }

      idleWaveRef.current.rafId = window.requestAnimationFrame(analyze);
    };

    idleWaveRef.current.rafId = window.requestAnimationFrame(analyze);

    return () => {
      cancelled = true;
      if (idleWaveRef.current.rafId) {
        window.cancelAnimationFrame(idleWaveRef.current.rafId);
        idleWaveRef.current.rafId = null;
      }
      idleWaveRef.current.previousSample = null;
      idleWaveRef.current.previousCenterX = null;
      idleWaveRef.current.handXs = [];
      idleWaveRef.current.openHandFrames = 0;
      setWaveDetected(false);
      setIdleDebug({ changedPixels: 0, horizontalDelta: 0 });
      setIdleHandLandmarks([]);
    };
  }, [state, update]);

  useEffect(() => {
    if (state !== "camera_ready") return;
    const timer = window.setTimeout(() => {
      update({ state: "countdown" });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [state, update]);

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
        update({ capturedImage: portrait, processedImage: null, state: "processing" });
        void trackAnalyticsEvent("wall_camera_captured", {});
        stopWallCamera();
      })();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [state, stopWallCamera, update]);

  // Background removal is disabled for now — the raw capture is shown as-is.
  useEffect(() => {
    if (state !== "processing" || !capturedImage) return;
    const timer = window.setTimeout(() => {
      update({ processedImage: null, state: "rendering" });
      void trackAnalyticsEvent("portrait_processed", { method: "raw" });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [capturedImage, state, update]);

  useEffect(() => {
    if (state !== "rendering") return;
    const timer = window.setTimeout(() => {
      update({ state: "playing", chapterIndex: 0 });
      void trackAnalyticsEvent("playback_started", {});
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [state, update]);

  // One timer per chapter, keyed to the current chapter index. Duplicate
  // drivers (second tab, server echo) set the same next index, which is
  // idempotent — playback can never accelerate or "scratch".
  useEffect(() => {
    if (state !== "playing" || playbackPaused) return;

    const isLastChapter = chapterIndex >= CHAPTERS.length - 1;
    const timer = window.setTimeout(() => {
      if (isLastChapter) {
        update({ state: "completed" });
      } else {
        update({ chapterIndex: chapterIndex + 1 });
      }
    }, isLastChapter ? 4000 : 3200);

    return () => window.clearTimeout(timer);
  }, [state, chapterIndex, playbackPaused, update]);

  useEffect(() => {
    if (!audioRef.current) return;

    if (state === "playing") {
      if (!playbackPaused) {
        if (!playbackAudioStartedRef.current) {
          audioRef.current.currentTime = 0;
          playbackAudioStartedRef.current = true;
        }
        audioRef.current.play().catch(() => undefined);
      } else {
        audioRef.current.pause();
      }
      return;
    }

    audioRef.current.pause();
    playbackAudioStartedRef.current = false;
  }, [playbackPaused, state]);

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
  const meta = STATE_LABELS[state as ExperienceState] ?? { step: "01", label: "Idle", hint: "" };

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
        {storageShared === false && isNonLocalHost && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            <span className="font-mono text-[9px] uppercase tracking-widest text-destructive block mb-1">
              Shared storage not configured
            </span>
            <p className="text-muted-foreground">
              QR pairing will fail on this hosting because each server instance keeps its own session.
              Add an Upstash Redis database (env vars <code className="font-mono text-xs">UPSTASH_REDIS_REST_URL</code> and{" "}
              <code className="font-mono text-xs">UPSTASH_REDIS_REST_TOKEN</code>) and redeploy.
            </p>
          </div>
        )}
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
          idleWallCameraRef={idleWallCameraRef}
          countdown={wallCountdown}
          cameraError={cameraError}
          idleCameraReady={idleCameraReady}
          waveDetected={waveDetected}
          idleDebug={idleDebug}
          idleHandLandmarks={idleHandLandmarks}
          playbackPaused={playbackPaused}
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
       
      </footer>

      <audio ref={audioRef} src={AUDIO_URL} preload="auto" />
      <canvas ref={captureCanvasRef} className="hidden" aria-hidden="true" />
      <video ref={gestureVideoRef} className="hidden" playsInline muted aria-hidden="true" />
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
  idleWallCameraRef,
  countdown,
  cameraError,
  idleCameraReady,
  waveDetected,
  idleDebug,
  idleHandLandmarks,
  playbackPaused,
}: {
  state: ExperienceState;
  chapter: Chapter;
  chapterIndex: number;
  capturedImage: string | null;
  visitorName: string;
  phoneUrl: string;
  cameraRef: React.RefObject<HTMLVideoElement | null>;
  idleWallCameraRef: React.RefObject<HTMLVideoElement | null>;
  countdown: number;
  cameraError: string | null;
  idleCameraReady: boolean;
  waveDetected: boolean;
  idleDebug: { changedPixels: number; horizontalDelta: number };
  idleHandLandmarks: Array<{ x: number; y: number }>;
  playbackPaused: boolean;
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
      {isIdle && (
        <video
          ref={idleWallCameraRef}
          className="absolute inset-0 size-full -scale-x-100 object-cover opacity-20 mix-blend-screen"
          playsInline
          muted
        />
      )}
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
            visitorName={visitorName}
            idleCameraReady={idleCameraReady}
            waveDetected={waveDetected}
            idleDebug={idleDebug}
            idleHandLandmarks={idleHandLandmarks}
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
        {state === "playing" && <PlayingLedContent chapter={chapter} capturedImage={capturedImage} playbackPaused={playbackPaused} />}
        {state === "completed" && <CompletedLedContent visitorName={visitorName} phoneUrl={phoneUrl} />}
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
  visitorName,
  idleCameraReady,
  waveDetected,
  idleDebug,
  idleHandLandmarks,
}: {
  scanned: boolean;
  visitorName: string;
  idleCameraReady: boolean;
  waveDetected: boolean;
  idleDebug: { changedPixels: number; horizontalDelta: number };
  idleHandLandmarks: Array<{ x: number; y: number }>;
}) {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8 md:flex-row md:items-center md:justify-between md:gap-12">
      {/* Left — welcome + demo */}
      <div className="led-copy-panel w-full max-w-md animate-entrance rounded-2xl p-6 text-center md:text-left">
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-primary">
          {scanned ? "Connected" : "Welcome to SPX"}
        </span>
        <h1 className="led-text-shadow mt-3 text-3xl font-extrabold uppercase italic tracking-[-0.04em] text-foreground md:text-4xl">
          Step into <span className="text-primary"> the story.</span>
        </h1>
        {scanned ? (
          <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-primary">
            {visitorName ? `${visitorName} connected` : "Phone connected"} — continue on your device
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
          </p>
        )}
        {/* <div className="mt-6 flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-[0.14em]">
          <span className={`rounded-full border px-3 py-2 ${idleCameraReady ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            {idleCameraReady ? "Camera ready" : "Preparing camera"}
          </span>
          <span className={`rounded-full border px-3 py-2 ${waveDetected ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
            {waveDetected ? "Wave detected" : "Awaiting wave"}
          </span>
        </div> */}
      </div>

      <div className="w-full max-w-[280px] shrink-0 animate-entrance rounded-[2rem] border border-primary/20 bg-gradient-to-b from-background/80 to-black/40 p-5 text-center shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur-sm">
        <div className="rounded-2xl border border-primary/15 bg-black/25 p-4 text-left">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-primary/15 bg-[radial-gradient(circle_at_top,rgba(92,190,255,0.16),transparent_55%),rgba(0,0,0,0.35)]">
            <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {HAND_CONNECTIONS.map(([from, to]) => {
                const start = idleHandLandmarks[from];
                const end = idleHandLandmarks[to];
                if (!start || !end) return null;
                return (
                  <line
                    key={`${from}-${to}`}
                    x1={start.x * 100}
                    y1={start.y * 100}
                    x2={end.x * 100}
                    y2={end.y * 100}
                    stroke="rgba(92, 190, 255, 0.9)"
                    strokeWidth="0.7"
                  />
                );
              })}
              {idleHandLandmarks.map((point, index) => (
                <circle
                  key={index}
                  cx={point.x * 100}
                  cy={point.y * 100}
                  r={index === 0 ? 1.7 : 1.2}
                  fill={index === 0 ? "rgba(255, 170, 70, 0.98)" : "rgba(92, 190, 255, 0.98)"}
                />
              ))}
            </svg>
            {idleHandLandmarks.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center px-4 text-center font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">
                Open palm + wave
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/55">
            <span className={`h-1.5 w-1.5 rounded-full ${idleHandLandmarks.length > 0 ? "bg-primary" : "bg-white/20"}`} />
            {idleHandLandmarks.length > 0 ? "Hand in frame" : "Waiting for hand"}
          </div>
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
       
      </div>
    </div>
  );
}

function PlayingLedContent({
  chapter,
  capturedImage,
  playbackPaused,
}: {
  chapter: Chapter;
  capturedImage: string | null;
  playbackPaused: boolean;
}) {
  return (
    <>
      {capturedImage && (
        <div className="absolute left-2 top-1/2 z-20 -translate-y-1/2 animate-entrance md:left-6">
          <div className="size-36 overflow-hidden rounded-full border-2 border-primary/50 bg-black/40 shadow-[0_14px_36px_rgba(0,0,0,0.5)] md:size-52 lg:size-64">
            <img src={capturedImage} alt="Visitor" className="size-full object-cover" />
          </div>
        </div>
      )}
      <div className="absolute right-6 md:right-12 top-1/2 -translate-y-1/2 z-20 text-right max-w-xs animate-entrance">
        <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-primary block mb-2">Chapter {chapter.id}</span>
        <h2 className="led-text-shadow text-2xl font-bold italic tracking-[-0.04em] text-foreground md:text-[2.5rem]">{chapter.title}</h2>
        <p className="mt-2 text-pretty text-xs leading-5 text-muted-foreground md:text-sm">{chapter.caption}</p>
        {playbackPaused && (
          <div className="mt-4 inline-flex rounded-full border border-primary/30 bg-black/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
            Paused
          </div>
        )}
      </div>
      <div className="absolute bottom-8 right-6 z-30 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-right backdrop-blur-md md:right-12">
        <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/65">Gestures</div>
        <div className="mt-2 space-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/80">
          <div>✋ Open Palm · Pause</div>
          <div>✊ Fist · Play</div>
        </div>
      </div>
    </>
  );
}

function CompletedLedContent({ visitorName, phoneUrl }: { visitorName: string; phoneUrl: string }) {
  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-8 text-center animate-entrance md:flex-row md:items-center md:justify-between md:gap-12 md:text-left">
      <div>
        <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.34em] text-primary block mb-4">The film is yours</span>
        <h1 className="led-text-shadow text-4xl font-extrabold uppercase italic leading-none tracking-[-0.05em] text-foreground md:text-6xl">
          Thank you
          {visitorName ? (
            <>
              ,
              <br />
              <span className="text-primary">{visitorName}.</span>
            </>
          ) : (
            <>
              <br />
              <span className="text-primary">for visiting SPX.</span>
            </>
          )}
        </h1>
        <p className="mt-5 max-w-xl text-sm text-muted-foreground md:text-base">
          For your experience, scan and download your file here.
        </p>
      </div>

      <div className="w-full max-w-[320px] shrink-0">
        <div className="rounded-[1.75rem] bg-white p-3 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.3)] ring-1 ring-black/5">
          <div className="overflow-hidden rounded-[1.25rem]">
            <QRCode value={phoneUrl} size={280} className="size-full object-contain" />
          </div>
        </div>
        <a
          href={phoneUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 block rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-primary transition-colors hover:bg-primary/15"
        >
          Demo mobile view
        </a>
        <p className="mt-4 text-center font-mono text-[10px] uppercase tracking-[0.24em] text-primary">
          Scan to download your experience
        </p>
      </div>
    </div>
  );
}