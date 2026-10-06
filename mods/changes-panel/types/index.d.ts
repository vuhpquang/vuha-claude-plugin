export type FileChange = {
  path: string
  /** Two-letter porcelain status (`M `, ` M`, `??`, `A `, `D `, `R `…). */
  status: string
  added: number
  removed: number
}

export type RepoInfo = {
  branch: string
  /** Commits on HEAD the upstream does not have; null without an upstream. */
  ahead: number | null
}

declare module 'claude-code' {
  interface PluginState {
    'changes-panel': {
      files: FileChange[]
      repo: RepoInfo | null
      /** The file whose diff the pane shows; null shows the list alone. */
      selected: string | null
      diff: string[]
      error: string | null
    }
  }
}
