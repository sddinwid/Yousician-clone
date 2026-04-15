const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function frequencyToMidi(frequencyHz) {
  return 69 + 12 * Math.log2(frequencyHz / 440)
}

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiToNoteName(midi) {
  const rounded = Math.round(midi)
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12]
  const octave = Math.floor(rounded / 12) - 1
  return `${name}${octave}`
}

export function frequencyToNoteName(frequencyHz) {
  if (!Number.isFinite(frequencyHz) || frequencyHz <= 0) return null
  return midiToNoteName(frequencyToMidi(frequencyHz))
}
