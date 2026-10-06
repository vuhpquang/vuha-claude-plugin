export type AgentScope = 'project' | 'user' | 'plugin'

export type AgentEntry = {
  name: string
  description: string
  model: string | null
  color: string | null
  scope: AgentScope
  /** The plugin that ships it, for `scope: 'plugin'`; null otherwise. */
  plugin: string | null
}

declare module 'claude-code' {
  interface PluginState {
    'agents-panel': {
      /** Agent files in .claude/agents and ~/.claude/agents, read when the pane opens. */
      agents: AgentEntry[]
      /** Agent files of enabled plugins (installed_plugins.json + enabledPlugins), read when the pane opens. */
      pluginFiles: AgentEntry[]
      /** Plugin agent types, as the engine offers them to the model (covers plugins loaded from a folder). */
      offered: AgentEntry[]
      /** Plugin groups the person flipped from their default open/closed state. */
      toggled: string[]
    }
  }
}
