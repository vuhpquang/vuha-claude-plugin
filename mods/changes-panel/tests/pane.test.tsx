import { expect, test } from 'claude-code/testing'

const DIFF = ['diff --git a/README.md b/README.md', '@@ -1,2 +1,2 @@', ' # title', '-old line here', '+new line here', '']
const PANE = {
  component: 'Pane',
  requestId: 'changes-panel',
  props: { title: 'Changes', isFocused: true, bodyColumns: 100, placement: 'dock' },
} as const

const ok = (stdout: string) => ({ exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false })

// Stands in for git run from a subfolder of /repo: like git, a pathspec only matches from the top.
const fakeGit = (argv: readonly string[], cwd: string | undefined) => {
  const args = argv.slice(1).join(' ')
  if (args.startsWith('rev-parse --show-toplevel')) return ok('/repo\n')
  if (args.startsWith('rev-parse --abbrev-ref')) return ok('main\n')
  if (args.startsWith('rev-list')) return ok('1\n')
  if (args.startsWith('status')) return ok(' M README.md\0')
  if (args.startsWith('diff --numstat')) return ok('1\t1\tREADME.md\0')
  if (args.startsWith('diff --no-color HEAD -- README.md')) return ok(cwd === '/repo' ? DIFF.join('\n') : '')

  return ok('')
}

test('lists the change, opens its diff and switches to side by side', async ($, on) => {
  on('process.run', async (_$, e) => ({ value: fakeGit(e.argv, e.init?.cwd) }))
  on('ui.panes', async () => ({ value: [] }))
  on('ui.open', async () => ({ value: { isPlaced: true as const } }))

  await $.command.run({ command: 'changes-panel' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'changes-panel', surface, ...PANE })
    expect(await ui.find({ key: 'commit' })).toBeDefined()
    expect(await ui.find({ key: 'open-README.md' })).toBeDefined()

    await ui.press({ key: 'open-README.md' })
    expect(await ui.find({ type: 'Text', text: /new line here/ })).toBeDefined()
    expect(await ui.find({ key: 'u-2' })).toBeDefined()

    await ui.press({ key: 'mode' })
    expect(await ui.find({ key: 's-2-l' })).toBeDefined()
    expect(await ui.find({ key: 's-2-r' })).toBeDefined()

    await ui.press({ key: 'mode' })
    await ui.press({ key: 'close-diff' })
    expect(await ui.find({ key: 'u-2' })).toBeUndefined()
    await ui.unmount()
  }
})
