import { useCallback, useEffect, useRef, useState } from 'react'
import { detectPitchAutocorrelation } from '../audio/autocorrelationPitch'
import { frequencyToMidi, midiToFrequency, midiToNoteName } from '../audio/note'

const DEFAULTS = {
  minFrequencyHz: 70,
  maxFrequencyHz: 1200,
  minRms: 0.01,
  minCorrelation: 0.35,
  // Prefer stable display over maximum responsiveness.
  smoothingAlpha: 0.18, // EMA in MIDI space (lower = smoother)
  noteChangeHysteresisSemitones: 0.6,
  noteDebounceMs: 160,
  noteHoldMs: 400,
  stableClarityForUpdate: 0.4,
  stableSignalForUpdate: 0.08,
  analysisIntervalMs: 33, // ~30 Hz updates is plenty for a stable UI
  // Extra guard: avoid replacing a stable higher note with a much lower one unless clarity is strong.
  downJumpGuardSemitones: 7,
  downJumpMinClarity: 0.6,
  downJumpDebounceMs: 240,
  noteChangeMinClarity: 0.45,
  // New note arrival: if pitch is clearly different and persists, allow switching even if
  // we'd normally be conservative due to hysteresis/hold.
  arrivalSemitones: 3,
  arrivalDebounceMs: 180,
  arrivalMinClarity: 0.45,
  // Attack-window acceptance: plucks often have a short, clean transient followed by fast decay.
  // We track the candidate’s best clarity/signal shortly after it appears and allow a faster commit.
  attackSemitones: 2.5,
  attackWindowMs: 220,
  attackDebounceMs: 80,
  attackMinClarity: 0.58,
  attackMinSignal: 0.1,
  // Prevent "pending" transitions from lingering.
  maxPendingMs: 700,
}

