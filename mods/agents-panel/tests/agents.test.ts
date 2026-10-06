import { expect, test } from 'claude-code/testing'

import { fromOffer, isGroupOpen, mergeAgents, mergeEnabled, parseAgent, pluginAgentDirs, upsert } from '../hooks/agents'

test('reads name, description, model and color from frontmatter', async () => {
  const agent = parseAgent(
    '---\nname: code-reviewer\ndescription: "Reviews the current diff"\nmodel: sonnet\ncolor: blue\n---\nBody',
    'project',
    'fallback',
  )

  expect(agent).toEqual({
    name: 'code-reviewer',
    description: 'Reviews the current diff',
    model: 'sonnet',
    color: 'blue',
    scope: 'project',
    plugin: null,
  })
})

test('keeps only the first line of an escaped multi-line description', async () => {
  const agent = parseAgent(
    '---\nname: mr\ndescription: Reviews MRs. Examples:\\n\\n<example>user: hi</example>\n---\n',
    'user',
    'mr',
  )

  expect(agent?.description).toBe('Reviews MRs. Examples:')
  expect(agent?.model).toBe(null)
})

test('falls back to the file name and skips files without frontmatter', async () => {
  expect(parseAgent('---\ndescription: x\n---\n', 'user', 'from-file')?.name).toBe('from-file')
  expect(parseAgent('# just markdown', 'user', 'x')).toBe(null)
})

test('turns a plugin offer into an entry grouped by its plugin, and ignores other sources', async () => {
  const agent = fromOffer({ agent: 'vuha-toolkit:jira-ops', description: 'Bulk Jira work.\nMore', source: 'plugin' })

  expect(agent).toEqual({
    name: 'vuha-toolkit:jira-ops',
    description: 'Bulk Jira work.',
    model: null,
    color: null,
    scope: 'plugin',
    plugin: 'vuha-toolkit',
  })
  expect(fromOffer({ agent: 'Explore', description: 'x', source: 'built-in' })).toBe(null)
  expect(fromOffer({ agent: 'mine', description: 'x', source: 'userSettings' })).toBe(null)
})

test('upsert keeps the same array when nothing changed and sorts new entries in', async () => {
  const a = fromOffer({ agent: 'p:b', description: 'B', source: 'plugin' })!
  const b = fromOffer({ agent: 'p:a', description: 'A', source: 'plugin' })!
  const list = upsert(upsert([], a), b)

  expect(list.map(x => x.name)).toEqual(['p:a', 'p:b'])
  expect(upsert(list, b)).toBe(list)
  expect(upsert(list, { ...b, description: 'A2' })[0]?.description).toBe('A2')
})

test('small plugin groups start open, big ones closed, a click flips either', async () => {
  expect(isGroupOpen(3, false)).toBe(true)
  expect(isGroupOpen(48, false)).toBe(false)
  expect(isGroupOpen(48, true)).toBe(true)
  expect(isGroupOpen(3, true)).toBe(false)
})

test('finds agents/ of enabled plugins only, preferring this project\'s install', async () => {
  const installed = {
    plugins: {
      'kit@m': [{ scope: 'user', installPath: '/c/kit/1' }],
      'off@m': [{ scope: 'user', installPath: '/c/off/1' }],
      'team@m': [
        { scope: 'user', installPath: '/c/team/1' },
        { scope: 'project', projectPath: '/repo', installPath: '/c/team/2' },
      ],
      'other@m': [{ scope: 'project', projectPath: '/elsewhere', installPath: '/c/other/1' }],
    },
  }
  const enabled = mergeEnabled([{ enabledPlugins: { 'kit@m': true, 'off@m': true, 'team@m': true, 'other@m': true } }, { enabledPlugins: { 'off@m': false } }, null])

  expect(pluginAgentDirs(installed, enabled, '/repo')).toEqual([
    { plugin: 'kit', dir: '/c/kit/1/agents' },
    { plugin: 'team', dir: '/c/team/2/agents' },
  ])
})

test('agents read from disk win over offered ones of the same name', async () => {
  const disk = [{ name: 'p:a', description: 'A', model: 'opus', color: null, scope: 'plugin' as const, plugin: 'p' }]
  const offers = [
    fromOffer({ agent: 'p:a', description: 'A', source: 'plugin' })!,
    fromOffer({ agent: 'q:b', description: 'B', source: 'plugin' })!,
  ]

  expect(mergeAgents(disk, offers).map(a => [a.name, a.model])).toEqual([['p:a', 'opus'], ['q:b', null]])
})
