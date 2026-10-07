import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'steps-panel',
  props: { title: 'Steps', isFocused: true, bodyColumns: 80, placement: 'dock' },
} as const

const PLAN = {
  goal: 'Add the steps mod',
  steps: [
    { title: 'Write the tool', status: 'done' },
    { title: 'Draw the pane', status: 'in_progress' },
    { title: 'Test it', status: 'pending', note: 'terminal and desktop' },
  ],
}

test('the tool stores the plan, answers briefly, and the pane and band draw it', async ($, on) => {
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))
  on('ui.panes', async () => ({ value: [] }))
  // What sits beneath the band in a session: another plugin's row, or nothing.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="below" />
  })

  const answer = await $.tool.call({ tool: 'mcp__steps-panel__plan', input: PLAN })
  expect(answer.text).toBe('Plan updated: 1/3 done, now: Draw the pane.')

  for (const surface of ['terminal', 'desktop'] as const) {
    const pane = await $.ui.mount({ plugin: 'steps-panel', surface, ...PANE })
    expect(await pane.find({ type: 'Text', text: /Add the steps mod/ })).toBeDefined()
    expect(await pane.find({ type: 'Text', text: /terminal and desktop/ })).toBeDefined()
    await pane.unmount()

    const band = await $.ui.mount({ plugin: 'steps-panel', surface, component: 'AbovePrompt', props: { hasSurvey: false } })
    expect(await band.find({ type: 'Text', text: /Draw the pane/ })).toBeDefined()
    await band.unmount()
  }
})

test('a malformed plan is refused with the reason', async $ => {
  const answer = await $.tool.call({ tool: 'mcp__steps-panel__plan', input: { steps: [{ title: 'x', status: 'later' }] } })
  expect(answer.deny).toContain('use pending, in_progress or done')
})