export function usePitchDetector(options = {}) {
  const opts = { ...DEFAULTS, ...options }

  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('idle') // idle | requesting | listening | stopped | error
  const [error, setError] = useState(null)
  const [rawFrequencyHz, setRawFrequencyHz] = useState(null)
  const [acceptedFrequencyHz, setAcceptedFrequencyHz] = useState(null)
  const [smoothedFrequencyHz, setSmoothedFrequencyHz] = useState(null)
  const [rawNote, setRawNote] = useState(null)
  const [candidateNote, setCandidateNote] = useState(null)
  const [note, setNote] = useState(null) // stable (locked / debounced) note
  const [confidence, setConfidence] = useState(0)
  const [signal, setSignal] = useState(0)
  const [noteHistory, setNoteHistory] = useState([])
  const [correction, setCorrection] = useState('none')
  const [transitionPending, setTransitionPending] = useState(false)
  const [candidateAgeMs, setCandidateAgeMs] = useState(0)
  const [blockReason, setBlockReason] = useState('none')
  const [acceptMethod, setAcceptMethod] = useState('none') // none | normal | attack

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const bufferRef = useRef(null)

  const smoothedMidiRef = useRef(null)
  const displayedMidiRef = useRef(null)
  const candidateRef = useRef({ midi: null, since: 0, peakClarity: 0, peakSignal: 0 })
  const lastStableAtRef = useRef(0)
  const historyRef = useRef([])
  const lastAnalysisAtRef = useRef(0)

  const pushHistory = useCallback((entry) => {
    historyRef.current = [entry, ...historyRef.current].slice(0, 12)
    setNoteHistory(historyRef.current)
  }, [])

  const resetPitchState = useCallback(() => {
    smoothedMidiRef.current = null
    displayedMidiRef.current = null
    candidateRef.current = { midi: null, since: 0 }
    lastStableAtRef.current = 0
    historyRef.current = []
    setNoteHistory([])
    setRawFrequencyHz(null)
    setAcceptedFrequencyHz(null)
    setSmoothedFrequencyHz(null)
    setRawNote(null)
    setCandidateNote(null)
    setNote(null)
    setConfidence(0)
    setSignal(0)
    setCorrection('none')
    setTransitionPending(false)
    setCandidateAgeMs(0)
    setBlockReason('none')
    setAcceptMethod('none')
    lastAnalysisAtRef.current = 0
  }, [])

  const stop = useCallback(async () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0

    setIsListening(false)
    setStatus((s) => (s === 'error' ? s : 'stopped'))

    try {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop()
      }
    } catch {
      // ignore
    } finally {
      streamRef.current = null
    }

    try {
      sourceRef.current?.disconnect()
      analyserRef.current?.disconnect()
    } catch {
      // ignore
    } finally {
      sourceRef.current = null
      analyserRef.current = null
    }

    try {
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        await audioContextRef.current.close()
      }
    } catch {
      // ignore
    } finally {
      audioContextRef.current = null
    }

    resetPitchState()
  }, [resetPitchState])

  const start = useCallback(async () => {
    setError(null)
    setStatus('requesting')

    // Clean restart if Start is clicked while already listening.
    await stop()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      })

      const AudioContextCtor = window.AudioContext || window.webkitAudioContext
      if (!AudioContextCtor) throw new Error('Web Audio API is not supported in this browser.')

      const audioContext = new AudioContextCtor()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()

      // 2048–4096 keeps enough resolution for guitar fundamentals while staying snappy.
      analyser.fftSize = 4096
      analyser.smoothingTimeConstant = 0.0

      source.connect(analyser)

      audioContextRef.current = audioContext
      streamRef.current = stream
      sourceRef.current = source
      analyserRef.current = analyser
      bufferRef.current = new Float32Array(analyser.fftSize)

      setIsListening(true)
      setStatus('listening')

      const nowMs = () => performance.now()

      const maybeOctaveCorrect = (frequency, smoothedFrequency) => {
        if (!frequency || !smoothedFrequency) return frequency

        // If autocorrelation locks onto a strong harmonic, it often shows up as ~2x or ~0.5x.
        if (frequency > smoothedFrequency * 1.9 && frequency < smoothedFrequency * 2.1) return frequency / 2
        if (frequency * 2 > smoothedFrequency * 1.9 && frequency * 2 < smoothedFrequency * 2.1) return frequency * 2
        return frequency
      }

      const tick = () => {
        const ctx = audioContextRef.current
        const an = analyserRef.current
        const buf = bufferRef.current

        if (!ctx || !an || !buf) return

        const t = nowMs()
        if (t - lastAnalysisAtRef.current < opts.analysisIntervalMs) {
          rafRef.current = requestAnimationFrame(tick)
          return
        }
        lastAnalysisAtRef.current = t

        an.getFloatTimeDomainData(buf)
        const { frequencyHz: f, clarity, rms, subharmonicCorrected } = detectPitchAutocorrelation(
          buf,
          ctx.sampleRate,
          opts,
        )

        const signalNorm = Math.max(0, Math.min(1, rms / 0.2)) // UI-only normalization
        setSignal(signalNorm)
        setConfidence(clarity)
        setRawFrequencyHz(f ? Math.round(f * 10) / 10 : null)
        setRawNote(f ? midiToNoteName(Math.round(frequencyToMidi(f))) : null)

        const hasStableInput =
          f &&
          clarity >= opts.stableClarityForUpdate &&
          signalNorm >= opts.stableSignalForUpdate

        if (hasStableInput) lastStableAtRef.current = t

        const prevSmoothedMidi = smoothedMidiRef.current
        const prevSmoothedHz = prevSmoothedMidi != null ? midiToFrequency(prevSmoothedMidi) : null
        const corrected = f ? maybeOctaveCorrect(f, prevSmoothedHz) : null
        const octaveCorrectionApplied = corrected && f && Math.abs(corrected - f) / f > 0.35

        const displayedMidi = displayedMidiRef.current
        const correctedMidi = corrected ? frequencyToMidi(corrected) : null
        const isDownJumpRisk =
          displayedMidi != null &&
          correctedMidi != null &&
          correctedMidi < displayedMidi - opts.downJumpGuardSemitones

        const flags = []
        if (subharmonicCorrected) flags.push('subharmonic')
        if (octaveCorrectionApplied) flags.push('octave')
        if (isDownJumpRisk) flags.push('down-jump-risk')

        // Always let the smoothed pitch track stable input; guards apply when committing stable notes.
        if (corrected && hasStableInput) {
          const rawMidi = frequencyToMidi(corrected)
          const base = prevSmoothedMidi == null ? rawMidi : prevSmoothedMidi
          const next = base + opts.smoothingAlpha * (rawMidi - base)
          smoothedMidiRef.current = next
          setAcceptedFrequencyHz(Math.round(corrected * 10) / 10)
        } else {
          setAcceptedFrequencyHz(null)
        }
        setCorrection(flags.length ? flags.join(', ') : 'none')

        const smoothedMidi = smoothedMidiRef.current
        const smoothedHz = smoothedMidi != null ? midiToFrequency(smoothedMidi) : null
        setSmoothedFrequencyHz(smoothedHz ? Math.round(smoothedHz * 10) / 10 : null)

        // Note locking: debounce note changes + hysteresis around the current note.
        const smoothedNoteMidi = smoothedMidi != null ? Math.round(smoothedMidi) : null
        setCandidateNote(smoothedNoteMidi != null ? midiToNoteName(smoothedNoteMidi) : null)

        const shouldHold =
          !hasStableInput && displayedMidi != null && t - lastStableAtRef.current < opts.noteHoldMs

        if (shouldHold) {
          // keep previously locked note briefly when input becomes unstable
          setNote(midiToNoteName(displayedMidi))
          setTransitionPending(false)
          setCandidateAgeMs(0)
          setBlockReason('hold')
        } else if (smoothedMidi == null || smoothedNoteMidi == null) {
          if (displayedMidiRef.current != null && t - lastStableAtRef.current >= opts.noteHoldMs) {
            displayedMidiRef.current = null
            setNote(null)
          }
          setTransitionPending(false)
          setCandidateAgeMs(0)
          setBlockReason('no-signal')
        } else if (displayedMidi == null) {
          displayedMidiRef.current = smoothedNoteMidi
          setNote(midiToNoteName(smoothedNoteMidi))
          pushHistory({ note: midiToNoteName(smoothedNoteMidi), at: Date.now(), frequencyHz: smoothedHz })
          setTransitionPending(false)
          setCandidateAgeMs(0)
          setBlockReason('none')
        } else {
          const distance = smoothedMidi - displayedMidi
          const wantsChange = Math.abs(distance) > opts.noteChangeHysteresisSemitones

          if (!wantsChange) {
            candidateRef.current = { midi: null, since: 0, peakClarity: 0, peakSignal: 0 }
            setNote(midiToNoteName(displayedMidi))
            setTransitionPending(false)
            setCandidateAgeMs(0)
            setBlockReason('none')
          } else {
            const candidateMidi = smoothedNoteMidi
            const isLargeDownChange =
              candidateMidi != null && candidateMidi < displayedMidi - opts.downJumpGuardSemitones
            const isArrival = Math.abs(distance) >= opts.arrivalSemitones
            const requiredDebounce = isLargeDownChange
              ? Math.max(opts.downJumpDebounceMs, isArrival ? opts.arrivalDebounceMs : 0)
              : isArrival
                ? opts.arrivalDebounceMs
                : opts.noteDebounceMs
            const minClarityForChange = isLargeDownChange
              ? Math.max(opts.downJumpMinClarity, isArrival ? opts.arrivalMinClarity : 0)
              : isArrival
                ? opts.arrivalMinClarity
                : opts.noteChangeMinClarity

            if (candidateMidi === displayedMidi) {
              candidateRef.current = { midi: null, since: 0, peakClarity: 0, peakSignal: 0 }
              setNote(midiToNoteName(displayedMidi))
              setTransitionPending(false)
              setCandidateAgeMs(0)
              setBlockReason('none')
            } else if (candidateRef.current.midi !== candidateMidi) {
              candidateRef.current = {
                midi: candidateMidi,
                since: t,
                peakClarity: clarity,
                peakSignal: signalNorm,
              }
              setNote(midiToNoteName(displayedMidi))
              setTransitionPending(true)
              setCandidateAgeMs(0)
              setBlockReason('debounce')
            } else {
              // Update peak metrics inside the short "attack window".
              candidateRef.current.peakClarity = Math.max(candidateRef.current.peakClarity, clarity)
              candidateRef.current.peakSignal = Math.max(candidateRef.current.peakSignal, signalNorm)

              const age = t - candidateRef.current.since
              setTransitionPending(true)
              setCandidateAgeMs(Math.round(age))

              if (age > opts.maxPendingMs) {
                candidateRef.current = { midi: null, since: 0, peakClarity: 0, peakSignal: 0 }
                setTransitionPending(false)
                setCandidateAgeMs(0)
                setBlockReason('expired')
                setNote(midiToNoteName(displayedMidi))
                rafRef.current = requestAnimationFrame(tick)
                return
              }

              const inAttackWindow = age <= opts.attackWindowMs
              const peakClarity = candidateRef.current.peakClarity
              const peakSignal = candidateRef.current.peakSignal
              const attackClarity = isLargeDownChange
                ? Math.max(opts.downJumpMinClarity, opts.attackMinClarity)
                : opts.attackMinClarity

              const attackEligible =
                inAttackWindow &&
                age >= opts.attackDebounceMs &&
                Math.abs(distance) >= opts.attackSemitones &&
                peakClarity >= attackClarity &&
                peakSignal >= opts.attackMinSignal

              const normalEligible =
                hasStableInput &&
                age >= requiredDebounce &&
                clarity >= minClarityForChange

              if (attackEligible || normalEligible) {
                displayedMidiRef.current = candidateMidi
                candidateRef.current = { midi: null, since: 0, peakClarity: 0, peakSignal: 0 }
                setNote(midiToNoteName(candidateMidi))
                pushHistory({ note: midiToNoteName(candidateMidi), at: Date.now(), frequencyHz: smoothedHz })
                setTransitionPending(false)
                setCandidateAgeMs(0)
                setBlockReason('none')
                setAcceptMethod(attackEligible && !normalEligible ? 'attack' : 'normal')
              } else {
                if (!hasStableInput) {
                  setBlockReason(inAttackWindow ? 'attack-window' : 'unstable-input')
                } else if (clarity < minClarityForChange) {
                  setBlockReason('clarity')
                } else {
                  setBlockReason('debounce')
                }
                setNote(midiToNoteName(displayedMidi))
              }
            }
          }
        }

        rafRef.current = requestAnimationFrame(tick)
      }

      rafRef.current = requestAnimationFrame(tick)
    } catch (e) {
      const message =
        e?.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : e?.name === 'NotFoundError'
            ? 'No microphone device found.'
            : e?.message || 'Failed to start microphone.'

      setError(message)
      setStatus('error')
      setIsListening(false)
      await stop()
    }
  }, [opts, stop])

  useEffect(() => {
    // Stop mic if the component unmounts.
    return () => {
      stop()
    }
  }, [stop])

  return {
    isListening,
    status,
    error,
    note,
    rawFrequencyHz,
    acceptedFrequencyHz,
    smoothedFrequencyHz,
    rawNote,
    candidateNote,
    confidence,
    signal,
    noteHistory,
    correction,
    transitionPending,
    candidateAgeMs,
    blockReason,
    acceptMethod,
    start,
    stop,
  }
}
