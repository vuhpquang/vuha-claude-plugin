import { expect, test } from 'claude-code/testing'

import { newWarnings, statusText } from '../hooks/guard'

const limits = { costWarnUsd: 5, rateWarnPercent: 80 }

test('status line shows cost and each window', async () => {
  expect(statusText(1.234, [{ kind: 'five_hour', percentUsed: 41.6 }, { kind: 'seven_day', percentUsed: 12 }])).toBe(
    '$1.23 · 5h 42% · 7d 12%',
  )
  expect(statusText(undefined, [])).toBe('')
})

test('warns once per crossed threshold', async () => {
  const windows = [{ kind: 'five_hour', percentUsed: 85 }]

  expect(newWarnings(6, windows, limits, []).map(w => w.id)).toEqual(['cost', 'rate:five_hour'])
  expect(newWarnings(6, windows, limits, ['cost', 'rate:five_hour'])).toEqual([])
  expect(newWarnings(1, [{ kind: 'five_hour', percentUsed: 10 }], limits, [])).toEqual([])
})

test('a zero threshold is off', async () => {
  expect(newWarnings(100, [{ kind: 'five_hour', percentUsed: 99 }], { costWarnUsd: 0, rateWarnPercent: 0 }, [])).toEqual([])
})
