import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { FileChange } from '../types'
import type { Segment, Side } from './diff'
import { highlight, parseDiff, toSplit } from './diff'
import { fillTarget, mergeChanges, parseNumstat, parseStatus, STATUS_COLOR, statusLetter } from './git'

const PANE = 'changes-panel'
const MAX_DIFF_LINES = 2000
const MAX_COUNTED_UNTRACKED = 50
const EDITING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'Bash'])

const files = atom({ plugin: 'changes-panel', key: 'files' } as const, [])
const repo = atom({ plugin: 'changes-panel', key: 'repo' } as const, null)
const selected = atom({ plugin: 'changes-panel', key: 'selected' } as const, null)
const diff = atom({ plugin: 'changes-panel', key: 'diff' } as const, [])
const mode = atom({ plugin: 'changes-panel', key: 'mode' } as const, 'unified')
const error = atom({ plugin: 'changes-panel', key: 'error' } as const, null)

const git = async ($: EngineInterface, args: string[]) => $.process.run(['git', ...args], { timeoutMs: 15_000 })

const countLines = async ($: EngineInterface, path: string) => {
  try {
    const text = await $.fs.read(path)

    return text.length === 0 ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
  } catch {
    return 0
  }
}

const loadDiff = async ($: EngineInterface, file: FileChange | undefined) => {
  if (file === undefined) {
    await update($, diff, () => [])

    return
  }
  const run =
    file.status === '??'
      ? await git($, ['diff', '--no-index', '--no-color', '--', '/dev/null', file.path])
      : await git($, ['diff', '--no-color', 'HEAD', '--', file.path])
  const lines = run.stdout.split('\n')
  const shown = lines.length > MAX_DIFF_LINES ? [...lines.slice(0, MAX_DIFF_LINES), `… ${lines.length - MAX_DIFF_LINES} more lines`] : lines
  await update($, diff, () => shown)
}

