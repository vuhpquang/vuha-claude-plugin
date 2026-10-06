import { expect, test } from 'claude-code/testing'

import type { ContextRow } from '../types'
import { barCells, formatDuration, formatTokens, levelColor, windowLabel } from '../hooks/format'

const row = (name: string, tokens: number, kind: ContextRow['kind'] = 'used'): ContextRow => ({
  name,
  tokens,
  color: 'claude',
  kind,
})

test('formats tokens as /context does', async () => {
  expect(formatTokens(512)).toBe('512')
  expect(formatTokens(4200)).toBe('4.2k')
  expect(formatTokens(17000)).toBe('17k')
  expect(formatTokens(1_000_000)).toBe('1M')
})

test('formats the session time like the old status line', async () => {
  expect(formatDuration(47_000)).toBe('0m 47s')
  expect(formatDuration(21 * 60_000 + 47_000)).toBe('21m 47s')
  expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2h 05m')
})

test('names rate-limit windows and colours levels', async () => {
  expect(windowLabel({ kind: 'five_hour', percentUsed: 10.4 })).toBe('5h 10%')
  expect(windowLabel({ kind: 'spend_limit', percentUsed: 3 })).toBe('spend_limit 3%')
  expect([levelColor(9), levelColor(50), levelColor(80)]).toEqual(['success', 'warning', 'error'])
})

test('bar cells fill the width exactly', async () => {
  const rows = [row('System prompt', 4200), row('Tools', 17000), row('Free space', 978800, 'free')]
  const cells = barCells(rows, 1_000_000, 100)

  expect(cells.reduce((sum, cell) => sum + cell.count, 0)).toBe(100)
})

test('a tiny category still gets one cell', async () => {
  const cells = barCells([row('Skills', 10), row('Free space', 999_990, 'free')], 1_000_000, 50)

  expect(cells[0]?.count).toBe(1)
  expect(cells[1]?.count).toBe(49)
})

test('empty categories are left out of the bar', async () => {
  const cells = barCells([row('Messages', 0), row('Free space', 1000, 'free')], 1000, 20)

  expect(cells.length).toBe(1)
})
