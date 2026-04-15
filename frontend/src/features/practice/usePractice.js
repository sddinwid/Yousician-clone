import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

function normalizeNote(note) {
  if (!note) return null
  return String(note).trim().toUpperCase()
}

function normalizeChord(chord) {
  if (!chord) return null
  return String(chord).trim()
}

function getTargetAt(lesson, index) {
  if (!lesson) return null
  if (lesson.mode === 'mixed') return lesson.targets[index] ?? null
  return lesson.targets[index] ?? null
}

function isMatch(lesson, target, stableNote, inferredChord) {
  if (!lesson || target == null) return false

  if (lesson.mode === 'note') {
    return normalizeNote(stableNote) === normalizeNote(target)
  }
  if (lesson.mode === 'chord') {
    return normalizeChord(inferredChord) === normalizeChord(target)
  }
  // mixed
  if (target.type === 'note') return normalizeNote(stableNote) === normalizeNote(target.value)
  if (target.type === 'chord') return normalizeChord(inferredChord) === normalizeChord(target.value)
  return false
}

export function usePractice({ lesson, stableNote, inferredChord }) {
  const [state, setState] = useState('idle') // idle | running | completed
  const [activeIndex, setActiveIndex] = useState(0)
  const [results, setResults] = useState([]) // pending | active | correct | missed

  const timerRef = useRef(0)

  const total = lesson?.targets?.length ?? 0

  const initResults = useCallback(() => {
    const initial = Array.from({ length: total }, () => 'pending')
    if (total > 0) initial[0] = 'active'
    setResults(initial)
  }, [total])

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = 0
  }, [])

  const advance = useCallback(
    (mark) => {
      setResults((prev) => {
        const next = prev.length === total ? [...prev] : Array.from({ length: total }, () => 'pending')
        if (activeIndex < total) next[activeIndex] = mark
        const nextIndex = activeIndex + 1
        if (nextIndex < total) next[nextIndex] = 'active'
        return next
      })

      const nextIndex = activeIndex + 1
      if (nextIndex >= total) {
        setState('completed')
      } else {
        setActiveIndex(nextIndex)
      }
    },
    [activeIndex, total],
  )

  const start = useCallback(() => {
    clearTimer()
    setActiveIndex(0)
    setState(total > 0 ? 'running' : 'completed')
    initResults()
  }, [clearTimer, initResults, total])

  const restart = useCallback(() => {
    clearTimer()
    setActiveIndex(0)
    setState('idle')
    initResults()
  }, [clearTimer, initResults])

  // Reset when lesson changes.
  useEffect(() => {
    restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson?.id])

  // Per-target timeout.
  useEffect(() => {
    clearTimer()
    if (state !== 'running') return
    if (activeIndex >= total) return

    const timeoutMs = lesson?.timeoutMs ?? 3000
    timerRef.current = window.setTimeout(() => {
      advance('missed')
    }, timeoutMs)

    return () => clearTimer()
  }, [advance, activeIndex, clearTimer, lesson, state, total])

  // Match detection.
  useEffect(() => {
    if (state !== 'running') return
    const target = getTargetAt(lesson, activeIndex)
    if (!target) return

    if (isMatch(lesson, target, stableNote, inferredChord)) {
      clearTimer()
      advance('correct')
    }
  }, [activeIndex, advance, clearTimer, inferredChord, lesson, stableNote, state])

  const activeTarget = useMemo(() => getTargetAt(lesson, activeIndex), [lesson, activeIndex])

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
    start,
    restart,
  }
}

