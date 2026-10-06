export type AgentScope = 'project' | 'user'

export type AgentEntry = {
  name: string
  description: string
  model: string | null
  color: string | null
  scope: AgentScope
}

declare module 'claude-code' {
  interface PluginState {
    'agents-panel': { agents: AgentEntry[] }
  }
}
