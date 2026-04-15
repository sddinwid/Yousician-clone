# Architecture notes (prototype)

## Problem focus

This prototype explores the *feedback loop* at the core of interactive music learning:

1. Capture audio from a real instrument
2. Derive a readable musical signal (“current note”, then “likely chord”)
3. Drive an interactive practice flow
4. Record outcomes for iteration

The emphasis is on **practical latency, UI stability, and explainable heuristics** over laboratory-grade accuracy.

## Why pitch detection stays client-side

- **Latency**: round-tripping raw audio to a server adds delay and harms the “feels responsive” loop.
- **Privacy & simplicity**: no audio upload for a demo; fewer moving parts.
- **Scaling**: client-side compute scales naturally with users.

The pitch detector uses a simple autocorrelation approach plus pragmatic smoothing/acceptance policy to keep the UI readable.

## Why chord inference is heuristic here

True chord detection from a single microphone is a polyphonic DSP problem.
For a prototype, we instead infer a “chord snapshot” from a rolling window of recent **stable detected notes**:

- Normalize to pitch classes (C, C#, D…)
- Score common open chords based on required tone coverage and extra-tone penalties
- Add debounce/persistence so labels don’t flicker

This makes the system demo-able without pretending it is a production-grade polyphonic model.

## Why the backend is intentionally thin

The backend exists to:

- Provide lessons as a **single source of truth** (`GET /lessons`)
- Accept completed attempts (`POST /attempts`)

Storage is in-memory to keep the project minimal and readable, while still being structured so persistence can be swapped in later.

## Current system shape

- Frontend (Vite + React)
  - Web Audio microphone capture
  - Autocorrelation pitch estimation
  - Stability layer (smoothing + note acceptance policy)
  - Rolling note history
  - Heuristic chord inference
  - Practice state machine (targets → correct/missed → completion)
  - Attempt submission on completion
- Backend (FastAPI)
  - `/health` for sanity
  - `/lessons` + `/lessons/{id}` for lesson delivery
  - `/attempts` for attempt capture (in-memory)

## What would change in a production system

- **Audio calibration + UX**: input level guidance, noise gating, tuning presets, device selection.
- **Pitch/chord models**: improved monophonic tracking and a dedicated polyphonic approach (or model-based inference).
- **Lesson authoring**: structured content format, versioning, localization.
- **Persistence**: DB-backed attempts, analytics, user progress, and privacy controls.
- **Observability**: event logging, performance budgets, and regression tests on real recordings.

