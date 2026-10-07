import { expect, test } from 'claude-code/testing'

const ok = (stdout = '', exitCode = 0, stderr = '') => ({
  exitCode,
  stdout,
  stderr,
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

// A repo on master, 1 behind its upstream, with one other local and one remote-only branch.
const fakeGit = (argv: readonly string[], log: string[][]) => {
  log.push([...argv])
  const args = argv.slice(1).join(' ')
  if (args === 'rev-parse --show-toplevel') return ok('/repo\n')
  if (args.startsWith('symbolic-ref')) return ok('master\n')
  if (args.startsWith('rev-list')) return ok('1\t0\n')
  if (args.startsWith('status')) return ok('')
  if (args.startsWith('for-each-ref') && args.endsWith('refs/heads')) {
    return ok('refs/heads/master\tnow\nrefs/heads/feat/pay\t2 days ago\n')
  }
  if (args.startsWith('for-each-ref') && args.endsWith('refs/remotes')) return ok('refs/remotes/origin/feat/new\t1 day ago\n')
  if (args === 'switch feat/pay') return ok()
  if (args === 'switch --track origin/feat/new') return ok('', 1, "error: you need to resolve your current index first\n")
  if (args === 'pull --ff-only') return ok('Updating a..b\n')

  return ok()
}

test('click the branch, filter, pick: it switches; a failure stays in the picker', async ($, on) => {
  const log: string[][] = []
  const opened: string[] = []
  const toasts: string[] = []
  on('process.run', async (_$, e) => ({ value: fakeGit(e.argv, log) }))
  on('ui.open', async (_$, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async () => ({ value: undefined }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.toast', async (_$, e) => {
    toasts.push(String(e.text))

    return { value: undefined }
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="below" />
  })

  // In a session the row is filled at start; here the /branch command does the same first read.
  await $.command.run({ command: 'branch' })

  for (const surface of ['terminal', 'desktop'] as const) {
    log.length = 0
    const band = await $.ui.mount({ plugin: 'branch-bar', surface, component: 'AbovePrompt', props: { hasSurvey: false } })
    await band.press({ key: 'branch' })
    expect(opened).toContain('branch-picker')

    const pane = await $.ui.mount({
      plugin: 'branch-bar',
      surface,
      component: 'Pane',
      requestId: 'branch-picker',
      props: { title: 'Switch branch', isFocused: true, bodyColumns: 80, placement: 'dock' },
    })
    await pane.input({ key: 'filter', text: 'new', kind: 'change' })
    await pane.select({ key: 'pick', value: 'remote:origin/feat/new' })
    expect(log.some(argv => argv.join(' ') === 'git switch --track origin/feat/new')).toBe(true)
    expect(await pane.find({ type: 'Text', text: /resolve your current index/ })).toBeDefined()

    await pane.input({ key: 'filter', text: 'pay', kind: 'change' })
    await pane.select({ key: 'pick', value: 'local:feat/pay' })
    expect(log.some(argv => argv.join(' ') === 'git switch feat/pay')).toBe(true)
    expect(toasts).toContain('Switched to feat/pay')

    await band.press({ key: 'sync' })
    expect(log.some(argv => argv.join(' ') === 'git pull --ff-only')).toBe(true)
    await pane.unmount()
    await band.unmount()
  }
})
