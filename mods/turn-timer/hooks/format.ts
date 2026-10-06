export const formatDuration = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`

  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`

  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export const turnText = (seconds: number, tools: number, isRunning: boolean) =>
  `${isRunning ? '⏱' : '✓'} ${formatDuration(seconds)} · ${tools} tool${tools === 1 ? '' : 's'}`
