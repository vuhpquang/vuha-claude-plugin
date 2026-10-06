import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { AgentEntry, AgentScope } from '../types'
import type { InstalledPlugins } from './agents'
import { fromOffer, isGroupOpen, mergeAgents, mergeEnabled, parseAgent, pluginAgentDirs, upsert } from './agents'

const PANE = 'agents-panel'
const agents = atom({ plugin: 'agents-panel', key: 'agents' } as const, [])
const pluginFiles = atom({ plugin: 'agents-panel', key: 'pluginFiles' } as const, [])
const offered = atom({ plugin: 'agents-panel', key: 'offered' } as const, [])
const toggled = atom({ plugin: 'agents-panel', key: 'toggled' } as const, [])

const PALETTE = ['blue', 'cyan', 'yellow', 'magenta', 'green', 'red']
const SCOPES: { scope: Exclude<AgentScope, 'plugin'>; label: string; dir: string }[] = [
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
  await reloadPlugins($, home).catch(() => undefined)
}

const readJson = async <T,>($: EngineInterface, path: string): Promise<T | null> => {
  try {
    return (await $.fs.exists(path)) ? (JSON.parse(await $.fs.read(path)) as T) : null
  } catch {
    return null
  }
}

const reloadPlugins = async ($: EngineInterface, home: string) => {
  const root = await $.session.root()
  const installed = (await readJson<InstalledPlugins>($, `${home}/.claude/plugins/installed_plugins.json`)) ?? {}
  type Settings = { enabledPlugins?: Record<string, boolean> }
  const enabled = mergeEnabled(
    await Promise.all(
      [`${home}/.claude/settings.json`, `${root}/.claude/settings.json`, `${root}/.claude/settings.local.json`].map(
        path => readJson<Settings>($, path),
      ),
    ),
  )
  const lists = await Promise.all(
    pluginAgentDirs(installed, enabled, root).map(async ({ plugin, dir }) =>
      (await loadDir($, dir, 'plugin').catch(() => [])).map(agent => ({
        ...agent,
        name: `${plugin}:${agent.name}`,
        plugin,
      })),
    ),
  )
  await update($, pluginFiles, () => lists.flat())
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

const byPlugin = (list: AgentEntry[]) => {
  const groups = new Map<string, AgentEntry[]>()
  for (const agent of list) {
    const key = agent.plugin ?? '?'
    groups.set(key, [...(groups.get(key) ?? []), agent])
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'agents-panel',
      description: 'Show or hide a pane listing your custom and plugin subagents',
    })

    return next(e)
  })

  // The engine offers every agent type to the model; plugin ones are only knowable here.
  // Recording must never stand in the way of the offer itself.
  on('agent.offer', async ($, e, next) => {
    const entry = fromOffer(e)
    if (entry !== null) {
      const record = async () => {
        const current = await read($, offered)
        const updated = upsert(current, entry)
        if (updated !== current) {
          await update($, offered, () => updated)
        }
      }
      await record().catch(() => undefined)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

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
    const files = await read($, agents)
    const plugins = mergeAgents(await read($, pluginFiles), await read($, offered))
    const flipped = await read($, toggled)
    const width = e.props.bodyColumns

    const run = (agent: AgentEntry) =>
      $.prompt.submit({ text: `Use the ${agent.name} subagent for the current task.`, asUser: true })

    const flip = (plugin: string) =>
      update($, toggled, list => (list.includes(plugin) ? list.filter(p => p !== plugin) : [...list, plugin]))

    const row = (agent: AgentEntry, index: number, key: string) => (
      <Box key={`row-${key}`} flexDirection="column" marginTop={1} hover={{ backgroundColor: 'subtle' }}>
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color={agent.color ?? PALETTE[index % PALETTE.length]}>● </Text>
            <Text bold>{agent.name}</Text>
            {agent.model !== null && <Text dimColor> {agent.model}</Text>}
          </Text>
          <Button key={`run-${key}`} label="▶ run" plain dimColor onPress={() => run(agent)} />
        </Box>
        <Box paddingLeft={2}>
          <Text dimColor wrap="truncate-end">{agent.description}</Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" width={width}>
        <Box justifyContent="space-between">
          <Text>
            <Text color="claude">◆ </Text>
            <Text bold>Agents</Text>
            <Text dimColor> in this session</Text>
          </Text>
          <Text dimColor>{files.length + plugins.length} defined</Text>
        </Box>
        {files.length === 0 && plugins.length === 0 && (
          <Text dimColor>No agents in .claude/agents or ~/.claude/agents, and no plugin agents offered yet.</Text>
        )}
        {SCOPES.map(({ scope, label, dir }) => {
          const group = files.filter(agent => agent.scope === scope)
          if (group.length === 0) {
            return null
          }

          return (
            <Box key={`scope-${scope}`} flexDirection="column" marginTop={1}>
              <Text>
                <Text color="suggestion" bold>{label}</Text>
                <Text dimColor>  {dir} · {group.length}</Text>
              </Text>
              {group.map((agent, index) => row(agent, index, `${scope}-${agent.name}`))}
            </Box>
          )
        })}
        {plugins.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text color="suggestion" bold>PLUGINS</Text>
              <Text dimColor>  · {plugins.length}</Text>
            </Text>
            {byPlugin(plugins).map(([plugin, group]) => {
              const open = isGroupOpen(group.length, flipped.includes(plugin))

              return (
                <Box key={`plugin-${plugin}`} flexDirection="column" marginTop={1}>
                  <Button
                    key={`toggle-${plugin}`}
                    label={`${open ? '▾' : '▸'} ${plugin} · ${group.length}`}
                    plain
                    onPress={() => flip(plugin)}
                  />
                  {open && (
                    <Box flexDirection="column" paddingLeft={2}>
                      {group.map((agent, index) => row(agent, index, `plugin-${agent.name}`))}
                    </Box>
                  )}
                </Box>
              )
            })}
          </Box>
        )}
        {plugins.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor>Plugin agents appear after the first prompt of the session.</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text dimColor>click ▶ run to start one · ▸ to expand a plugin · /agents-panel to hide</Text>
        </Box>
      </Box>
    )
  })
}
