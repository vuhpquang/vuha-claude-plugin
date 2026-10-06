import type { FileChange } from '../types'

// `git status --porcelain=v1 -z`: NUL-separated, a rename's entry followed by its old path.
export const parseStatus = (out: string): { path: string; status: string }[] => {
  const parts = out.split('\0').filter(part => part.length > 0)
  const entries: { path: string; status: string }[] = []
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    const status = part.slice(0, 2)
    entries.push({ path: part.slice(3), status })
    if (status.startsWith('R') || status.startsWith('C')) {
      i++
    }
  }

  return entries
}

// `git diff --numstat -z HEAD`: `added\tremoved\tpath\0`; binary files show `-`.
// A rename is `added\tremoved\t\0old\0new\0`.
export const parseNumstat = (out: string): Map<string, { added: number; removed: number }> => {
  const stats = new Map<string, { added: number; removed: number }>()
  const parts = out.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(parts[i]!)
    if (!match) {
      continue
    }
    let path = match[3]!
    if (path === '') {
      path = parts[i + 2] ?? ''
      i += 2
    }
    stats.set(path, { added: Number(match[1]) || 0, removed: Number(match[2]) || 0 })
  }

  return stats
}

export const mergeChanges = (
  entries: { path: string; status: string }[],
  stats: Map<string, { added: number; removed: number }>,
  untrackedLines: Map<string, number>,
): FileChange[] =>
  entries
    .map(({ path, status }) => {
      const stat = stats.get(path)
      const added = stat?.added ?? untrackedLines.get(path) ?? 0

      return { path, status, added, removed: stat?.removed ?? 0 }
    })
    .sort((a, b) => a.path.localeCompare(b.path))

// One letter for the row: what happened to the file, staged or not.
export const statusLetter = (status: string) => {
  if (status === '??') {
    return 'U'
  }
  const letter = status.trim()[0] ?? '?'

  return letter
}

export const STATUS_COLOR: Record<string, string> = {
  M: 'warning',
  A: 'success',
  U: 'success',
  D: 'error',
  R: 'suggestion',
  C: 'suggestion',
}

export type DiffLineKind = 'add' | 'remove' | 'hunk' | 'meta' | 'context'

export const diffLineKind = (line: string): DiffLineKind => {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ') || line.startsWith('index ')) {
    return 'meta'
  }
  if (line.startsWith('@@')) {
    return 'hunk'
  }
  if (line.startsWith('+')) {
    return 'add'
  }
  if (line.startsWith('-')) {
    return 'remove'
  }

  return 'context'
}

export const fillTarget = (template: string, selected: string | null) =>
  template.replaceAll('{target}', selected === null ? 'the uncommitted changes' : `the uncommitted changes in ${selected}`)
