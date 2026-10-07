export type StepStatus = 'pending' | 'in_progress' | 'done'

export type Step = {
  title: string
  status: StepStatus
  /** A short note: what was found, why it was skipped. */
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'steps-panel': {
      steps: Step[]
      /** The plan's goal, one line. */
      goal: string | null
      /** When the plan last changed (ms since epoch); 0 before any plan. */
      updatedAt: number
    }
  }
}
