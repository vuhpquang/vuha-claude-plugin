export type ContextRow = {
  name: string
  tokens: number
  color: string
  kind: 'used' | 'free' | 'buffer'
}

export type RateWindow = { kind: string; percentUsed: number }

export type ContextSnapshot = {
  totalTokens: number
  maxTokens: number
  percentage: number
  compactsAt: number | null
  rows: ContextRow[]
  model: string
  project: string
  branch: string
  costUsd: number | null
  rateLimits: RateWindow[]
  startedAt: number
}

declare module 'claude-code' {
  interface PluginState {
    'context-bar': { snapshot: ContextSnapshot | null; isShown: boolean }
  }
}
