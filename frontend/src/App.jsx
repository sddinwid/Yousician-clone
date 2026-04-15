import './App.css'
import { usePitchDetector } from './hooks/usePitchDetector'
import { useChordInference } from './hooks/useChordInference'

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
        <h2 id="chord-title">Chord (Heuristic)</h2>
        <p className="subtle">
          Prototype chord inference from recent detected single notes (not true polyphonic DSP).
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
