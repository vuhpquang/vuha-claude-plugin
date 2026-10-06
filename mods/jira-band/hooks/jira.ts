import type { JiraIssue } from '../types'

// The first Jira key in a branch name: feature/MAP-123-add-thing -> MAP-123.
export const issueKeyOf = (branch: string): string | null => /([A-Z][A-Z0-9]+-\d+)/.exec(branch.toUpperCase())?.[1] ?? null

type JiraPayload = {
  key: string
  fields: {
    summary?: string
    status?: { name?: string; statusCategory?: { key?: string } }
    assignee?: { displayName?: string } | null
  }
}

export const toIssue = (payload: JiraPayload, baseUrl: string): JiraIssue => ({
  key: payload.key,
  summary: payload.fields.summary ?? '',
  status: payload.fields.status?.name ?? '?',
  statusCategory: payload.fields.status?.statusCategory?.key ?? 'undefined',
  assignee: payload.fields.assignee?.displayName ?? null,
  url: `${baseUrl}/browse/${payload.key}`,
})

// Jira's status categories: new, indeterminate (in progress), done.
export const statusColor = (category: string) =>
  category === 'done' ? 'success' : category === 'indeterminate' ? 'suggestion' : 'inactive'

const base64 = (text: string) => {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)

  return btoa(binary)
}

export const authHeader = (token: string, user: string) =>
  user ? `Basic ${base64(`${user}:${token}`)}` : `Bearer ${token}`
