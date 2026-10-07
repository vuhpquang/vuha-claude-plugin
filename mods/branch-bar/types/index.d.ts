export type BranchRef = {
  /** What `git switch` takes: a local name, or for a remote-only branch its name without the remote. */
  name: string
  /** `origin/feat/x` for a branch that exists only on a remote; null for a local one. */
  remote: string | null
  /** `3 days ago`. */
  when: string
}

export type RepoState = {
  root: string
  /** The branch name, or the short commit when HEAD is detached. */
  branch: string
  isDetached: boolean
  hasUpstream: boolean
  ahead: number
  behind: number
  /** Uncommitted changes in the work tree. */
  isDirty: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'branch-bar': {
      repo: RepoState | null
      /** What is running now: 'pull', 'switch', 'fetch'; null when idle. */
      busy: string | null
      branches: BranchRef[]
      filter: string
      /** The last git failure, shown in the picker until the next action. */
      error: string | null
    }
  }
}
