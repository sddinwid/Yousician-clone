import { PitchDetector } from 'pitchy'

/**
 * Creates a lightweight, browser-friendly pitch estimator.
 *
 * We use `pitchy` because it’s a mature, well-tested in-browser pitch detector that returns both:
 * - estimated frequency (Hz)
 * - clarity/confidence (0..1)
 *
 * This replaces the prototype autocorrelation estimator, while keeping the rest of the
 * stabilization + note history + chord/practice pipeline unchanged.
 */
export function createPitchEstimator(bufferSize) {
  const detector = PitchDetector.forFloat32Array(bufferSize)

  return function estimatePitch(timeDomainBuffer, sampleRate) {
    const [frequencyHz, clarity] = detector.findPitch(timeDomainBuffer, sampleRate)
    if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) {
      return { frequencyHz: null, clarity: 0 }
    }
    return { frequencyHz, clarity: Number.isFinite(clarity) ? clarity : 0 }
  }
}

