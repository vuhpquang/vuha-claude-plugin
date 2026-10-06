import { expect, test } from 'claude-code/testing'

import { statusBadge, toMergeRequest } from '../hooks/gitlab'

const mr = (over: Record<string, unknown> = {}) =>
  toMergeRequest({
    id: 1,
    iid: 42,
    title: 'feat: add thing',
    web_url: 'https://gitlab.example.com/group/app/-/merge_requests/42',
    references: { full: 'group/app!42' },
    author: { username: 'someone' },
    ...over,
  })

test('maps the GitLab payload', async () => {
  expect(mr()).toEqual({
    id: 1,
    iid: 42,
    title: 'feat: add thing',
    url: 'https://gitlab.example.com/group/app/-/merge_requests/42',
    project: 'group/app',
    author: 'someone',
    status: 'unchecked',
    isDraft: false,
    hasConflicts: false,
    notes: 0,
  })
})

test('conflicts and drafts win over the merge status', async () => {
  expect(statusBadge(mr({ has_conflicts: true, detailed_merge_status: 'mergeable' })).text).toBe('conflict')
  expect(statusBadge(mr({ draft: true, detailed_merge_status: 'mergeable' })).text).toBe('draft')
})

test('names the merge statuses', async () => {
  expect(statusBadge(mr({ detailed_merge_status: 'mergeable' }))).toEqual({ text: 'ready', color: 'success' })
  expect(statusBadge(mr({ detailed_merge_status: 'ci_must_pass' })).text).toBe('ci failed')
  expect(statusBadge(mr({ detailed_merge_status: 'some_new_status' })).text).toBe('some new status')
})
