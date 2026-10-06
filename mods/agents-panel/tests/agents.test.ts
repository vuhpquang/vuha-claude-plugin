import { expect, test } from 'claude-code/testing'

import { fromOffer, isGroupOpen, parseAgent, upsert } from '../hooks/agents'

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
