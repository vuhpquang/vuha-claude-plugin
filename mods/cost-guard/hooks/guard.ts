export type RateWindow = { kind: string; percentUsed: number }

export const WINDOW_LABELS: Record<string, string> = { five_hour: '5h', seven_day: '7d' }

export const statusText = (usd: number | undefined, windows: RateWindow[]) =>
  [
    usd === undefined ? null : `$${usd.toFixed(2)}`,
    ...windows.map(w => `${WINDOW_LABELS[w.kind] ?? w.kind} ${Math.round(w.percentUsed)}%`),
  ]
    .filter(part => part !== null)
    .join(' · ')

// The thresholds newly crossed, each named once; `warned` holds the ones already said.
export const newWarnings = (
  usd: number | undefined,
  windows: RateWindow[],
  limits: { costWarnUsd: number; rateWarnPercent: number },
  warned: readonly string[],
) => {
  const found: { id: string; text: string }[] = []

  if (limits.costWarnUsd > 0 && usd !== undefined && usd >= limits.costWarnUsd) {
    found.push({ id: 'cost', text: `Session cost passed $${limits.costWarnUsd} ($${usd.toFixed(2)})` })
  }
  for (const w of windows) {
    if (limits.rateWarnPercent > 0 && w.percentUsed >= limits.rateWarnPercent) {
      found.push({
        id: `rate:${w.kind}`,
        text: `${WINDOW_LABELS[w.kind] ?? w.kind} rate limit at ${Math.round(w.percentUsed)}%`,
      })
    }
  }

  return found.filter(warning => !warned.includes(warning.id))
}
