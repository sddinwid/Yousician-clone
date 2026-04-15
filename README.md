# Yousician Prototype (Focused Demo)

This repo is a focused prototype exploring the **real-time feedback loop** in an interactive music-learning system:

- Capture microphone audio in the browser (Web Audio API)
- Detect a single pitch (monophonic) in near real time
- Stabilize a readable “current note” signal for UI feedback
- Infer simple open chords heuristically from recent detected notes
- Drive a minimal lesson/practice flow and store attempts via a thin API

It is **not** a full Yousician clone. The goal is to show practical engineering tradeoffs and a clean, interview-ready implementation.

## Why it’s built this way

- **Pitch detection stays client-side**: lowest latency, no audio upload, and simplest dev loop.
- **Chord inference is heuristic**: good enough for a demo without advanced polyphonic DSP.
- **Backend is intentionally thin**: lesson source of truth + attempt capture, structured so storage can later move to a DB.

More detail: `docs/architecture.md`.

## Repo layout

- `frontend/` Vite + React UI (mic capture, pitch detection, chord inference, practice flow)
- `backend/` FastAPI API (`/health`, `/lessons`, `/attempts`)
- `docs/` short design notes

## Setup

### Backend (FastAPI)

```bash
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend (Vite + React)

```bash
cd frontend
npm.cmd install
npm.cmd run dev
```

By default the frontend calls the backend at `http://127.0.0.1:8000`.
To override, set `VITE_API_BASE_URL` (see `frontend/src/api/http.js`).

## Demo flow

1. Start the backend (`:8000`) and the frontend (`:5173`).
2. In the UI:
   - Click **Start Listening** and allow microphone access.
   - Pluck open strings and watch **Raw / Accepted / Smoothed** frequency and the **Stable Note**.
   - Strum an open chord and watch the **Chord (Heuristic)** panel settle.
3. Pick a **Practice** lesson and click **Start Practice**:
   - Targets advance on match or timeout.
   - When completed, the attempt is POSTed to the backend and a save status is shown.

## Known limitations

- Pitch detection is **monophonic** (single-note); strums are not true polyphonic analysis.
- Guitar input is noisy: harmonics, room noise, and mic quality affect stability.
- Chord inference is a **best-effort snapshot** from recent detected notes; it can be ambiguous.
- Attempt storage is **in-memory** only (restarts wipe data).

## Sensible next steps

- Add calibration UI (input gain, thresholds, guitar range presets).
- Improve chord inference using richer note windows + string-aware priors.
- Persist attempts to a real store (SQLite/Postgres/Mongo) via a repository layer.
- Add a minimal lesson authoring format and versioning.

