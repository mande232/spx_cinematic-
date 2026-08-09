# SPX LED Wall - Gesture Prototype

A runnable prototype of wave-to-start and swipe-to-navigate gesture logic for the LED wall project.

## What it does

- Idle mode: watches for a repeated left-right hand wave.
- Triggered / registration stub: simulates your QR/registration flow with a timer.
- Playback: plays .mp4 files from videos/, or placeholder frames if none exist.
- Swipe control: left/right swipe changes video while playing.
- Thank you: simulated end state before automatic reset.

Two windows open:
- SPX Gesture Debug - webcam + hand landmarks + state
- SPX LED Wall - simulated wall output

## Setup

python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

macOS/Linux:
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

## Run

python gesture_wall.py

Put .mp4 files in videos/ to test real playback.

## Demo controls
- q - quit
- r - force reset to idle
- n - next video during playback
- e - end playback and show thank-you screen

## Tuning
Adjust constants at the top of gesture_wall.py: WAVE_MIN_REVERSALS, WAVE_MIN_AMPLITUDE_PX, SWIPE_MIN_DISTANCE_PX, WAVE_COOLDOWN_SECONDS, SWIPE_COOLDOWN_SECONDS.

## Integration notes
Search for # >>> INTEGRATION POINT in gesture_wall.py and replace those prints/timers with your real system calls.

## Known limitations
- single-hand tracking only
- threshold-based gesture logic, not a trained classifier
- placeholder registration and thank-you flow
- placeholder frames if videos/ is empty
