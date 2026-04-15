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
 * - Score each known open chord with guitar-friendly heuristics:
 *   - strongly reward root + at least one other chord tone
 *   - tolerate missing a tone (strums are messy; we may not observe all triad tones)
 *   - penalize extra tones lightly (laptop mics + harmonic content can add spurious notes)
 */
export function inferOpenChordFromHistory(
  noteHistory,
  {
    windowMs = 3200,
    maxNotes = 18,
    halfLifeMs = 700,
    minPitchClassWeight = 0.08,
    extraPenaltyPerTone = 0.07,
    rootBonus = 0.12,
    twoToneBonus = 0.12,
    subsetBonus = 0.08,
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
      candidates: [],
      presentPitchClasses: [],
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
    const [root, third, fifth] = tpl.tones
    const rootW = weights[root] ?? 0
    const thirdW = weights[third] ?? 0
    const fifthW = weights[fifth] ?? 0

    const rootPresent = rootW >= minPitchClassWeight
    const thirdPresent = thirdW >= minPitchClassWeight
    const fifthPresent = fifthW >= minPitchClassWeight

    const presentRequired = [rootPresent && root, thirdPresent && third, fifthPresent && fifth].filter(Boolean)
    const requiredCount = presentRequired.length

    const extras = presentPitchClasses.filter((pc) => !tpl.tones.includes(pc))
    const penalty = clamp01(extras.length * extraPenaltyPerTone)

    // Weighted coverage: root matters most for open-chord identification.
    const coverageScore =
      clamp01(
        (rootPresent ? 0.48 : 0) +
          (thirdPresent ? 0.28 : 0) +
          (fifthPresent ? 0.24 : 0),
      )

    let score = clamp01(coverageScore - penalty)

    if (rootPresent) score = clamp01(score + rootBonus)
    if (requiredCount >= 2) score = clamp01(score + twoToneBonus)

    // If the observed pitch classes are mostly a subset of the chord tones, bump it slightly.
    if (presentPitchClasses.length > 0 && extras.length === 0) score = clamp01(score + subsetBonus)

    return {
      name: tpl.name,
      score,
      coverage: requiredCount / 3,
      presentRequired,
      extras,
      rootPresent,
    }
  }

  const scored = CHORD_TEMPLATES.map(scoreChord).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (b.coverage !== a.coverage) return b.coverage - a.coverage
    return a.extras.length - b.extras.length
  })

  const best = scored[0]
  return {
    chord: best?.score >= 0.25 ? best.name : null,
    confidence: best?.score ?? 0,
    usedWindow: recent.map((h) => h.note),
    pitchClassWeights: weights,
    best,
    candidates: scored.slice(0, 3),
    presentPitchClasses,
  }
}
