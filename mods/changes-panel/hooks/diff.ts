// Unified diff → rows with line numbers, for the unified and side-by-side views.

export type DiffRow =
  | { kind: 'hunk'; text: string }
  | { kind: 'context'; oldNo: number; newNo: number; text: string }
  | { kind: 'remove'; oldNo: number; text: string; pair?: string }
  | { kind: 'add'; newNo: number; text: string; pair?: string }

export type Side = { no: number; text: string; kind: 'context' | 'remove' | 'add'; pair?: string }

export type SplitRow = { kind: 'hunk'; text: string } | { kind: 'line'; left: Side | null; right: Side | null }

export type Segment = { text: string; changed: boolean }

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@ ?(.*)$/

const untab = (text: string) => text.replaceAll('\t', '  ')

// Pairs the i-th removed line of a change block with the i-th added one, for word highlights.
const pairBlock = (removes: DiffRow[], adds: DiffRow[]) => {
  const count = Math.min(removes.length, adds.length)
  for (let i = 0; i < count; i++) {
    const remove = removes[i] as Extract<DiffRow, { kind: 'remove' }>
    const add = adds[i] as Extract<DiffRow, { kind: 'add' }>
    remove.pair = add.text
    add.pair = remove.text
  }
}

export const parseDiff = (lines: readonly string[]): DiffRow[] => {
  const rows: DiffRow[] = []
  let oldNo = 0
  let newNo = 0
  let inHunk = false
  let removes: DiffRow[] = []
  let adds: DiffRow[] = []
  const flush = () => {
    pairBlock(removes, adds)
    removes = []
    adds = []
  }

  for (const line of lines) {
    const hunk = HUNK.exec(line)
    if (hunk) {
      flush()
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      inHunk = true
      rows.push({ kind: 'hunk', text: hunk[3]?.trim() ?? '' })
      continue
    }
    if (!inHunk || line.startsWith('\\')) {
      continue
    }
    if (line.startsWith('-')) {
      if (adds.length > 0) {
        flush()
      }
      const row: DiffRow = { kind: 'remove', oldNo: oldNo++, text: untab(line.slice(1)) }
      removes.push(row)
      rows.push(row)
    } else if (line.startsWith('+')) {
      const row: DiffRow = { kind: 'add', newNo: newNo++, text: untab(line.slice(1)) }
      adds.push(row)
      rows.push(row)
    } else if (line.startsWith(' ')) {
      flush()
      rows.push({ kind: 'context', oldNo: oldNo++, newNo: newNo++, text: untab(line.slice(1)) })
    }
  }
  flush()

  return rows
}

// Context goes on both sides; a block of removals sits beside the additions that replaced it.
export const toSplit = (rows: readonly DiffRow[]): SplitRow[] => {
  const out: SplitRow[] = []
  let left: Side[] = []
  let right: Side[] = []
  const flush = () => {
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
      out.push({ kind: 'line', left: left[i] ?? null, right: right[i] ?? null })
    }
    left = []
    right = []
  }

  for (const row of rows) {
    if (row.kind === 'hunk') {
      flush()
      out.push(row)
    } else if (row.kind === 'context') {
      flush()
      out.push({
        kind: 'line',
        left: { no: row.oldNo, text: row.text, kind: 'context' },
        right: { no: row.newNo, text: row.text, kind: 'context' },
      })
    } else if (row.kind === 'remove') {
      if (right.length > 0) {
        flush()
      }
      left.push({ no: row.oldNo, text: row.text, kind: 'remove', pair: row.pair })
    } else {
      right.push({ no: row.newNo, text: row.text, kind: 'add', pair: row.pair })
    }
  }
  flush()

  return out
}

// Marks what changed between a line and its pair: everything between their common prefix and suffix.
export const highlight = (text: string, pair: string | undefined): Segment[] => {
  if (pair === undefined || pair === text) {
    return [{ text, changed: false }]
  }
  let start = 0
  while (start < text.length && start < pair.length && text[start] === pair[start]) {
    start++
  }
  let end = 0
  while (
    end < text.length - start &&
    end < pair.length - start &&
    text[text.length - 1 - end] === pair[pair.length - 1 - end]
  ) {
    end++
  }
  // Nothing in common worth showing: the whole line is the change already.
  if (start + end < 3) {
    return [{ text, changed: false }]
  }

  return [
    { text: text.slice(0, start), changed: false },
    { text: text.slice(start, text.length - end), changed: true },
    { text: text.slice(text.length - end), changed: false },
  ].filter(segment => segment.text.length > 0)
}
