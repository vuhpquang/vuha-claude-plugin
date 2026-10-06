export type ContextRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type ContextSnapshot = {
  totalTokens: number
  maxTokens: number
  percentage: number
  compactsAt: number | null
  rows: ContextRow[]
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { snapshot: ContextSnapshot | null; isShown: boolean }
  }
}
