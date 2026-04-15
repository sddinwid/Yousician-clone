export function formatTarget(lesson, target) {
  if (!lesson) return ''
  if (lesson.mode === 'mixed') {
    return `${target.type === 'chord' ? 'Chord' : 'Note'}: ${target.value}`
  }
  return target
}
