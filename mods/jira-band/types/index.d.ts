export type JiraIssue = {
  key: string
  summary: string
  status: string
  statusCategory: string
  assignee: string | null
  url: string
}

export type JiraView = {
  branch: string
  key: string | null
  issue: JiraIssue | null
  error: string | null
  fetchedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'jira-band': { view: JiraView | null; isHidden: boolean }
  }
}
