import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ContextRow } from '../types'
import { barCells, formatDuration, formatTokens, levelColor, windowLabel } from './format'

const TICK_MS = 30 * 1000
const snapshot = atom({ plugin: 'context-bar', key: 'snapshot' } as const, null)
const isShown = atom({ plugin: 'context-bar', key: 'isShown' } as const, true)

const currentBranch = async ($: EngineInterface) => {
  const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 5000 })

  return exitCode === 0 ? stdout.trim() : ''
}

const refresh = async ($: EngineInterface) => {
  const [usage, cwd, branch] = await Promise.all([
    $.session.usage({ breakdown: 'summary' }),
    $.session.cwd(),
    currentBranch($).catch(() => ''),
  ])
  const breakdown = usage.context.breakdown

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
    model: breakdown.model,
    project: cwd.split('/').filter(Boolean).pop() ?? cwd,
    branch,
    costUsd: usage.cost?.usd ?? null,
    rateLimits: usage.rateLimits.map(w => ({ kind: w.kind, percentUsed: w.percentUsed })),
    startedAt: usage.startedAt,
  }))
}

export const register: Register = (on, options) => {
  const showLegend = options.showLegend !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'context-bar',
      description: 'Show or hide the context and session bar above the prompt',
    })
    void refresh($)
    // keeps the session time moving between turns
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))

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
    const elapsed = (await $.clock.now()) - data.startedAt

    return (
      <Box flexDirection="column">
        <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
          <Box justifyContent="space-between" flexWrap="wrap" columnGap={2}>
            <Text wrap="truncate-end">
              <Text color="claude">◆ </Text>
              <Text bold color="suggestion">{data.model}</Text>
              <Text dimColor> · </Text>
              <Text>📁 {data.project}</Text>
              {data.branch !== '' && <Text dimColor> · </Text>}
              {data.branch !== '' && <Text color="success">🌿 {data.branch}</Text>}
            </Text>
            <Text>
              <Text bold>{formatTokens(data.totalTokens)}</Text>
              <Text dimColor>
                {' '}of {formatTokens(data.maxTokens)}
                {data.compactsAt !== null ? ` · compacts at ${formatTokens(data.compactsAt)}` : ''}{' '}
              </Text>
              <Text bold inverse color={levelColor(data.percentage)}>
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
          {showLegend && (
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
          )}
          <Text>
            {data.costUsd !== null && <Text color="warning">💸 ${data.costUsd.toFixed(2)}</Text>}
            {data.rateLimits.map(w => (
              <Text>
                <Text dimColor> · </Text>
                <Text color={levelColor(w.percentUsed)}>{windowLabel(w)}</Text>
              </Text>
            ))}
            <Text dimColor> · </Text>
            <Text>⏱ {formatDuration(elapsed)}</Text>
          </Text>
        </Box>
        {below}
      </Box>
    )
  })
}
