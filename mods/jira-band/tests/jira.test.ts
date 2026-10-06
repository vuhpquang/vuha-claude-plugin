import { expect, test } from 'claude-code/testing'

import { authHeader, issueKeyOf, statusColor, toIssue } from '../hooks/jira'

test('finds the Jira key in a branch name', async () => {
  expect(issueKeyOf('feature/MAP-123-add-thing')).toBe('MAP-123')
  expect(issueKeyOf('bugfix/fsm-42_fix')).toBe('FSM-42')
  expect(issueKeyOf('main')).toBe(null)
})

test('maps the Jira payload', async () => {
  const issue = toIssue(
    {
      key: 'MAP-1',
      fields: {
        summary: 'Add thing',
        status: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
        assignee: { displayName: 'Vu Ha' },
      },
    },
    'https://jira.example.com',
  )

  expect(issue.url).toBe('https://jira.example.com/browse/MAP-1')
  expect(issue.status).toBe('In Progress')
  expect(statusColor(issue.statusCategory)).toBe('suggestion')
})

test('bearer without a user, basic with one', async () => {
  expect(authHeader('tok', '')).toBe('Bearer tok')
  expect(authHeader('tok', 'me')).toBe(`Basic ${btoa('me:tok')}`)
})
