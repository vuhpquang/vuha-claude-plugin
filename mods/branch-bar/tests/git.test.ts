import { expect, test } from 'claude-code/testing'

import { filterRefs, gitError, isValidBranchName, parseCounts, parseRefs, switchArgv } from '../hooks/git'

const REFS = [
  'refs/heads/master\t2 hours ago',
  'refs/heads/feat/FM-7638-pay\t3 days ago',
  'refs/remotes/origin/HEAD\t2 hours ago',
  'refs/remotes/origin/master\t2 hours ago',
  'refs/remotes/origin/feat/FM-9000-new\t1 day ago',
  'refs/remotes/upstream/feat/FM-9000-new\t1 day ago',
  '',
].join('\n')

test('local branches first, then remote branches no local one shadows, once each', async () => {
  expect(parseRefs(REFS)).toEqual([
    { name: 'master', remote: null, when: '2 hours ago' },
    { name: 'feat/FM-7638-pay', remote: null, when: '3 days ago' },
    { name: 'feat/FM-9000-new', remote: 'origin/feat/FM-9000-new', when: '1 day ago' },
  ])
})

test('the filter matches every word anywhere, ignoring case', async () => {
  const refs = parseRefs(REFS)
  expect(filterRefs(refs, 'fm pay').map(ref => ref.name)).toEqual(['feat/FM-7638-pay'])
  expect(filterRefs(refs, '').length).toBe(3)
})

test('counts, names, argv and errors', async () => {
  expect(parseCounts('2\t5\n')).toEqual({ behind: 2, ahead: 5 })
  expect(isValidBranchName('feat/FM-1-x')).toBe(true)
  for (const bad of ['', 'a b', 'a..b', '-x', 'x/', 'x.lock', 'a~1', 'a:b']) {
    expect(isValidBranchName(bad)).toBe(false)
  }
  expect(switchArgv({ name: 'x', remote: 'origin/x' })).toEqual(['switch', '--track', 'origin/x'])
  expect(gitError('hint: a\nerror: Your local changes would be overwritten\n')).toBe(
    'error: Your local changes would be overwritten',
  )
})
