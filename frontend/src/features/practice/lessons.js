export const LESSONS = [
  {
    id: 'open-strings',
    title: 'Open string practice',
    description: 'Pluck each open string cleanly. One target at a time.',
    mode: 'note',
    targets: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
    timeoutMs: 2600,
  },
  {
    id: 'open-chords',
    title: 'Basic open chord practice',
    description: 'Strum the chord and let the heuristic inference settle.',
    mode: 'chord',
    targets: ['Em', 'G', 'C', 'D'],
    timeoutMs: 4200,
  },
  {
    id: 'mixed-quick',
    title: 'Mixed quick practice',
    description: 'A short mix of notes and chords for a quick demo run.',
    mode: 'mixed',
    targets: [
      { type: 'note', value: 'E2' },
      { type: 'chord', value: 'Em' },
      { type: 'note', value: 'G3' },
      { type: 'chord', value: 'C' },
      { type: 'note', value: 'E4' },
    ],
    timeoutMs: 3400,
  },
]

export function getLessonById(id) {
  return LESSONS.find((l) => l.id === id) ?? LESSONS[0]
}

export function formatTarget(lesson, target) {
  if (!lesson) return ''
  if (lesson.mode === 'mixed') {
    return `${target.type === 'chord' ? 'Chord' : 'Note'}: ${target.value}`
  }
  return target
}

