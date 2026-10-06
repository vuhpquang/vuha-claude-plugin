import { expect, test } from 'claude-code/testing'

import { highlight, parseDiff, toSplit } from '../hooks/diff'

const SAMPLE = [
  'diff --git a/x b/x',
  'index 1..2 100644',
  '--- a/x',
  '+++ b/x',
  '@@ -1,4 +1,4 @@ function f() {',
  ' keep',
  '-const a = 1',
  '+const a = 2',
  '+extra',
  ' end',
  '\\ No newline at end of file',
  '',
]

test('parses hunks with old and new line numbers, skipping the header', async () => {
  expect(parseDiff(SAMPLE)).toEqual([
    { kind: 'hunk', text: 'function f() {' },
    { kind: 'context', oldNo: 1, newNo: 1, text: 'keep' },
    { kind: 'remove', oldNo: 2, text: 'const a = 1', pair: 'const a = 2' },
    { kind: 'add', newNo: 2, text: 'const a = 2', pair: 'const a = 1' },
    { kind: 'add', newNo: 3, text: 'extra' },
    { kind: 'context', oldNo: 3, newNo: 4, text: 'end' },
  ])
})

test('side by side puts a removal next to the addition that replaced it', async () => {
  const split = toSplit(parseDiff(SAMPLE))

  expect(split.map(row => (row.kind === 'hunk' ? 'hunk' : [row.left?.text ?? null, row.right?.text ?? null]))).toEqual([
    'hunk',
    ['keep', 'keep'],
    ['const a = 1', 'const a = 2'],
    [null, 'extra'],
    ['end', 'end'],
  ])
})

test('highlights only the part of a line that changed', async () => {
  expect(highlight('const a = 2', 'const a = 1')).toEqual([
    { text: 'const a = ', changed: false },
    { text: '2', changed: true },
  ])
  expect(highlight('abc', 'xyz')).toEqual([{ text: 'abc', changed: false }])
  expect(highlight('same', undefined)).toEqual([{ text: 'same', changed: false }])
})
