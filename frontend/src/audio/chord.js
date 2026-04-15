const CHORD_TEMPLATES = [
  { name: 'C', tones: ['C', 'E', 'G'], root: 'C' },
  { name: 'G', tones: ['G', 'B', 'D'], root: 'G' },
  { name: 'D', tones: ['D', 'F#', 'A'], root: 'D' },
  { name: 'A', tones: ['A', 'C#', 'E'], root: 'A' },
  { name: 'E', tones: ['E', 'G#', 'B'], root: 'E' },
  { name: 'Am', tones: ['A', 'C', 'E'], root: 'A' },
  { name: 'Em', tones: ['E', 'G', 'B'], root: 'E' },
  { name: 'Dm', tones: ['D', 'F', 'A'], root: 'D' },
]

const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function noteNameToPitchClass(noteName) {
  if (!noteName || typeof noteName !== 'string') return null
  // Accept like "F#3", "E2" -> "F#", "E"
  const match = noteName.trim().match(/^([A-G])(#|b)?/)
  if (!match) return null
  const letter = match[1]
  const accidental = match[2] ?? ''
  const pc = `${letter}${accidental}`
  if (PITCH_CLASSES.includes(pc)) return pc
  // Basic enharmonic support for flats.
  if (accidental === 'b') {
    const idx = PITCH_CLASSES.indexOf(letter)
    return PITCH_CLASSES[(idx + 11) % 12]
  }
  return null
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x))
}

/**
 * Pragmatic chord inference from a rolling note history:
 * - Normalize notes to pitch classes.
 * - Build a recency-weighted pitch-class histogram.
 * - Score each known open chord by coverage minus extra-tone penalty.
 */
export function inferOpenChordFromHistory(
  noteHistory,
  {
    windowMs = 2500,
    maxNotes = 14,
    halfLifeMs = 900,
    minPitchClassWeight = 0.12,
    extraPenaltyPerTone = 0.12,
    rootBonus = 0.06,
  } = {},
) {
  const now = Date.now()
  const recent = (Array.isArray(noteHistory) ? noteHistory : [])
    .filter((h) => h && typeof h.at === 'number' && now - h.at <= windowMs)
    .slice(0, maxNotes)

  if (recent.length === 0) {
    return {
      chord: null,
      confidence: 0,
      usedWindow: [],
      pitchClassWeights: {},
      best: null,
    }
  }

  const weights = {}
  for (const h of recent) {
    const pc = noteNameToPitchClass(h.note)
    if (!pc) continue
    const age = Math.max(0, now - h.at)
    const w = Math.pow(0.5, age / halfLifeMs)
    weights[pc] = (weights[pc] ?? 0) + w
  }

  const presentPitchClasses = Object.entries(weights)
    .filter(([, w]) => w >= minPitchClassWeight)
    .map(([pc]) => pc)

  const scoreChord = (tpl) => {
    const required = tpl.tones
    const presentRequired = required.filter((pc) => (weights[pc] ?? 0) >= minPitchClassWeight)
    const coverage = presentRequired.length / required.length

    const extras = presentPitchClasses.filter((pc) => !required.includes(pc))
    const penalty = clamp01(extras.length * extraPenaltyPerTone)

    let score = clamp01(coverage - penalty)
    if ((weights[tpl.root] ?? 0) >= minPitchClassWeight) score = clamp01(score + rootBonus)

    return {
      name: tpl.name,
      score,
      coverage,
      presentRequired,
      extras,
    }
  }

  const scored = CHORD_TEMPLATES.map(scoreChord).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.coverage !== a.coverage) return b.coverage - a.coverage
    return a.extras.length - b.extras.length
  })

  const best = scored[0]
  return {
    chord: best?.score > 0 ? best.name : null,
    confidence: best?.score ?? 0,
    usedWindow: recent.map((h) => h.note),
    pitchClassWeights: weights,
    best,
  }
}