const refresh = async ($: EngineInterface) => {
  const inside = await git($, ['rev-parse', '--is-inside-work-tree']).catch(() => null)
  if (inside === null || inside.exitCode !== 0) {
    await update($, error, () => 'Not a git repository.')
    await update($, files, () => [])
    await update($, repo, () => null)

    return
  }

  const [branch, ahead, status, numstat] = await Promise.all([
    git($, ['rev-parse', '--abbrev-ref', 'HEAD']),
    git($, ['rev-list', '--count', '@{u}..HEAD']),
    git($, ['status', '--porcelain=v1', '-z', '-uall']),
    git($, ['diff', '--numstat', '-z', 'HEAD']),
  ])

  const entries = parseStatus(status.stdout)
  const untracked = entries.filter(entry => entry.status === '??').slice(0, MAX_COUNTED_UNTRACKED)
  const untrackedLines = new Map(
    await Promise.all(untracked.map(async entry => [entry.path, await countLines($, entry.path)] as const)),
  )
  const list = mergeChanges(entries, parseNumstat(numstat.stdout), untrackedLines)

  await update($, error, () => null)
  await update($, files, () => list)
  await update($, repo, () => ({
    branch: branch.stdout.trim() || '(no branch)',
    ahead: ahead.exitCode === 0 ? Number(ahead.stdout.trim()) || 0 : null,
  }))

  const current = await read($, selected)
  const still = list.find(file => file.path === current)
  if (current !== null && still === undefined) {
    await update($, selected, () => null)
  }
  await loadDiff($, still)
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = (on, options) => {
  const reviewPrompt =
    String(options.reviewPrompt ?? '').trim() ||
    'Review {target} in this repo (git diff HEAD, plus untracked files) for bugs. Rank findings by severity, cite file:line, do not edit.'
  const commitPrompt =
    String(options.commitPrompt ?? '').trim() ||
    "Commit and push all uncommitted changes in this repo with a message in the repo's commit convention, then push to the upstream."

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'changes-panel',
      description: 'Show or hide a pane with uncommitted changes, their diff, Review and Commit + push',
    })

    return next(e)
  })

  on('command.run', { command: 'changes-panel' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })

      return { text: 'Changes panel closed.' }
    }

    await refresh($).catch(async reason => update($, error, () => String(reason)))
    await $.ui.open({ id: PANE, title: 'Changes' })

    return { text: 'Changes panel open.' }
  })

  // Keep the list current while Claude edits; only when the pane is showing.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (EDITING_TOOLS.has(e.tool) && (await isOpen($).catch(() => false))) {
      await refresh($).catch(() => undefined)
    }

    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, files)
    const info = await read($, repo)
    const chosen = await read($, selected)
    const lines = await read($, diff)
    const problem = await read($, error)
    const view = await read($, mode)
    const width = e.props.bodyColumns
    const added = list.reduce((sum, file) => sum + file.added, 0)
    const removed = list.reduce((sum, file) => sum + file.removed, 0)

    const select = async (path: string) => {
      const next = chosen === path ? null : path
      await update($, selected, () => next)
      await loadDiff($, list.find(file => file.path === next))
    }
    const submit = (text: string) => $.prompt.submit({ text, asUser: true })

    const rows = parseDiff(lines)
    const maxNo = rows.reduce(
      (max, row) => Math.max(max, row.kind === 'hunk' ? 0 : row.kind === 'add' ? row.newNo : row.oldNo, row.kind === 'context' ? row.newNo : 0),
      0,
    )
    const numWidth = Math.max(2, String(maxNo).length)
    const num = (value: number | null) => (value === null ? ' '.repeat(numWidth) : String(value).padStart(numWidth))
    const lineBg = (kind: Side['kind']) => (kind === 'add' ? 'diffAdded' : kind === 'remove' ? 'diffRemoved' : undefined)
    const signOf = (kind: Side['kind']) => (kind === 'add' ? '+' : kind === 'remove' ? '-' : ' ')

    const segments = (parts: Segment[], kind: Side['kind'], key: string) =>
      parts.map((part, index) => (
        <Text
          key={`${key}-${index}`}
          backgroundColor={part.changed ? (kind === 'add' ? 'diffAddedWord' : 'diffRemovedWord') : undefined}
        >
          {part.text}
        </Text>
      ))

    const hunkRow = (text: string, key: string) => (
      <Box key={key} marginTop={1}>
        <Text color="suggestion" dimColor wrap="truncate-end">⋯ {text}</Text>
      </Box>
    )

    const unified = () =>
      rows.map((row, index) => {
        const key = `u-${index}`
        if (row.kind === 'hunk') {
          return hunkRow(row.text, key)
        }
        const oldNo = row.kind === 'add' ? null : row.oldNo
        const newNo = row.kind === 'remove' ? null : row.newNo
        const pair = row.kind === 'context' ? undefined : row.pair

        return (
          <Box key={key} backgroundColor={lineBg(row.kind)}>
            <Box width={numWidth * 2 + 2} flexShrink={0}>
              <Text dimColor>{num(oldNo)} {num(newNo)}</Text>
            </Box>
            <Box width={2} flexShrink={0}>
              <Text dimColor={row.kind === 'context'}>{signOf(row.kind)}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">{segments(highlight(row.text, pair), row.kind, key)}</Text>
            </Box>
          </Box>
        )
      })

    const half = Math.max(20, Math.floor((width - 1) / 2))
    const sideCell = (side: Side | null, key: string) => (
      <Box key={key} width={half} flexShrink={0} backgroundColor={side === null ? undefined : lineBg(side.kind)}>
        {side !== null && (
          <>
            <Box width={numWidth + 1} flexShrink={0}>
              <Text dimColor>{num(side.no)}</Text>
            </Box>
            <Box width={2} flexShrink={0}>
              <Text dimColor={side.kind === 'context'}>{signOf(side.kind)}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text wrap="wrap">{segments(highlight(side.text, side.pair), side.kind, key)}</Text>
            </Box>
          </>
        )}
      </Box>
    )

    const split = () =>
      toSplit(rows).map((row, index) => {
        const key = `s-${index}`
        if (row.kind === 'hunk') {
          return hunkRow(row.text, key)
        }

        return (
          <Box key={key} gap={1}>
            {sideCell(row.left, `${key}-l`)}
            {sideCell(row.right, `${key}-r`)}
          </Box>
        )
      })

    return (
      <Box flexDirection="column" width={width}>
        <Box justifyContent="space-between">
          <Text wrap="truncate-end">
            <Text color="claude">◆ </Text>
            <Text bold>Changes</Text>
            {info !== null && <Text dimColor>  {info.branch}</Text>}
            {info?.ahead ? <Text color="suggestion"> ↑{info.ahead}</Text> : null}
          </Text>
          <Text>
            <Text dimColor>{list.length} files </Text>
            <Text color="diffAdded">+{added}</Text>
            <Text> </Text>
            <Text color="diffRemoved">−{removed}</Text>
          </Text>
        </Box>

        <Box marginTop={1} gap={2}>
          <Button key="refresh" label="↻ refresh" plain dimColor onPress={() => refresh($)} />
          {list.length > 0 && (
            <Button key="review" label="✦ review" plain onPress={() => submit(fillTarget(reviewPrompt, chosen))} />
          )}
          {(list.length > 0 || (info?.ahead ?? 0) > 0) && (
            <Button key="commit" label="⇡ commit + push" variant="primary" onPress={() => submit(commitPrompt)} />
          )}
        </Box>

        {problem !== null && (
          <Box marginTop={1}>
            <Text color="error">{problem}</Text>
          </Box>
        )}
        {problem === null && list.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor>Working tree clean.</Text>
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          {list.map(file => {
            const letter = statusLetter(file.status)
            const isChosen = file.path === chosen

            return (
              <Box key={`file-${file.path}`} justifyContent="space-between" hover={{ backgroundColor: 'subtle' }}>
                <Box>
                  <Text color={STATUS_COLOR[letter] ?? 'text'}>{letter} </Text>
                  <Button
                    key={`open-${file.path}`}
                    label={`${isChosen ? '▾' : '▸'} ${file.path}`}
                    plain
                    onPress={() => select(file.path)}
                  />
                </Box>
                <Text>
                  <Text color="diffAdded">+{file.added}</Text>
                  <Text> </Text>
                  <Text color="diffRemoved">−{file.removed}</Text>
                </Text>
              </Box>
            )
          })}
        </Box>

        {chosen !== null && (
          <Box flexDirection="column" marginTop={1}>
            <Box justifyContent="space-between">
              <Text dimColor wrap="truncate-end">── {chosen}</Text>
              <Box gap={2}>
                <Button
                  key="mode"
                  label={view === 'unified' ? '⇆ side-by-side' : '≡ unified'}
                  plain
                  onPress={() => update($, mode, current => (current === 'unified' ? 'split' : 'unified'))}
                />
                <Button key="close-diff" label="✕" plain dimColor onPress={() => select(chosen)} />
              </Box>
            </Box>
            {view === 'unified' ? unified() : split()}
          </Box>
        )}

        <Box marginTop={1}>
          <Text dimColor>▸ a file to see its diff · /changes-panel to hide</Text>
        </Box>
      </Box>
    )
  })
}
