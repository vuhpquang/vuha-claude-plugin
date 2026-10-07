export type FileChange = {
  path: string
  /** Two-letter porcelain status (`M `, ` M`, `??`, `A `, `D `, `R `…). */
  status: string
  added: number
  removed: number
}

export type RepoInfo = {
  /** The work tree's top folder: git's paths are relative to it, so every command runs there. */
  root: string
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
      /** How the diff is drawn: one column, or old and new side by side. */
      mode: 'unified' | 'split'
      error: string | null
    }
  }
}
