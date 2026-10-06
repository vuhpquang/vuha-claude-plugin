import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextRow, ContextSnapshot } from '../types'

const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
const isShown = atom({ plugin: 'context-bar', key: 'isShown' } as const, true)

export const formatTokens = (n: number) =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${+(n / 1000).toFixed(1)}k`
      : `${n}`

// One cell per category share of `width`; a non-empty category always gets a cell.
export const barCells = (rows: ContextRow[], max: number, width: number) => {
  const cells = rows.map(row => ({
    row,
    count: row.tokens > 0 ? Math.max(1, Math.round((row.tokens / max) * width)) : 0,
  }))
  const free = cells.find(cell => cell.row.kind === 'free')
  const overflow = cells.reduce((sum, cell) => sum + cell.count, 0) - width

  if (free && overflow !== 0) {
    free.count = Math.max(0, free.count - overflow)
  }

  return cells.filter(cell => cell.count > 0)
}

const refresh = async ($: EngineInterface) => {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const breakdown = context.breakdown

  if (!breakdown) {
    return
  }

  const rows: ContextRow[] = breakdown.categories
    .filter(category => category.kind !== 'deferred')
    .map(category => ({
      name: category.name,
      tokens: category.tokens,
      color: category.color,
      kind: category.kind as ContextRow['kind'],
    }))

  await update($, snapshot, () => ({
    totalTokens: breakdown.totalTokens,
    maxTokens: breakdown.rawMaxTokens,
    percentage: breakdown.percentage,
    compactsAt: breakdown.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null,
    rows,
  }))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Show or hide the context window bar above the prompt',
    })
    void refresh($)

    return next(e)
  })

  on('command.run', { command: 'context-bar' }, async $ => {
    const shown = await update($, isShown, value => !value)
    if (shown) {
      await refresh($)
    }

    return { text: shown ? 'Context bar shown.' : 'Context bar hidden.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  })

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    void refresh($)

    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const data = await read($, snapshot)

    if (e.props.hasSurvey || data === null || !(await read($, isShown))) {
      return below
    }

    const { Box, Text } = $.ui.resolve(e)
    const width = Math.max(10, e.props.bodyColumns - 4)
    const percentColor = data.percentage >= 80 ? 'error' : data.percentage >= 50 ? 'warning' : 'success'

    return (
      <Box flexDirection="column">
      <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
        <Box justifyContent="space-between">
          <Text bold>
            <Text color="claude">◆ </Text>context
          </Text>
          <Text>
            <Text bold>{formatTokens(data.totalTokens)}</Text>
            <Text dimColor>
              {' '}of {formatTokens(data.maxTokens)}
              {data.compactsAt !== null ? ` · compacts at ${formatTokens(data.compactsAt)}` : ''}{' '}
            </Text>
            <Text bold inverse color={percentColor}>
              {` ${data.percentage}% `}
            </Text>
          </Text>
        </Box>
        <Text>
          {barCells(data.rows, data.maxTokens, width).map(({ row, count }) => (
            <Text color={row.color} dimColor={row.kind !== 'used'}>
              {(row.kind === 'used' ? '█' : '░').repeat(count)}
            </Text>
          ))}
        </Text>
        <Box flexWrap="wrap" columnGap={2}>
          {data.rows.map(row => (
            <Text>
              <Text color={row.color}>■ </Text>
              <Text dimColor={row.kind !== 'used'}>{row.name.toLowerCase()} </Text>
              <Text bold>{formatTokens(row.tokens)}</Text>
              <Text dimColor> {Math.round((row.tokens / data.maxTokens) * 100)}%</Text>
            </Text>
          ))}
        </Box>
      </Box>
      {below}
      </Box>
    )
  })
}
