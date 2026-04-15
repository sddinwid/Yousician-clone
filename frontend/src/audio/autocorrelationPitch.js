// Simple autocorrelation-based pitch detection (time domain).
// Designed to be understandable and fast enough for realtime UI updates.

function rms(signal) {
  let sum = 0
  for (let i = 0; i < signal.length; i++) sum += signal[i] * signal[i]
  return Math.sqrt(sum / signal.length)
}

function mean(signal) {
  let sum = 0
  for (let i = 0; i < signal.length; i++) sum += signal[i]
  return sum / signal.length
}

function parabolicInterpolation(corr, tau) {
  const x0 = tau - 1
  const x2 = tau + 1
  if (x0 < 0 || x2 >= corr.length) return tau

  const s0 = corr[x0]
  const s1 = corr[tau]
  const s2 = corr[x2]
  const denom = s0 - 2 * s1 + s2
  if (denom === 0) return tau
  // Peak offset in (-0.5, 0.5)
  const delta = 0.5 * (s0 - s2) / denom
  return tau + delta
}

/**
 * @param {Float32Array} timeDomainBuffer - audio samples in [-1, 1]
 * @param {number} sampleRate
 * @param {{
 *   minFrequencyHz?: number,
 *   maxFrequencyHz?: number,
 *   minRms?: number,
 *   minCorrelation?: number
 *   subharmonicPreference?: number,
 * }} opts
 * @returns {{frequencyHz: number|null, clarity: number, rms: number, subharmonicCorrected: boolean}}
 */
export function detectPitchAutocorrelation(
  timeDomainBuffer,
  sampleRate,
  opts = {},
) {
  const minFrequencyHz = opts.minFrequencyHz ?? 70 // below low E (~82Hz) gives some slack for detune
  const maxFrequencyHz = opts.maxFrequencyHz ?? 1200
  const minRms = opts.minRms ?? 0.01
  const minCorrelation = opts.minCorrelation ?? 0.35
  // If the best peak is a subharmonic (longer lag), prefer the smaller lag when correlation is close.
  // Higher strings are especially prone to octave-low reads in noisy conditions.
  const subharmonicPreference = opts.subharmonicPreference ?? 0.9

  const signalRms = rms(timeDomainBuffer)
  if (!Number.isFinite(signalRms) || signalRms < minRms) {
    return { frequencyHz: null, clarity: 0, rms: signalRms, subharmonicCorrected: false }
  }

  const size = timeDomainBuffer.length
  const minTau = Math.floor(sampleRate / maxFrequencyHz)
  const maxTau = Math.min(Math.floor(sampleRate / minFrequencyHz), size - 2)
  if (maxTau <= minTau) return { frequencyHz: null, clarity: 0, rms: signalRms, subharmonicCorrected: false }

  const dc = mean(timeDomainBuffer)
  let energy = 0
  for (let i = 0; i < size; i++) {
    const x = timeDomainBuffer[i] - dc
    energy += x * x
  }
  if (energy <= 1e-9) return { frequencyHz: null, clarity: 0, rms: signalRms, subharmonicCorrected: false }

  // Unnormalized autocorrelation. For short buffers this is OK and keeps the code simple.
  const corr = new Float32Array(maxTau + 1)
  let bestTau = -1
  let bestCorr = -1

  for (let tau = minTau; tau <= maxTau; tau++) {
    let sum = 0
    for (let i = 0; i < size - tau; i++) {
      const a = timeDomainBuffer[i] - dc
      const b = timeDomainBuffer[i + tau] - dc
      sum += a * b
    }
    corr[tau] = sum
    if (sum > bestCorr) {
      bestCorr = sum
      bestTau = tau
    }
  }

  if (bestTau === -1) return { frequencyHz: null, clarity: 0, rms: signalRms, subharmonicCorrected: false }

  const bestAround = (targetTau) => {
    const t0 = Math.max(minTau, Math.floor(targetTau) - 1)
    const t1 = Math.min(maxTau, Math.floor(targetTau) + 1)
    let tau = t0
    let value = corr[t0]
    for (let t = t0 + 1; t <= t1; t++) {
      if (corr[t] > value) {
        value = corr[t]
        tau = t
      }
    }
    return { tau, value }
  }

  // Normalize by signal energy (tau=0) to get a 0..1-ish clarity metric.
  let clarity = Math.max(0, Math.min(1, bestCorr / energy))

  if (clarity < minCorrelation) {
    return { frequencyHz: null, clarity, rms: signalRms, subharmonicCorrected: false }
  }

  // Subharmonic check: if the strongest peak is at a longer lag, but a shorter lag has nearly
  // the same correlation, prefer the shorter lag (reduces octave-low mistakes).
  const initialTau = bestTau
  for (const div of [2, 3, 4]) {
    const target = bestTau / div
    if (target < minTau) continue
    const { tau, value } = bestAround(target)
    if (value > bestCorr * subharmonicPreference) {
      bestTau = tau
      bestCorr = value
    }
  }
  const subharmonicCorrected = bestTau !== initialTau

  clarity = Math.max(0, Math.min(1, bestCorr / energy))

  const refinedTau = parabolicInterpolation(corr, bestTau)
  const frequencyHz = sampleRate / refinedTau

  if (!Number.isFinite(frequencyHz) || frequencyHz < minFrequencyHz || frequencyHz > maxFrequencyHz) {
    return { frequencyHz: null, clarity, rms: signalRms, subharmonicCorrected }
  }

  return { frequencyHz, clarity, rms: signalRms, subharmonicCorrected }
}
