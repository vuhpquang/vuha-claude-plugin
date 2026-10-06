import { expect, test } from 'claude-code/testing'

import { diffLineKind, fillTarget, mergeChanges, parseNumstat, parseStatus, statusLetter } from '../hooks/git'

test('parses porcelain -z status, skipping the old path of a rename', async () => {
  const out = ' M src/a.ts\0R  src/new.ts\0src/old.ts\0?? notes.md\0A  src/b.ts\0'

  expect(parseStatus(out)).toEqual([
    { path: 'src/a.ts', status: ' M' },
    { path: 'src/new.ts', status: 'R ' },
    { path: 'notes.md', status: '??' },
    { path: 'src/b.ts', status: 'A ' },
  ])
})

test('parses numstat -z, including binaries and renames', async () => {
  const out = '3\t1\tsrc/a.ts\0-\t-\timg.png\0' + '2\t0\t\0src/old.ts\0src/new.ts\0'
  const stats = parseNumstat(out)

  expect(stats.get('src/a.ts')).toEqual({ added: 3, removed: 1 })
  expect(stats.get('img.png')).toEqual({ added: 0, removed: 0 })
  expect(stats.get('src/new.ts')).toEqual({ added: 2, removed: 0 })
})

test('merges status with counts, untracked files counted by their lines', async () => {
  const merged = mergeChanges(
    [
      { path: 'z.ts', status: ' M' },
      { path: 'new.md', status: '??' },
    ],
    new Map([['z.ts', { added: 4, removed: 2 }]]),
    new Map([['new.md', 10]]),
  )

  expect(merged).toEqual([
    { path: 'new.md', status: '??', added: 10, removed: 0 },
    { path: 'z.ts', status: ' M', added: 4, removed: 2 },
  ])
})

test('one status letter per row and a kind per diff line', async () => {
  expect([statusLetter(' M'), statusLetter('M '), statusLetter('??'), statusLetter('D ')]).toEqual(['M', 'M', 'U', 'D'])
  expect(['+++ b/a', '@@ -1 +1 @@', '+x', '-y', ' z'].map(diffLineKind)).toEqual(['meta', 'hunk', 'add', 'remove', 'context'])
})

test('the review prompt names the selected file or all changes', async () => {
  expect(fillTarget('Review {target}.', null)).toBe('Review the uncommitted changes.')
  expect(fillTarget('Review {target}.', 'src/a.ts')).toBe('Review the uncommitted changes in src/a.ts.')
})
