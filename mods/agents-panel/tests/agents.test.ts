import { expect, test } from 'claude-code/testing'

import { parseAgent } from '../hooks/agents'

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
