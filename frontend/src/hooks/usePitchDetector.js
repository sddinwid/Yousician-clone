import { useCallback, useEffect, useRef, useState } from 'react'
import { detectPitchAutocorrelation } from '../audio/autocorrelationPitch'
import { frequencyToNoteName } from '../audio/note'

const DEFAULTS = {
  minFrequencyHz: 70,
  maxFrequencyHz: 1200,
  minRms: 0.01,
  minCorrelation: 0.35,
}

export function usePitchDetector(options = {}) {
  const opts = { ...DEFAULTS, ...options }

  const [isListening, setIsListening] = useState(false)
  const [status, setStatus] = useState('idle') // idle | requesting | listening | stopped | error
  const [error, setError] = useState(null)
  const [frequencyHz, setFrequencyHz] = useState(null)
  const [note, setNote] = useState(null)
  const [confidence, setConfidence] = useState(0)
  const [signal, setSignal] = useState(0)

  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const sourceRef = useRef(null)
  const streamRef = useRef(null)
  const rafRef = useRef(0)
  const bufferRef = useRef(null)

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
  }, [])

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

      const tick = () => {
        const ctx = audioContextRef.current
        const an = analyserRef.current
        const buf = bufferRef.current

        if (!ctx || !an || !buf) return

        an.getFloatTimeDomainData(buf)
        const { frequencyHz: f, clarity, rms } = detectPitchAutocorrelation(buf, ctx.sampleRate, opts)

        setSignal(Math.max(0, Math.min(1, rms / 0.2))) // UI-only normalization
        setConfidence(clarity)
        setFrequencyHz(f ? Math.round(f * 10) / 10 : null)
        setNote(f ? frequencyToNoteName(f) : null)

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
    frequencyHz,
    note,
    confidence,
    signal,
    start,
    stop,
  }
}

