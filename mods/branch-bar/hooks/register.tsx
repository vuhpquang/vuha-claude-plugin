import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { BranchRef } from '../types'
import { createArgv, filterRefs, gitError, isValidBranchName, parseCounts, parseRefs, switchArgv } from './git'

const PANE = 'branch-picker'

const repo = atom({ plugin: 'branch-bar', key: 'repo' } as const, null)
const busy = atom({ plugin: 'branch-bar', key: 'busy' } as const, null)
const branches = atom({ plugin: 'branch-bar', key: 'branches' } as const, [])
const filter = atom({ plugin: 'branch-bar', key: 'filter' } as const, '')
const error = atom({ plugin: 'branch-bar', key: 'error' } as const, null)

const git = ($: EngineInterface, args: string[], cwd?: string, timeoutMs = 15_000) =>
  $.process.run(['git', ...args], { timeoutMs, ...(cwd === undefined ? {} : { cwd }) })

const refresh = async ($: EngineInterface) => {
  const top = await git($, ['rev-parse', '--show-toplevel']).catch(() => null)
  if (top === null || top.exitCode !== 0) {
    await update($, repo, () => null)

    return
  }
  const root = top.stdout.trim()
  const [symbolic, counts, status] = await Promise.all([
    git($, ['symbolic-ref', '--short', '-q', 'HEAD'], root),
    git($, ['rev-list', '--left-right', '--count', '@{u}...HEAD'], root),
    git($, ['status', '--porcelain', '--untracked-files=no'], root),
  ])
  const isDetached = symbolic.exitCode !== 0
  const branch = isDetached ? (await git($, ['rev-parse', '--short', 'HEAD'], root)).stdout.trim() : symbolic.stdout.trim()
  const hasUpstream = counts.exitCode === 0
  const { ahead, behind } = hasUpstream ? parseCounts(counts.stdout) : { ahead: 0, behind: 0 }

  await update($, repo, () => ({
    root,
    branch: branch || '(no commits)',
    isDetached,
    hasUpstream,
    ahead,
    behind,
    isDirty: status.stdout.trim() !== '',
  }))
}

const REF_FORMAT = '--format=%(refname)%09%(committerdate:relative)'
// Big monorepos carry tens of thousands of remote branches: keep every local one, the newest remotes.
const MAX_REMOTE_REFS = 3000

const loadBranches = async ($: EngineInterface, root: string) => {
  const [locals, remotes] = await Promise.all([
    git($, ['for-each-ref', '--sort=-committerdate', REF_FORMAT, 'refs/heads'], root),
    git($, ['for-each-ref', '--sort=-committerdate', `--count=${MAX_REMOTE_REFS}`, REF_FORMAT, 'refs/remotes'], root),
  ])
  await update($, branches, () => parseRefs(`${locals.stdout}\n${remotes.stdout}`))
}

// Runs one git action with the busy marker set; returns the error line, or null on success.
const act = async ($: EngineInterface, label: string, args: string[], timeoutMs = 30_000) => {
  const state = await read($, repo)
  if (state === null || (await read($, busy)) !== null) {
    return 'busy'
  }
  await update($, busy, () => label)
  await update($, error, () => null)
  try {
    const run = await git($, args, state.root, timeoutMs)

    return run.exitCode === 0 ? null : gitError(run.stderr, run.stdout)
  } catch (reason) {
    return String(reason)
  } finally {
    await update($, busy, () => null)
    await refresh($).catch(() => undefined)
  }
}

const switchTo = async ($: EngineInterface, ref: Pick<BranchRef, 'name' | 'remote'>, isNew = false) => {
  const failed = await act($, 'switch', isNew ? createArgv(ref.name) : switchArgv(ref))
  if (failed === 'busy') {
    return
  }
  if (failed !== null) {
    await update($, error, () => failed)

    return
  }
  await $.ui.close({ id: PANE }).catch(() => undefined)
  $.ui.toast(isNew ? `Created and switched to ${ref.name}` : `Switched to ${ref.name}`)
}

const pull = async ($: EngineInterface) => {
  const failed = await act($, 'pull', ['pull', '--ff-only'], 120_000)
  if (failed === 'busy') {
    return
  }
  $.ui.toast(failed === null ? 'Pulled.' : `Pull failed: ${failed}`)
}

const fetchRemote = async ($: EngineInterface) => {
  const failed = await act($, 'fetch', ['fetch', '--prune'], 60_000)
  const state = await read($, repo)
  if (state !== null) {
    await loadBranches($, state.root).catch(() => undefined)
  }
  if (failed !== null && failed !== 'busy') {
    await update($, error, () => `fetch: ${failed}`)
  }
}

const openPicker = async ($: EngineInterface) => {
  await refresh($)
  const state = await read($, repo)
  if (state === null) {
    $.ui.toast('Not a git repository.')

    return
  }
  await update($, filter, () => '')
  await update($, error, () => null)
  await loadBranches($, state.root)
  await $.ui.open({ id: PANE, title: 'Switch branch' })
}

const isPickerOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'branch', description: 'Switch git branch (filter, remote branches, create new)' })
    await $.command.register({ name: 'pull', description: 'git pull --ff-only on the current branch' })
    void refresh($).catch(() => undefined)

    return started
  })

  on('command.run', { command: 'branch' }, async $ => {
    if (await isPickerOpen($)) {
      await $.ui.close({ id: PANE })

      return { text: 'Branch picker closed.' }
    }
    await openPicker($)

    return { text: 'Pick a branch.' }
  }).catch(() => ({ text: 'Could not open the branch picker.' }))

  on('command.run', { command: 'pull' }, async $ => {
    await refresh($)
    await pull($)

    return { text: 'Pull finished.' }
  }).catch(() => ({ text: 'Pull could not start.' }))

  // Claude may run git itself; the row follows after each shell command and each turn.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    await refresh($).catch(() => undefined)

    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    await refresh($).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const state = await read($, repo)
    if (state === null || e.props.hasSurvey) {
      return below
    }
    const running = await read($, busy)
    const { Box, Button, Text } = $.ui.resolve(e)
    const counts = `${state.behind > 0 ? ` ↓${state.behind}` : ''}${state.ahead > 0 ? ` ↑${state.ahead}` : ''}`

    return (
      <Box flexDirection="column">
        <Box paddingX={1} gap={1}>
          <Button
            key="branch"
            label={`⑂ ${state.branch}${state.isDirty ? '*' : ''}`}
            plain
            onPress={() => openPicker($)}
          />
          {state.hasUpstream ? (
            <Button
              key="sync"
              label={running === 'pull' ? '↻ pulling…' : `↻${counts}`}
              plain
              dimColor={counts === ''}
              onPress={() => pull($)}
            />
          ) : (
            <Text dimColor>{state.isDetached ? 'detached' : 'no upstream'}</Text>
          )}
          {running === 'switch' && <Text dimColor>switching…</Text>}
        </Box>
        {below}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    if (e.surface === 'mobile') {
      const { Text } = $.ui.resolve(e)

      return <Text dimColor>Switch branches from the terminal or desktop app.</Text>
    }
    const { Box, Input, Select, Text, Button } = $.ui.resolve(e)
    const state = await read($, repo)
    const all = await read($, branches)
    const typed = await read($, filter)
    const failed = await read($, error)
    const running = await read($, busy)
    const matches = filterRefs(all, typed)
    const name = typed.trim()
    const canCreate = isValidBranchName(name) && !all.some(ref => ref.remote === null && ref.name === name)

    const options = [
      ...(canCreate ? [{ value: `new:${name}`, label: `+ Create new branch "${name}"` }] : []),
      ...matches.map(ref => ({
        value: ref.remote === null ? `local:${ref.name}` : `remote:${ref.remote}`,
        label: `${ref.remote === null ? '⑂' : '☁'} ${ref.remote ?? ref.name}${ref.name === state?.branch && ref.remote === null ? '  ● current' : ''}${ref.when ? `  · ${ref.when}` : ''}`,
      })),
    ]

    const choose = (value: string) => {
      const colon = value.indexOf(':')
      const kind = value.slice(0, colon)
      const rest = value.slice(colon + 1)
      if (kind === 'new') {
        return switchTo($, { name: rest, remote: null }, true)
      }
      if (kind === 'remote') {
        return switchTo($, { name: rest.slice(rest.indexOf('/') + 1), remote: rest })
      }

      return switchTo($, { name: rest, remote: null })
    }

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Box justifyContent="space-between">
          <Text>
            <Text color="claude">⑂ </Text>
            <Text bold>{state?.branch ?? '—'}</Text>
            {state?.isDirty && <Text color="warning"> * uncommitted changes</Text>}
          </Text>
          <Button key="fetch" label={running === 'fetch' ? '⇣ fetching…' : '⇣ fetch'} plain dimColor onPress={() => fetchRemote($)} />
        </Box>
        <Box marginTop={1}>
          <Input
            key="filter"
            placeholder="Type to filter, or a new branch name"
            autoFocus
            onInput={(value: string) => update($, filter, () => value)}
            onSubmit={(value: string) => {
              const first = options[0]
              if (first !== undefined) {
                return choose(first.value)
              }
              const wanted = value.trim()

              return isValidBranchName(wanted) ? switchTo($, { name: wanted, remote: null }, true) : undefined
            }}
          />
        </Box>
        {failed !== null && (
          <Box marginTop={1}>
            <Text color="error" wrap="wrap">{failed}</Text>
          </Box>
        )}
        {running === 'switch' && (
          <Box marginTop={1}>
            <Text dimColor>switching…</Text>
          </Box>
        )}
        <Box marginTop={1}>
          {options.length === 0 ? (
            <Text dimColor>No branch matches “{typed}”.</Text>
          ) : (
            <Select key="pick" label="Branches" options={options} onSelect={(value: string) => choose(value)} />
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>⑂ local · ☁ remote only (checked out tracking it) · Enter picks the first · /branch to close</Text>
        </Box>
      </Box>
    )
  })
}
