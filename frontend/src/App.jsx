import './App.css'
import { usePitchDetector } from './hooks/usePitchDetector'

function App() {
  const {
    isListening,
    status,
    error,
    frequencyHz,
    note,
    confidence,
    signal,
    start,
    stop,
  } = usePitchDetector()

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
            <div className="value">{status}</div>
          </div>
          <div className="row">
            <div className="label">Frequency</div>
            <div className="value">{frequencyHz ? `${frequencyHz} Hz` : '—'}</div>
          </div>
          <div className="row">
            <div className="label">Note</div>
            <div className="value">{note ?? '—'}</div>
          </div>
          <div className="row">
            <div className="label">Confidence</div>
            <div className="value">
              <div className="meter" aria-label="confidence">
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

        <div className="errorArea" role="status" aria-live="polite">
          {error ? <div className="errorText">{error}</div> : <div className="hint"> </div>}
        </div>
      </section>
    </main>
  )
}

export default App
