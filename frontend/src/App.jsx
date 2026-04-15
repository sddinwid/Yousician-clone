import './App.css'
import { usePitchDetector } from './hooks/usePitchDetector'
import { useChordInference } from './hooks/useChordInference'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatTarget } from './features/practice/lessons'
import { usePractice } from './features/practice/usePractice'
import { getLessons } from './api/lessons'
import { createAttempt } from './api/attempts'

function App() {
  const {
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
  } = usePitchDetector()

  const chord = useChordInference(noteHistory)

  const [lessons, setLessons] = useState([])
  const [lessonsLoading, setLessonsLoading] = useState(true)
  const [lessonsError, setLessonsError] = useState(null)

  const [lessonId, setLessonId] = useState('')
  const lesson = useMemo(
    () => lessons.find((l) => l.id === lessonId) ?? lessons[0] ?? null,
    [lessons, lessonId],
  )

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLessonsLoading(true)
      setLessonsError(null)
      try {
        const data = await getLessons()
        if (cancelled) return
        setLessons(Array.isArray(data) ? data : [])
        setLessonId((prev) => prev || data?.[0]?.id || '')
      } catch (e) {
        if (cancelled) return
        setLessons([])
        setLessonId('')
        setLessonsError(e?.message || 'Failed to load lessons.')
      } finally {
        if (!cancelled) setLessonsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const practice = usePractice({
    lesson,
    stableNote: note,
    inferredChord: chord.chord,
    inferredChordConfidence: chord.confidence ?? 0,
    inferredChordState: chord.state,
    allowPitchClassFallback: true,
    allowSemitoneTolerance: true,
    semitoneTolerance: 1,
  })

  const [attemptStatus, setAttemptStatus] = useState('idle') // idle | saving | saved | failed
  const [attemptMessage, setAttemptMessage] = useState('')
  const sessionIdRef = useRef(0)
  const savedSessionIdRef = useRef(-1)

  const startPractice = () => {
    sessionIdRef.current += 1
    setAttemptStatus('idle')
    setAttemptMessage('')
    practice.start()
  }

  useEffect(() => {
    if (practice.state !== 'completed') return
    if (!lesson) return
    if (savedSessionIdRef.current === sessionIdRef.current) return

    savedSessionIdRef.current = sessionIdRef.current
    setAttemptStatus('saving')
    setAttemptMessage('')

    const payload = {
      lessonId: lesson.id,
      completedAt: new Date().toISOString(),
      score: {
        correct: practice.score.correct,
        missed: practice.score.missed,
        completionPercentage: practice.score.percent,
      },
      targets: lesson.targets,
      results: practice.results,
    }

    createAttempt(payload)
      .then((res) => {
        setAttemptStatus('saved')
        setAttemptMessage(
          res?.attempt?.id ? `Attempt saved (id: ${res.attempt.id})` : 'Attempt saved',
        )
      })
      .catch((e) => {
        setAttemptStatus('failed')
        setAttemptMessage(e?.message ? `Save failed: ${e.message}` : 'Save failed')
      })
  }, [lesson, practice.results, practice.score, practice.state])

  return (
    <main className="page">
      <header className="header">
        <h1>Yousician Prototype</h1>
        <p className="subtle">
          Phase 1: microphone capture + single-note pitch detection (local, realtime).
        </p>
        <div className="controls">
          <button
            type="button"
            className="primaryButton"
            onClick={start}
            disabled={status === 'requesting' || isListening}
          >
            Start Listening
          </button>
          <button
            type="button"
            className="button"
            onClick={stop}
            disabled={!isListening}
          >
            Stop Listening
          </button>
        </div>
      </header>

      <section className="card" aria-labelledby="practice-title">
        <h2 id="practice-title">Practice</h2>
        <div className="practiceTop">
          <div className="practiceSelect">
            <label className="label" htmlFor="lesson-select">
              Lesson
            </label>
            <select
              id="lesson-select"
              className="select"
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              disabled={lessonsLoading || !!lessonsError || lessons.length === 0}
            >
              {lessons.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.title}
                </option>
              ))}
            </select>
          </div>
          <div className="practiceButtons">
            <button
              type="button"
              className="primaryButton"
              onClick={startPractice}
              disabled={practice.state === 'running' || !lesson || !!lessonsError}
            >
              Start Practice
            </button>
            <button
              type="button"
              className="button"
              onClick={practice.nextTarget}
              disabled={practice.state !== 'running' || !lesson}
            >
              Next Target
            </button>
            <button type="button" className="button" onClick={practice.restart}>
              Restart
            </button>
          </div>
        </div>

        <div className="practiceControls">
          <label className="toggle">
            <input
              type="checkbox"
              checked={practice.manualAdvance}
              onChange={(e) => practice.setManualAdvance(e.target.checked)}
              disabled={!lesson}
            />
            Manual advance
          </label>
          <label className={`toggle ${practice.manualAdvance ? 'toggleDisabled' : ''}`}>
            <input
              type="checkbox"
              checked={practice.timeoutEnabled}
              onChange={(e) => practice.setTimeoutEnabled(e.target.checked)}
              disabled={!lesson || practice.manualAdvance}
            />
            Timeout enabled
          </label>
        </div>

        <div className="practiceMeta">
          <div className="subtle">
            <div className="mono">{lesson?.title ?? 'Lessons'}</div>
            <div>
              {lessonsLoading
                ? 'Loading lessons…'
                : lessonsError
                  ? `Failed to load lessons: ${lessonsError}`
                  : lesson?.description ?? '—'}
            </div>
          </div>
          <div className="practiceSummary">
            <span className="pill">{practice.state}</span>
            <span className="mono">
              {practice.score.correct} correct / {practice.score.missed} missed (
              {practice.score.percent}%)
            </span>
          </div>
        </div>

        <div className="practiceActive">
          <div className="label">Active Target</div>
          <div className="value">
            <span className="pill">
              Target {practice.activeIndex + 1} of {practice.score.total || 0}
            </span>
            <span className="pill">
              Previous:{' '}
              {practice.activeIndex > 0 ? practice.results[practice.activeIndex - 1] : '—'}
            </span>
            <span className="mono">
              {practice.activeTarget && lesson ? formatTarget(lesson, practice.activeTarget) : '—'}
            </span>
          </div>
        </div>

        <div className="practiceDebug">
          <div className="label">Practice Debug</div>
          <div className="grid">
            <div className="row">
              <div className="label">Lesson Mode</div>
              <div className="value">
                <span className="mono">{practice.debug.lessonMode}</span>
              </div>
            </div>
            <div className="row">
              <div className="label">Expected</div>
              <div className="value">
                <span className="mono">{practice.debug.expected ?? '—'}</span>
              </div>
            </div>
            <div className="row">
              <div className="label">Stable Note</div>
              <div className="value">
                <span className="mono">{practice.debug.stableNote ?? '—'}</span>
                <span className="pill">
                  noteMatch: {practice.debug.noteMatch ? 'true' : 'false'} (mode:{' '}
                  {practice.debug.noteMatchMethod ?? 'false'})
                </span>
              </div>
            </div>
            <div className="row">
              <div className="label">Inferred Chord</div>
              <div className="value">
                <span className="mono">{practice.debug.inferredChord ?? '—'}</span>
                <span className="pill">
                  chordMatch: {practice.debug.chordMatch ? 'true' : 'false'}
                </span>
                <span className="pill">
                  conf: {Math.round((practice.debug.inferredChordConfidence ?? 0) * 100)}%
                </span>
                <span className="pill">state: {practice.debug.inferredChordState ?? '—'}</span>
              </div>
            </div>
            <div className="row">
              <div className="label">Not Accepted</div>
              <div className="value">
                <span className="mono">{practice.debug.reason}</span>
              </div>
            </div>
            <div className="row">
              <div className="label">Timing</div>
              <div className="value">
                <span className="pill">index: {practice.debug.activeIndex + 1}/{practice.debug.total}</span>
                <span className="pill">
                  timeout: {practice.debug.timeoutEnabled ? 'on' : 'off'}
                </span>
                <span className="pill">
                  remaining:{' '}
                  {typeof practice.debug.timeRemainingMs === 'number'
                    ? `${Math.ceil(practice.debug.timeRemainingMs / 1000)}s`
                    : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="timeline">
          {(lesson?.targets ?? []).map((t, idx) => {
            const statusClass = practice.results[idx] ?? 'pending'
            const isActive = idx === practice.activeIndex && practice.state === 'running'
            const cls = `timelineItem ${statusClass} ${isActive ? 'active' : ''}`
            return (
              <div className={cls} key={`${lesson.id}-${idx}`}>
                <div className="timelineIdx">{idx + 1}</div>
                <div className="timelineText mono">{formatTarget(lesson, t)}</div>
              </div>
            )
          })}
        </div>

        <p className="subtle">
          Matching is intentionally simple: notes match the stable detected note; chords match the
          inferred chord.
        </p>

        <div className="attemptStatus" role="status" aria-live="polite">
          {attemptStatus === 'saving' ? (
            <span className="pill">Saving attempt…</span>
          ) : attemptStatus === 'saved' ? (
            <span className="pill pillOn">{attemptMessage || 'Attempt saved'}</span>
          ) : attemptStatus === 'failed' ? (
            <span className="pill">{attemptMessage || 'Save failed'}</span>
          ) : (
            <span className="hint"> </span>
          )}
        </div>
      </section>

      <section className="card" aria-labelledby="audio-feedback-title">
        <h2 id="audio-feedback-title">Audio Feedback</h2>
        <div className="grid">
          <div className="row">
            <div className="label">Status</div>
            <div className="value">
              <span className={`pill ${isListening ? 'pillOn' : 'pillOff'}`}>
                {isListening ? 'listening' : 'not listening'}
              </span>
              <span className="mono">{status}</span>
            </div>
          </div>
          <div className="row">
            <div className="label">Raw Frequency</div>
            <div className="value">{rawFrequencyHz ? `${rawFrequencyHz} Hz` : '—'}</div>
          </div>
          <div className="row">
            <div className="label">Accepted Frequency</div>
            <div className="value">
              {acceptedFrequencyHz ? `${acceptedFrequencyHz} Hz` : '—'}
              {correction !== 'none' ? <span className="pill">{correction}</span> : null}
            </div>
          </div>
          <div className="row">
            <div className="label">Smoothed Frequency</div>
            <div className="value">{smoothedFrequencyHz ? `${smoothedFrequencyHz} Hz` : '—'}</div>
          </div>
          <div className="row">
            <div className="label">Raw Note</div>
            <div className="value">{rawNote ?? '—'}</div>
          </div>
          <div className="row">
            <div className="label">Candidate Note</div>
            <div className="value">{candidateNote ?? '—'}</div>
          </div>
          <div className="row">
            <div className="label">Stable Note</div>
            <div className="value">{note ?? '—'}</div>
          </div>
          <div className="row">
            <div className="label">Transition</div>
            <div className="value">
              <span className={`pill ${transitionPending ? 'pillOn' : 'pillOff'}`}>
                {transitionPending ? 'pending' : 'idle'}
              </span>
              <span className="mono">{candidateAgeMs} ms</span>
              <span className="pill">{blockReason}</span>
              <span className="pill">accepted: {acceptMethod}</span>
            </div>
          </div>
          <div className="row">
            <div className="label">Clarity</div>
            <div className="value">
              <div className="meter" aria-label="clarity">
                <div
                  className="meterFill"
                  style={{ width: `${Math.round(confidence * 100)}%` }}
                />
              </div>
              <div className="meterText">{Math.round(confidence * 100)}%</div>
            </div>
          </div>
          <div className="row">
            <div className="label">Signal</div>
            <div className="value">
              <div className="meter" aria-label="signal strength">
                <div
                  className="meterFill meterFillAlt"
                  style={{ width: `${Math.round(signal * 100)}%` }}
                />
              </div>
              <div className="meterText">{Math.round(signal * 100)}%</div>
            </div>
          </div>
        </div>

        <div className="history">
          <div className="label">Recent Stable Notes</div>
          {noteHistory.length === 0 ? (
            <div className="value subtle">—</div>
          ) : (
            <div className="historyList">
              {noteHistory.slice(0, 8).map((h) => (
                <div className="historyItem" key={`${h.at}-${h.note}`}>
                  <span className="mono">{h.note}</span>
                  <span className="historyMeta">
                    {h.frequencyHz ? `${Math.round(h.frequencyHz * 10) / 10} Hz` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="errorArea" role="status" aria-live="polite">
          {error ? <div className="errorText">{error}</div> : <div className="hint"> </div>}
        </div>
      </section>

      <section className="card" aria-labelledby="chord-title">
        <h2 id="chord-title">Chord (Heuristic Inference)</h2>
        <p className="subtle">
          Prototype inference from recent detected notes (not true polyphonic DSP).
        </p>
        <div className="grid">
          <div className="row">
            <div className="label">Inferred Chord</div>
            <div className="value">
              <span className="mono">{chord.chord ?? '—'}</span>
              <span className={`pill ${chord.state === 'stable' ? 'pillOn' : 'pillOff'}`}>
                {chord.state}
              </span>
            </div>
          </div>
          <div className="row">
            <div className="label">Chord Confidence</div>
            <div className="value">
              <div className="meter" aria-label="chord confidence">
                <div
                  className="meterFill"
                  style={{ width: `${Math.round((chord.confidence ?? 0) * 100)}%` }}
                />
              </div>
              <div className="meterText">{Math.round((chord.confidence ?? 0) * 100)}%</div>
            </div>
          </div>
          <div className="row">
            <div className="label">Note Window</div>
            <div className="value">
              <span className="mono">{(chord.usedWindow ?? []).slice(0, 10).join(', ') || '—'}</span>
            </div>
          </div>
          <div className="row">
            <div className="label">Pitch Classes</div>
            <div className="value">
              <span className="mono">{(chord.presentPitchClasses ?? []).join(', ') || '—'}</span>
            </div>
          </div>
          <div className="row">
            <div className="label">Top Candidates</div>
            <div className="value">
              <span className="mono">
                {(chord.candidates ?? [])
                  .slice(0, 3)
                  .map((c) => `${c.name}:${Math.round(c.score * 100)}%`)
                  .join('  ') || '—'}
              </span>
            </div>
          </div>
          <div className="row">
            <div className="label">Window Age</div>
            <div className="value">
              <span className="mono">{chord.candidateAgeMs} ms</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
