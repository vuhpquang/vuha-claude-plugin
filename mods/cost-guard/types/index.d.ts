export type WarningId = string

declare module 'claude-code' {
  interface PluginState {
    'cost-guard': { warned: WarningId[] }
  }
}
