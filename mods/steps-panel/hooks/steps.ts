import type { Step, StepStatus } from '../types'

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'done']

export const TOOL_NAME = 'plan'

export const TOOL_DESCRIPTION = [
  'Show the user your plan as a checklist of steps, in a panel beside the conversation.',
  'Call it before starting any task with 3 or more steps, then again every time a step starts or finishes:',
  'each call sends the WHOLE list (it replaces the previous one). Keep exactly one step in_progress while working,',
  'mark a step done as soon as it is finished, add steps you discover, and put a short note on a step when it',
  'turned out differently (skipped, failed, found something). Titles are short imperative phrases in the language',
  'the user writes in. Not for one-step tasks or pure questions.',
].join(' ')

export const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    goal: { type: 'string', description: 'What the whole plan achieves, one short line.' },
    steps: {
      type: 'array',
      description: 'Every step of the plan, in order.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          status: { type: 'string', enum: STATUSES },
          note: { type: 'string' },
        },
        required: ['title', 'status'],
      },
    },
  },
  required: ['steps'],
} as const

export const PROMPT_SECTION = [
  '# Showing your plan',
  `For any task with 3 or more steps, keep the user's step panel current with the mcp__steps-panel__${TOOL_NAME} tool:`,
  'call it with the full list before you start, and again whenever a step starts, finishes, is added or is dropped.',
  'Exactly one step is in_progress while you work; all are done when you finish.',
].join('\n')

// Validates what the model sent; returns the steps or the reason they were refused.
export const parsePlan = (input: unknown): { goal: string | null; steps: Step[] } | { error: string } => {
  if (typeof input !== 'object' || input === null) {
    return { error: 'input must be an object with a steps array' }
  }
  const { goal, steps } = input as { goal?: unknown; steps?: unknown }
  if (!Array.isArray(steps)) {
    return { error: 'steps must be an array' }
  }
  const parsed: Step[] = []
  for (const [index, raw] of steps.entries()) {
    const step = raw as { title?: unknown; status?: unknown; note?: unknown }
    if (typeof step?.title !== 'string' || step.title.trim() === '') {
      return { error: `step ${index + 1} needs a title` }
    }
    if (!STATUSES.includes(step.status as StepStatus)) {
      return { error: `step ${index + 1} has status "${String(step.status)}"; use pending, in_progress or done` }
    }
    parsed.push({
      title: step.title.trim(),
      status: step.status as StepStatus,
      ...(typeof step.note === 'string' && step.note.trim() !== '' ? { note: step.note.trim() } : {}),
    })
  }

  return { goal: typeof goal === 'string' && goal.trim() !== '' ? goal.trim() : null, steps: parsed }
}

export const progress = (steps: readonly Step[]) => {
  const done = steps.filter(step => step.status === 'done').length
  const current = steps.find(step => step.status === 'in_progress') ?? null

  return { done, total: steps.length, current, isFinished: steps.length > 0 && done === steps.length }
}

// What the model reads back: short, so a plan update costs little context.
export const summary = (steps: readonly Step[]) => {
  const { done, total, current } = progress(steps)

  return `Plan updated: ${done}/${total} done${current === null ? '' : `, now: ${current.title}`}.`
}

export const bar = (done: number, total: number, width: number) => {
  if (total === 0 || width <= 0) {
    return ''
  }
  const filled = Math.round((done / total) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}
