import type { AgentEntry, AgentScope } from '../types'

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, '$2')

// Reads the YAML frontmatter fields an agent file needs; nested values are ignored.
export const parseAgent = (source: string, scope: AgentScope, fallbackName: string): AgentEntry | null => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)
  if (!match?.[1]) {
    return null
  }

  const fields: Record<string, string> = {}
  for (const line of match[1].split(/\r?\n/)) {
    const field = /^([A-Za-z-]+):\s*(.*)$/.exec(line)
    if (field?.[1] && field[2] !== undefined) {
      fields[field[1]] = unquote(field[2])
    }
  }

  const description = (fields.description ?? '')
    .split('\\n')[0]!
    .replace(/<[^>]+>/g, '')
    .trim()

  return {
    name: fields.name || fallbackName,
    description,
    model: fields.model || null,
    color: fields.color || null,
    scope,
  }
}
