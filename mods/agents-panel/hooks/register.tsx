import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentEntry, AgentScope } from '../types'
import { parseAgent } from './agents'

const PANE = 'agents-panel'
const agents = atom({ plugin: 'agents-panel', key: 'agents' } as const, [])

const PALETTE = ['blue', 'cyan', 'yellow', 'magenta', 'green', 'red']
const SCOPES: { scope: AgentScope; label: string; dir: string }[] = [
  { scope: 'project', label: 'PROJECT', dir: '.claude/agents' },
  { scope: 'user', label: 'USER', dir: '~/.claude/agents' },
]

const loadDir = async ($: EngineInterface, dir: string, scope: AgentScope) => {
  if (!(await $.fs.exists(dir))) {
    return []
  }

  const files = (await $.fs.list(dir)).filter(entry => entry.kind === 'file' && entry.name.endsWith('.md'))
  const loaded = await Promise.all(
    files.map(async file => parseAgent(await $.fs.read(`${dir}/${file.name}`), scope, file.name.slice(0, -3))),
  )

  return loaded.filter((agent): agent is AgentEntry => agent !== null)
}

const reload = async ($: EngineInterface) => {
  const home = (await $.env.get('HOME')) ?? ''
  const lists = await Promise.all(
    SCOPES.map(({ scope, dir }) => loadDir($, dir.replace('~', home), scope).catch(() => [])),
  )
  await update($, agents, () => lists.flat().sort((a, b) => a.name.localeCompare(b.name)))
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agents-panel',
      description: 'Show or hide a pane listing your custom subagents',
    })

    return next(e)
  })

  on('command.run', { command: 'agents-panel' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })

      return { text: 'Agents panel closed.' }
    }

    await reload($)
    await $.ui.open({ id: PANE, title: 'Agents' })

    return { text: 'Agents panel open.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, agents)
    const width = e.props.bodyColumns

    const run = (agent: AgentEntry) =>
      $.prompt.submit({ text: `Use the ${agent.name} subagent for the current task.`, asUser: true })

    return (
      <Box flexDirection="column" width={width}>
        <Box justifyContent="space-between">
          <Text>
            <Text color="claude">◆ </Text>
            <Text bold>Agents</Text>
            <Text dimColor> in this project</Text>
          </Text>
          <Text dimColor>{list.length} defined</Text>
        </Box>
        {list.length === 0 && <Text dimColor>No agents in .claude/agents or ~/.claude/agents.</Text>}
        {SCOPES.map(({ scope, label, dir }) => {
          const group = list.filter(agent => agent.scope === scope)
          if (group.length === 0) {
            return null
          }

          return (
            <Box flexDirection="column" marginTop={1}>
              <Text>
                <Text color="suggestion" bold>{label}</Text>
                <Text dimColor>  {dir} · {group.length}</Text>
              </Text>
              {group.map((agent, index) => (
                <Box key={`row-${scope}-${agent.name}`} flexDirection="column" marginTop={1} hover={{ backgroundColor: 'subtle' }}>
                  <Box justifyContent="space-between">
                    <Text wrap="truncate-end">
                      <Text color={agent.color ?? PALETTE[index % PALETTE.length]}>● </Text>
                      <Text bold>{agent.name}</Text>
                      {agent.model !== null && <Text dimColor> {agent.model}</Text>}
                    </Text>
                    <Button key={`run-${scope}-${agent.name}`} label="▶ run" plain dimColor onPress={() => run(agent)} />
                  </Box>
                  <Box paddingLeft={2}>
                    <Text dimColor wrap="truncate-end">{agent.description}</Text>
                  </Box>
                </Box>
              ))}
            </Box>
          )
        })}
        <Box marginTop={1}>
          <Text dimColor>click ▶ run to start one · /agents-panel to hide</Text>
        </Box>
      </Box>
    )
  })
}
