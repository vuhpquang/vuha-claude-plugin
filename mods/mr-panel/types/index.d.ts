export type MergeRequest = {
  id: number
  iid: number
  title: string
  url: string
  project: string
  author: string
  status: string
  isDraft: boolean
  hasConflicts: boolean
  notes: number
}

export type MrLists = {
  mine: MergeRequest[]
  toReview: MergeRequest[]
  fetchedAt: number
  error: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'mr-panel': { lists: MrLists | null; isLoading: boolean }
  }
}
