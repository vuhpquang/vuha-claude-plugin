import type { AgentEntry, AgentScope } from '../types'

const unquote = (value: string) => value.trim().replace(/^(["'])(.*)\1$/, '$2')

// First line only (escaped or real newline), with <example> style tags removed.
export const cleanDescription = (text: string) =>
  text
    .split(/\\n|\r?\n/)[0]!
    .replace(/<[^>]+>/g, '')
    .trim()

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

  return {
    name: fields.name || fallbackName,
    description: cleanDescription(fields.description ?? ''),
    model: fields.model || null,
    color: fields.color || null,
    scope,
    plugin: null,
  }
}

// A plugin's agent type as `agent.offer` names it (`<plugin>:<name>`); null for any other source.
export const fromOffer = (offer: { agent: string; description: string; source: string }): AgentEntry | null => {
  if (offer.source !== 'plugin') {
    return null
  }

  const colon = offer.agent.indexOf(':')

  return {
    name: offer.agent,
    description: cleanDescription(offer.description),
    model: null,
    color: null,
    scope: 'plugin',
    plugin: colon > 0 ? offer.agent.slice(0, colon) : offer.agent,
  }
}

// Inserts or replaces by name; returns the same array when nothing changed, so callers can skip a redraw.
export const upsert = (list: AgentEntry[], entry: AgentEntry): AgentEntry[] => {
  const index = list.findIndex(agent => agent.name === entry.name)
  if (index === -1) {
    return [...list, entry].sort((a, b) => a.name.localeCompare(b.name))
  }
  if (list[index]!.description === entry.description) {
    return list
  }

  return list.map((agent, i) => (i === index ? entry : agent))
}

// Small groups start open, big ones (dozens of agents from one plugin) start closed.
export const OPEN_BY_DEFAULT_MAX = 5

export const isGroupOpen = (size: number, flipped: boolean) => (size <= OPEN_BY_DEFAULT_MAX) !== flipped
