import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Step } from '../types'
import { bar, INPUT_SCHEMA, parsePlan, progress, PROMPT_SECTION, summary, TOOL_DESCRIPTION, TOOL_NAME } from './steps'

const PANE = 'steps-panel'
const TOOL = `mcp__steps-panel__${TOOL_NAME}`

const steps = atom({ plugin: 'steps-panel', key: 'steps' } as const, [])
const goal = atom({ plugin: 'steps-panel', key: 'goal' } as const, null)
const updatedAt = atom({ plugin: 'steps-panel', key: 'updatedAt' } as const, 0)

const ICON: Record<Step['status'], string> = { pending: '○', in_progress: '◐', done: '✓' }

const clear = async ($: EngineInterface) => {
  await update($, steps, () => [])
  await update($, goal, () => null)
  await update($, updatedAt, () => 0)
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = (on, options) => {
  const showBand = options.showBand !== false

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'steps', description: "Show or hide the pane with Claude's plan and its steps" })
    await $.tool.register({ name: TOOL_NAME, description: TOOL_DESCRIPTION, inputSchema: INPUT_SCHEMA })

    return started
  })

  // A /clear starts over: the old plan belongs to the old conversation.
  on('session.end', async ($, e, next) => {
    await clear($).catch(() => undefined)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return { sections: [...composed.sections, { id: 'steps-panel', text: PROMPT_SECTION, scope: 'session' as const }] }
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const plan = parsePlan(e.input)
    if ('error' in plan) {
      return { deny: `Plan not shown: ${plan.error}.` }
    }
    await update($, steps, () => plan.steps)
    await update($, goal, current => plan.goal ?? current)
    await update($, updatedAt, () => Date.now())

    const { done, total } = progress(plan.steps)

    return { result: { ok: true, done, total }, text: summary(plan.steps) }
  }).catch(() => ({ deny: 'The steps panel could not store the plan; carry on without it.' }))

  on('command.run', { command: 'steps' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })

      return { text: 'Steps pane closed.' }
    }
    await $.ui.open({ id: PANE, title: 'Steps' })

    return { text: 'Steps pane open.' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (!showBand || e.props.hasSurvey) {
      return below
    }
    const list = await read($, steps)
    const { done, total, current, isFinished } = progress(list)
    const { Box, Text } = $.ui.resolve(e)

    // No plan running: one quiet line, so it is clear the panel is there and waiting.
    if (total === 0 || isFinished) {
      return (
        <Box flexDirection="column">
          <Box paddingX={1}>
            <Text dimColor wrap="truncate-end">
              ◆ Steps {total === 0 ? '· no plan yet' : `· ✓ all ${total} done`} · /steps
            </Text>
          </Box>
          {below}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box paddingX={1}>
          <Text wrap="truncate-end">
            <Text color="claude">◆ </Text>
            <Text bold>Steps </Text>
            <Text color="suggestion">{bar(done, total, 10)}</Text>
            <Text dimColor> {done}/{total}</Text>
            {current !== null && (
              <Text>
                <Text color="claude">  ◐ </Text>
                <Text>{current.title}</Text>
              </Text>
            )}
            <Text dimColor>  · /steps</Text>
          </Text>
        </Box>
        {below}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, steps)
    const title = await read($, goal)
    const { done, total } = progress(list)
    const width = e.props.bodyColumns

    return (
      <Box flexDirection="column" width={width}>
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color="claude">◆ </Text>
            <Text bold>{title ?? 'Plan'}</Text>
          </Text>
          {total > 0 && <Button key="clear" label="✕ clear" plain dimColor onPress={() => clear($)} />}
        </Box>

        {total === 0 ? (
          <Box marginTop={1}>
            <Text dimColor>No plan yet. Claude lists its steps here when a task has 3 or more.</Text>
          </Box>
        ) : (
          <>
            <Box marginTop={1}>
              <Text>
                <Text color="suggestion">{bar(done, total, Math.max(10, Math.min(40, width - 12)))}</Text>
                <Text dimColor> {done}/{total}</Text>
              </Text>
            </Box>
            <Box flexDirection="column" marginTop={1}>
              {list.map((step, index) => (
                <Box key={`step-${index}`} flexDirection="column">
                  <Box>
                    <Box width={3} flexShrink={0}>
                      <Text
                        color={step.status === 'done' ? 'success' : step.status === 'in_progress' ? 'claude' : undefined}
                        dimColor={step.status === 'pending'}
                      >
                        {ICON[step.status]}
                      </Text>
                    </Box>
                    <Box flexGrow={1} flexShrink={1}>
                      <Text
                        wrap="wrap"
                        bold={step.status === 'in_progress'}
                        dimColor={step.status === 'done'}
                      >
                        {step.title}
                      </Text>
                    </Box>
                  </Box>
                  {step.note !== undefined && (
                    <Box paddingLeft={3}>
                      <Text dimColor italic wrap="wrap">{step.note}</Text>
                    </Box>
                  )}
                </Box>
              ))}
            </Box>
          </>
        )}

        <Box marginTop={1}>
          <Text dimColor>○ to do · ◐ doing · ✓ done · /steps to hide</Text>
        </Box>
      </Box>
    )
  })
}
