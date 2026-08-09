import os
import time
from collections import deque
from dataclasses import dataclass
from enum import Enum, auto
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


CAMERA_INDEX = 0
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720

WAVE_WINDOW_SECONDS = 1.4
WAVE_MIN_REVERSALS = 2
WAVE_MIN_AMPLITUDE_PX = 120
WAVE_COOLDOWN_SECONDS = 2.0

SWIPE_WINDOW_SECONDS = 0.45
SWIPE_MIN_DISTANCE_PX = 150
SWIPE_COOLDOWN_SECONDS = 0.9

REGISTRATION_SECONDS = 3.0
THANK_YOU_SECONDS = 4.0

MAX_HANDS = 1
MIN_DETECTION_CONFIDENCE = 0.55
MIN_TRACKING_CONFIDENCE = 0.55

VIDEOS_DIR = Path("videos")
WINDOW_DEBUG = "SPX Gesture Debug"
WINDOW_WALL = "SPX LED Wall"


class ExperienceState(Enum):
    IDLE = auto()
    TRIGGERED = auto()
    REGISTRATION = auto()
    PLAYBACK = auto()
    THANK_YOU = auto()


@dataclass
class HandSample:
    t: float
    x: float
    y: float


class GestureHistory:
    def __init__(self):
        self.samples: deque[HandSample] = deque()

    def add(self, sample: HandSample):
        self.samples.append(sample)
        self.trim(sample.t, max(WAVE_WINDOW_SECONDS, SWIPE_WINDOW_SECONDS) + 0.2)

    def trim(self, now: float, window_seconds: float):
        while self.samples and now - self.samples[0].t > window_seconds:
            self.samples.popleft()

    def recent(self, now: float, window_seconds: float) -> list[HandSample]:
        self.trim(now, window_seconds)
        return [s for s in self.samples if now - s.t <= window_seconds]


