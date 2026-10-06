import type { ContextRow, RateWindow } from '../types'

export const formatTokens = (n: number) =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${+(n / 1000).toFixed(1)}k`
      : `${n}`

export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`

  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

const WINDOW_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

export const windowLabel = (w: RateWindow) => `${WINDOW_LABELS[w.kind] ?? w.kind} ${Math.round(w.percentUsed)}%`

// green under 50, yellow under 80, red from 80: for context and rate-limit percentages alike
export const levelColor = (percent: number) => (percent >= 80 ? 'error' : percent >= 50 ? 'warning' : 'success')

// One cell per category share of `width`; a non-empty category always gets a cell.
export const barCells = (rows: ContextRow[], max: number, width: number) => {
  const cells = rows.map(row => ({
    row,
    count: row.tokens > 0 ? Math.max(1, Math.round((row.tokens / max) * width)) : 0,
  }))
  const free = cells.find(cell => cell.row.kind === 'free')
  const overflow = cells.reduce((sum, cell) => sum + cell.count, 0) - width

  if (free && overflow !== 0) {
    free.count = Math.max(0, free.count - overflow)
  }

  return cells.filter(cell => cell.count > 0)
}
