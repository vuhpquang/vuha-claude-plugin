import { expect, test } from 'claude-code/testing'

import { formatDuration, turnText } from '../hooks/format'

test('formats durations', async () => {
  expect(formatDuration(9.4)).toBe('9s')
  expect(formatDuration(75)).toBe('1m15s')
  expect(formatDuration(3725)).toBe('1h02m')
})

test('turn text shows running and finished turns', async () => {
  expect(turnText(12, 1, true)).toBe('⏱ 12s · 1 tool')
  expect(turnText(130, 8, false)).toBe('✓ 2m10s · 8 tools')
})