class VideoPlaylist:
    def __init__(self, directory: Path):
        self.files = sorted([p for p in directory.glob("*.mp4")]) if directory.exists() else []
        self.index = 0
        self.capture = None
        self.placeholder_hue = 0

    def _open_current(self):
        if self.capture is not None:
            self.capture.release()
            self.capture = None
        if self.files:
            self.capture = cv2.VideoCapture(str(self.files[self.index]))

    def start(self):
        self.index = 0
        self._open_current()

    def next(self):
        if not self.files:
            self.placeholder_hue = (self.placeholder_hue + 35) % 180
            return
        self.index = (self.index + 1) % len(self.files)
        self._open_current()

    def prev(self):
        if not self.files:
            self.placeholder_hue = (self.placeholder_hue - 35) % 180
            return
        self.index = (self.index - 1) % len(self.files)
        self._open_current()

    def current_label(self) -> str:
        if self.files:
            return self.files[self.index].stem
        return f"Placeholder {self.placeholder_hue}"

    def read_frame(self, width: int = 1280, height: int = 720):
        if self.capture is None and self.files:
            self._open_current()

        if self.capture is not None:
            ok, frame = self.capture.read()
            if not ok:
                self.capture.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ok, frame = self.capture.read()
            if ok:
                return cv2.resize(frame, (width, height))

        hsv = np.zeros((height, width, 3), dtype=np.uint8)
        hsv[:, :, 0] = self.placeholder_hue
        hsv[:, :, 1] = 170
        hsv[:, :, 2] = 70
        frame = cv2.cvtColor(hsv, cv2.COLOR_HSV2BGR)
        cv2.putText(frame, self.current_label(), (70, height // 2), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 255), 4, cv2.LINE_AA)
        return frame

    def close(self):
        if self.capture is not None:
            self.capture.release()


class GestureWallApp:
    def __init__(self):
        self.state = ExperienceState.IDLE
        self.state_since = time.time()
        self.last_wave_at = 0.0
        self.last_swipe_at = 0.0
        self.history = GestureHistory()
        self.last_event = "none"
        self.last_swipe = "none"
        self.hand_visible = False
        self.playlist = VideoPlaylist(VIDEOS_DIR)

        self.mp_hands = mp.solutions.hands
        self.mp_draw = mp.solutions.drawing_utils
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=MAX_HANDS,
            min_detection_confidence=MIN_DETECTION_CONFIDENCE,
            min_tracking_confidence=MIN_TRACKING_CONFIDENCE,
        )

    def set_state(self, state: ExperienceState):
        self.state = state
        self.state_since = time.time()
        print(f"STATE -> {state.name}")
        if state == ExperienceState.PLAYBACK:
            self.playlist.start()

    def emit_event(self, name: str, payload: dict | None = None):
        payload = payload or {}
        print(f"EVENT {name}: {payload}")  # >>> INTEGRATION POINT

    def detect_wave(self, now: float) -> bool:
        samples = self.history.recent(now, WAVE_WINDOW_SECONDS)
        if len(samples) < 4:
            return False

        xs = [s.x for s in samples]
        amplitude = max(xs) - min(xs)
        if amplitude < WAVE_MIN_AMPLITUDE_PX:
            return False

        reversals = 0
        last_direction = 0
        for i in range(1, len(xs)):
            delta = xs[i] - xs[i - 1]
            if abs(delta) < 6:
                continue
            direction = 1 if delta > 0 else -1
            if last_direction != 0 and direction != last_direction:
                reversals += 1
            last_direction = direction

        return reversals >= WAVE_MIN_REVERSALS

    def detect_swipe(self, now: float):
        samples = self.history.recent(now, SWIPE_WINDOW_SECONDS)
        if len(samples) < 2:
            return None
        distance = samples[-1].x - samples[0].x
        if abs(distance) < SWIPE_MIN_DISTANCE_PX:
            return None
        return "right" if distance > 0 else "left"

    def handle_tracking(self, now: float):
        if self.state == ExperienceState.IDLE:
            if now - self.last_wave_at > WAVE_COOLDOWN_SECONDS and self.detect_wave(now):
                self.last_wave_at = now
                self.last_event = "wave-start"
                self.emit_event("WAVE_START", {})  # >>> INTEGRATION POINT
                self.set_state(ExperienceState.TRIGGERED)
        elif self.state == ExperienceState.PLAYBACK:
            if now - self.last_swipe_at > SWIPE_COOLDOWN_SECONDS:
                swipe = self.detect_swipe(now)
                if swipe:
                    self.last_swipe_at = now
                    self.last_swipe = swipe
                    self.last_event = f"swipe-{swipe}"
                    if swipe == "right":
                        self.playlist.next()
                        self.emit_event("NEXT_CONTENT", {})  # >>> INTEGRATION POINT
                    else:
                        self.playlist.prev()
                        self.emit_event("PREV_CONTENT", {})  # >>> INTEGRATION POINT

    def update_state_timers(self, now: float):
        elapsed = now - self.state_since
        if self.state == ExperienceState.TRIGGERED:
            self.set_state(ExperienceState.REGISTRATION)
            self.emit_event("REGISTRATION_START", {})  # >>> INTEGRATION POINT
        elif self.state == ExperienceState.REGISTRATION and elapsed >= REGISTRATION_SECONDS:
            self.emit_event("REGISTRATION_COMPLETE", {})  # >>> INTEGRATION POINT
            self.set_state(ExperienceState.PLAYBACK)
        elif self.state == ExperienceState.THANK_YOU and elapsed >= THANK_YOU_SECONDS:
            self.emit_event("RESET_TO_IDLE", {})  # >>> INTEGRATION POINT
            self.set_state(ExperienceState.IDLE)

    def debug_frame(self, webcam_frame, results):
        frame = cv2.flip(webcam_frame.copy(), 1)
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                self.mp_draw.draw_landmarks(frame, hand_landmarks, self.mp_hands.HAND_CONNECTIONS)

        info = [
            f"State: {self.state.name}",
            f"Hand visible: {self.hand_visible}",
            f"Last event: {self.last_event}",
            f"Last swipe: {self.last_swipe}",
            "q quit | r reset | n next | e end",
        ]
        y = 30
        for line in info:
            cv2.putText(frame, line, (15, y), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 255), 2, cv2.LINE_AA)
            y += 30
        return frame

    def wall_frame(self, width=1280, height=720):
        if self.state == ExperienceState.IDLE:
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            frame[:] = (12, 12, 24)
            cv2.putText(frame, "SPX", (70, 120), cv2.FONT_HERSHEY_SIMPLEX, 2.8, (255, 180, 60), 6, cv2.LINE_AA)
            cv2.putText(frame, "Wave to Begin", (70, 250), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 255), 4, cv2.LINE_AA)
            cv2.putText(frame, "Idle / Attract Mode", (70, 320), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (180, 180, 180), 2, cv2.LINE_AA)
            return frame

        if self.state == ExperienceState.REGISTRATION:
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            frame[:] = (24, 16, 10)
            remaining = max(0.0, REGISTRATION_SECONDS - (time.time() - self.state_since))
            cv2.putText(frame, "Registration / QR Flow", (70, 220), cv2.FONT_HERSHEY_SIMPLEX, 2.0, (255, 255, 255), 4, cv2.LINE_AA)
            cv2.putText(frame, f"Starting in {remaining:0.1f}s", (70, 300), cv2.FONT_HERSHEY_SIMPLEX, 1.3, (255, 190, 90), 3, cv2.LINE_AA)
            return frame

        if self.state == ExperienceState.PLAYBACK:
            frame = self.playlist.read_frame(width, height)
            cv2.putText(frame, f"Playback: {self.playlist.current_label()}", (30, 45), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.putText(frame, "Swipe Left/Right to Navigate", (30, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (80, 220, 255), 2, cv2.LINE_AA)
            return frame

        if self.state == ExperienceState.THANK_YOU:
            frame = np.zeros((height, width, 3), dtype=np.uint8)
            frame[:] = (8, 24, 18)
            cv2.putText(frame, "THANK YOU", (70, 250), cv2.FONT_HERSHEY_SIMPLEX, 2.4, (255, 255, 255), 5, cv2.LINE_AA)
            cv2.putText(frame, "Returning to idle shortly", (70, 330), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (120, 240, 180), 2, cv2.LINE_AA)
            return frame

        frame = np.zeros((height, width, 3), dtype=np.uint8)
        frame[:] = (20, 10, 30)
        cv2.putText(frame, "Triggered", (70, 250), cv2.FONT_HERSHEY_SIMPLEX, 2.2, (255, 255, 255), 5, cv2.LINE_AA)
        return frame

    def run(self):
        cap = cv2.VideoCapture(CAMERA_INDEX)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
        if not cap.isOpened():
            raise RuntimeError("Could not open webcam")

        cv2.namedWindow(WINDOW_DEBUG, cv2.WINDOW_NORMAL)
        cv2.namedWindow(WINDOW_WALL, cv2.WINDOW_NORMAL)

        while True:
            ok, frame = cap.read()
            if not ok:
                break

            now = time.time()
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = self.hands.process(rgb)
            self.hand_visible = bool(results.multi_hand_landmarks)

            if self.hand_visible:
                hand = results.multi_hand_landmarks[0]
                wrist = hand.landmark[self.mp_hands.HandLandmark.WRIST]
                self.history.add(HandSample(now, wrist.x * frame.shape[1], wrist.y * frame.shape[0]))
            else:
                self.history.trim(now, 0.0)

            self.handle_tracking(now)
            self.update_state_timers(now)

            cv2.imshow(WINDOW_DEBUG, self.debug_frame(frame, results))
            cv2.imshow(WINDOW_WALL, self.wall_frame())

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            if key == ord("r"):
                self.emit_event("FORCE_RESET", {})  # >>> INTEGRATION POINT
                self.set_state(ExperienceState.IDLE)
            if key == ord("n") and self.state == ExperienceState.PLAYBACK:
                self.playlist.next()
                self.emit_event("NEXT_CONTENT", {"manual": True})  # >>> INTEGRATION POINT
            if key == ord("e") and self.state == ExperienceState.PLAYBACK:
                self.emit_event("PLAYLIST_FINISHED", {})  # >>> INTEGRATION POINT
                self.emit_event("SEND_RECAP", {})  # >>> INTEGRATION POINT
                self.set_state(ExperienceState.THANK_YOU)

        cap.release()
        self.playlist.close()
        self.hands.close()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    os.makedirs(VIDEOS_DIR, exist_ok=True)
    GestureWallApp().run()
