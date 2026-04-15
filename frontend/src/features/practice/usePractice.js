import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { noteNameToPitchClass } from '../../audio/chord'

function normalizeNoteName(noteName) {
  if (!noteName) return null
  const s = String(noteName).trim()
  const m = s.match(/^([A-Ga-g])([#b]?)(-?\d+)$/)
  if (!m) return s.toUpperCase()
  const letter = m[1].toUpperCase()
  const accidental = m[2] || ''
  const octave = m[3]
  return `${letter}${accidental}${octave}`
}

function normalizeChordName(chordName) {
  if (!chordName) return null
  const s = String(chordName).trim()
  const m = s.match(/^([A-Ga-g])([#b]?)(m?)$/)
  if (!m) return s
  const root = m[1].toUpperCase()
  const accidental = m[2] || ''
  const minor = m[3] ? 'm' : ''
  return `${root}${accidental}${minor}`
}

function getTargetAt(lesson, index) {
  if (!lesson) return null
  return lesson.targets?.[index] ?? null
}

function describeTarget(lesson, target) {
  if (!lesson || !target) return { expectedType: null, expectedValue: null, expectedLabel: null }

  if (lesson.mode === 'mixed') {
    return {
      expectedType: target.type,
      expectedValue: target.value,
      expectedLabel: `${target.type.toUpperCase()}: ${target.value}`,
    }
  }

  if (typeof target === 'string') {
    return {
      expectedType: lesson.mode === 'chord' ? 'chord' : lesson.mode === 'note' ? 'note' : null,
      expectedValue: target,
      expectedLabel: target,
    }
  }

  return { expectedType: null, expectedValue: null, expectedLabel: null }
}

function matchNote(expectedValue, stableNote, { allowPitchClassFallback = true } = {}) {
  const expectedNorm = normalizeNoteName(expectedValue)
  const actualNorm = normalizeNoteName(stableNote)
  if (!expectedNorm || !actualNorm) return { ok: false, method: 'none' }
  if (expectedNorm === actualNorm) return { ok: true, method: 'exact' }

  if (!allowPitchClassFallback) return { ok: false, method: 'false' }

  const expectedPc = noteNameToPitchClass(expectedNorm)
  const actualPc = noteNameToPitchClass(actualNorm)
  if (expectedPc && actualPc && expectedPc === actualPc) return { ok: true, method: 'pitch-class' }
  return { ok: false, method: 'false' }
}

const PITCH_CLASS_TO_SEMITONE = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
}

function noteNameToMidi(noteName) {
  const s = normalizeNoteName(noteName)
  if (!s) return null
  const m = s.match(/^([A-G])(#|b)?(-?\d+)$/)
  if (!m) return null
  const letter = m[1]
  const accidental = m[2] || ''
  const octave = Number(m[3])
  if (!Number.isFinite(octave)) return null

  let pc = `${letter}${accidental}`
  if (accidental === 'b') {
    // Flat input (e.g. "Bb3") -> use pitch-class helper and map to semitone.
    pc = noteNameToPitchClass(`${letter}b`) ?? pc
  }
  const semitone = PITCH_CLASS_TO_SEMITONE[pc]
  if (semitone == null) return null
  return (octave + 1) * 12 + semitone
}

function matchNoteWithTolerance(
  expectedValue,
  stableNote,
  { allowPitchClassFallback = true, allowSemitoneTolerance = false, semitoneTolerance = 1 } = {},
) {
  const expectedNorm = normalizeNoteName(expectedValue)
  const actualNorm = normalizeNoteName(stableNote)
  if (!expectedNorm || !actualNorm) return { ok: false, method: 'false' }
  if (expectedNorm === actualNorm) return { ok: true, method: 'exact' }

  // Demo-only tolerance: accept within ±N semitones to avoid frustrating near-misses on upper strings.
  if (allowSemitoneTolerance) {
    const expectedMidi = noteNameToMidi(expectedNorm)
    const actualMidi = noteNameToMidi(actualNorm)
    if (expectedMidi != null && actualMidi != null) {
      const diff = Math.abs(expectedMidi - actualMidi)
      if (diff <= semitoneTolerance) return { ok: true, method: 'near-semitone' }
    }
  }

  if (allowPitchClassFallback) {
    const expectedPc = noteNameToPitchClass(expectedNorm)
    const actualPc = noteNameToPitchClass(actualNorm)
    if (expectedPc && actualPc && expectedPc === actualPc) return { ok: true, method: 'pitch-class' }
  }

  return { ok: false, method: 'false' }
}

function matchChord(expectedValue, inferredChord) {
  const expectedNorm = normalizeChordName(expectedValue)
  const actualNorm = normalizeChordName(inferredChord)
  if (!expectedNorm || !actualNorm) return { ok: false }
  return { ok: expectedNorm === actualNorm }
}

function isMatch(
  lesson,
  target,
  stableNote,
  inferredChord,
  { allowPitchClassFallback = true, allowSemitoneTolerance = false, semitoneTolerance = 1 } = {},
) {
  if (!lesson || target == null) return false

  if (lesson.mode === 'note') {
    return matchNoteWithTolerance(target, stableNote, {
      allowPitchClassFallback,
      allowSemitoneTolerance,
      semitoneTolerance,
    }).ok
  }
  if (lesson.mode === 'chord') return matchChord(target, inferredChord).ok

  if (lesson.mode === 'mixed') {
    if (target.type === 'note') {
      return matchNoteWithTolerance(target.value, stableNote, {
        allowPitchClassFallback,
        allowSemitoneTolerance,
        semitoneTolerance,
      }).ok
    }
    if (target.type === 'chord') return matchChord(target.value, inferredChord).ok
  }

  return false
}

export function usePractice({
  lesson,
  stableNote,
  inferredChord,
  allowPitchClassFallback = true,
  allowSemitoneTolerance = true,
  semitoneTolerance = 1,
}) {
  const [state, setState] = useState('idle') // idle | running | completed
  const [activeIndex, setActiveIndex] = useState(0)
  const [results, setResults] = useState([]) // pending | active | correct | missed
  const [timeRemainingMs, setTimeRemainingMs] = useState(null)
  const [manualAdvance, setManualAdvance] = useState(false)
  const [timeoutEnabled, setTimeoutEnabled] = useState(true)

  const timerRef = useRef(0)
  const remainingIntervalRef = useRef(0)
  const deadlineRef = useRef(0)
  const activeKeyRef = useRef('')
  const advancedKeyRef = useRef('')

  const total = lesson?.targets?.length ?? 0

  const setActiveKey = useCallback(
    (idx) => {
      activeKeyRef.current = `${lesson?.id || 'lesson'}:${idx}`
      advancedKeyRef.current = ''
    },
    [lesson?.id],
  )

  const initResults = useCallback(() => {
    const initial = Array.from({ length: total }, () => 'pending')
    if (total > 0) initial[0] = 'active'
    setResults(initial)
  }, [total])

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = 0
  }, [])

  const clearRemaining = useCallback(() => {
    if (remainingIntervalRef.current) window.clearInterval(remainingIntervalRef.current)
    remainingIntervalRef.current = 0
    deadlineRef.current = 0
    setTimeRemainingMs(null)
  }, [])

  const advanceOnce = useCallback(
    (mark, key) => {
      if (!key || key !== activeKeyRef.current) return
      if (advancedKeyRef.current === key) return
      advancedKeyRef.current = key
      clearTimer()
      clearRemaining()

      const [, idxStr] = key.split(':')
      const idx = Number(idxStr)
      const currentIdx = Number.isFinite(idx) ? idx : 0
      const nextIdx = currentIdx + 1

      setResults((prev) => {
        const next = prev.length === total ? [...prev] : Array.from({ length: total }, () => 'pending')
        if (currentIdx < total) next[currentIdx] = mark
        if (nextIdx < total) next[nextIdx] = 'active'
        return next
      })

      if (nextIdx >= total) {
        setState('completed')
      } else {
        setActiveIndex(nextIdx)
        setActiveKey(nextIdx)
      }
    },
    [clearRemaining, clearTimer, setActiveKey, total],
  )

  const start = useCallback(() => {
    clearTimer()
    clearRemaining()
    setActiveIndex(0)
    setActiveKey(0)
    setState(total > 0 ? 'running' : 'completed')
    initResults()
  }, [clearRemaining, clearTimer, initResults, setActiveKey, total])

  const restart = useCallback(() => {
    clearTimer()
    clearRemaining()
    setActiveIndex(0)
    setActiveKey(0)
    setState('idle')
    initResults()
  }, [clearRemaining, clearTimer, initResults, setActiveKey])

  const nextTarget = useCallback(() => {
    if (state !== 'running') return
    advanceOnce('missed', activeKeyRef.current)
  }, [advanceOnce, state])

  // Reset when lesson changes.
  useEffect(() => {
    restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  // Demo-friendly defaults: notes work best with manual advance (plucks decay quickly).
  useEffect(() => {
    const mode = lesson?.mode
    if (!mode) return
    setManualAdvance(mode === 'note')
    setTimeoutEnabled(mode !== 'note')
  }, [lesson?.mode])

  const effectiveTimeoutMs = useMemo(() => {
    const mode = lesson?.mode
    const base = lesson?.timeoutMs
    const fallback = mode === 'note' ? 12000 : mode === 'chord' ? 7000 : 9000
    const desired = typeof base === 'number' ? base : fallback
    const minDemo = mode === 'note' ? 8000 : mode === 'chord' ? 6000 : 7000
    return Math.max(desired, minDemo)
  }, [lesson?.mode, lesson?.timeoutMs])

  // Per-target timeout (guarded by active key to prevent race conditions).
  useEffect(() => {
    clearTimer()
    if (state !== 'running') return
    if (activeIndex >= total) return
    if (manualAdvance || !timeoutEnabled) {
      clearRemaining()
      return
    }

    clearRemaining()
    const timeoutMs = effectiveTimeoutMs
    const key = activeKeyRef.current
    const deadline = performance.now() + timeoutMs
    deadlineRef.current = deadline
    setTimeRemainingMs(Math.round(timeoutMs))

    remainingIntervalRef.current = window.setInterval(() => {
      const left = Math.max(0, deadlineRef.current - performance.now())
      setTimeRemainingMs(Math.round(left))
    }, 200)

    timerRef.current = window.setTimeout(() => {
      advanceOnce('missed', key)
    }, timeoutMs)

    return () => {
      clearTimer()
      clearRemaining()
    }
  }, [
    activeIndex,
    advanceOnce,
    clearRemaining,
    clearTimer,
    effectiveTimeoutMs,
    manualAdvance,
    state,
    timeoutEnabled,
    total,
  ])

  // Match detection (reacts to live note/chord updates).
  useEffect(() => {
    if (state !== 'running') return
    const target = getTargetAt(lesson, activeIndex)
    if (!target) return
    if (
      isMatch(lesson, target, stableNote, inferredChord, {
        allowPitchClassFallback,
        allowSemitoneTolerance,
        semitoneTolerance,
      })
    ) {
      advanceOnce('correct', activeKeyRef.current)
    }
  }, [
    activeIndex,
    advanceOnce,
    allowPitchClassFallback,
    allowSemitoneTolerance,
    inferredChord,
    lesson,
    semitoneTolerance,
    stableNote,
    state,
  ])

  const activeTarget = useMemo(() => getTargetAt(lesson, activeIndex), [lesson, activeIndex])

  const debug = useMemo(() => {
    const target = activeTarget
    const { expectedType, expectedValue, expectedLabel } = describeTarget(lesson, target)

    const noteRes =
      expectedType === 'note' && expectedValue
        ? matchNoteWithTolerance(expectedValue, stableNote, {
            allowPitchClassFallback,
            allowSemitoneTolerance,
            semitoneTolerance,
          })
        : { ok: false, method: 'false' }

    const chordRes =
      expectedType === 'chord' && expectedValue ? matchChord(expectedValue, inferredChord) : { ok: false }

    let reason = 'ready'
    if (state !== 'running') reason = 'practice-not-running'
    else if (!expectedValue) reason = 'no-active-target'
    else if (expectedType === 'note' && !stableNote) reason = 'waiting-stable-note'
    else if (expectedType === 'chord' && !inferredChord) reason = 'waiting-inferred-chord'
    else if (expectedType === 'note' && !noteRes.ok) reason = `note-mismatch (${noteRes.method})`
    else if (expectedType === 'chord' && !chordRes.ok) reason = 'chord-mismatch'

    return {
      lessonMode: lesson?.mode ?? '—',
      expectedType,
      expected: expectedLabel,
      stableNote: stableNote ?? null,
      inferredChord: inferredChord ?? null,
      noteMatch: noteRes.ok,
      noteMatchMethod: noteRes.method,
      chordMatch: chordRes.ok,
      reason,
      activeIndex,
      total,
      manualAdvance,
      timeoutEnabled: !manualAdvance && timeoutEnabled,
      timeRemainingMs,
    }
  }, [
    activeIndex,
    activeTarget,
    allowPitchClassFallback,
    allowSemitoneTolerance,
    inferredChord,
    lesson,
    manualAdvance,
    semitoneTolerance,
    stableNote,
    state,
    timeRemainingMs,
    timeoutEnabled,
    total,
  ])

  const score = useMemo(() => {
    const correct = results.filter((r) => r === 'correct').length
    const missed = results.filter((r) => r === 'missed').length
    const attempted = correct + missed
    const percent = attempted === 0 ? 0 : Math.round((correct / attempted) * 100)
    return { correct, missed, attempted, total, percent }
  }, [results, total])

  return {
    state,
    activeIndex,
    activeTarget,
    results,
    score,
    debug,
    start,
    restart,
    nextTarget,
    manualAdvance,
    setManualAdvance,
    timeoutEnabled,
    setTimeoutEnabled,
  }
}
