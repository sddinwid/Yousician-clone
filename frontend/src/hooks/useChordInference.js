import { useEffect, useMemo, useRef, useState } from 'react'
import { inferOpenChordFromHistory } from '../audio/chord'

const DEFAULTS = {
  windowMs: 3200,
  maxNotes: 18,
  minConfidenceToDisplay: 0.45,
  commitDebounceMs: 260,
  holdMs: 700,
}

export function useChordInference(noteHistory, options = {}) {
  const opts = { ...DEFAULTS, ...options }

  const inference = useMemo(() => {
    return inferOpenChordFromHistory(noteHistory, {
      windowMs: opts.windowMs,
      maxNotes: opts.maxNotes,
    })
  }, [noteHistory, opts.windowMs, opts.maxNotes])

  const [stableChord, setStableChord] = useState(null)
  const [stableConfidence, setStableConfidence] = useState(0)
  const [state, setState] = useState('none') // none | forming | stable | holding
  const [candidateAgeMs, setCandidateAgeMs] = useState(0)

  const candidateRef = useRef({ chord: null, since: 0 })
  const lastStableAtRef = useRef(0)

  useEffect(() => {
    const now = performance.now()
    const candidate = inference.chord
    const conf = inference.confidence ?? 0

    const usableCandidate = candidate && conf >= opts.minConfidenceToDisplay

    if (!usableCandidate) {
      if (stableChord && performance.now() - lastStableAtRef.current < opts.holdMs) {
        setState('holding')
      } else {
        setStableChord(null)
        setStableConfidence(0)
        setState('none')
      }
      candidateRef.current = { chord: null, since: 0 }
      setCandidateAgeMs(0)
      return
    }

    if (candidateRef.current.chord !== candidate) {
      candidateRef.current = { chord: candidate, since: now }
      setCandidateAgeMs(0)
      setState('forming')
      return
    }

    const age = now - candidateRef.current.since
    setCandidateAgeMs(Math.round(age))

    if (age >= opts.commitDebounceMs) {
      setStableChord(candidate)
      setStableConfidence(conf)
      setState('stable')
      lastStableAtRef.current = performance.now()
    } else {
      setState('forming')
    }
  }, [
    inference.chord,
    inference.confidence,
    stableChord,
    opts.minConfidenceToDisplay,
    opts.commitDebounceMs,
    opts.holdMs,
  ])

  return {
    chord: stableChord ?? inference.chord,
    confidence: stableChord ? stableConfidence : inference.confidence,
    usedWindow: inference.usedWindow,
    presentPitchClasses: inference.presentPitchClasses,
    candidates: inference.candidates,
    state,
    candidateAgeMs,
  }
}
