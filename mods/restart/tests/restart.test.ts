import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { parseArgs, requestFile, SOURCE_LINE, WRAPPER } from '../hooks/restart'

test('reads what /restart was asked for', async () => {
  expect(parseArgs('')).toEqual({ action: 'restart', bypass: true })
  expect(parseArgs('safe')).toEqual({ action: 'restart', bypass: false })
  expect(parseArgs(' Setup ')).toEqual({ action: 'setup', bypass: true })
  expect(parseArgs('help')).toEqual({ action: 'help', bypass: true })
})

test('the request is plain key=value lines and refuses a newline', async () => {
  expect(requestFile({ id: 'abc', cwd: '/w/p q', bypass: true })).toBe('id=abc\ncwd=/w/p q\nbypass=1\n')
  expect(() => requestFile({ id: 'a\nb', cwd: '/w', bypass: false })).toThrow()
})

test('the wrapper resumes with the bypass flag and never evaluates the request', async () => {
  expect(WRAPPER).toContain('--dangerously-skip-permissions')
  expect(WRAPPER).toContain('command claude')
  expect(WRAPPER).not.toContain('eval')
  expect(SOURCE_LINE).toContain('.claude-restart/wrapper.zsh')
})

type Env = Record<string, string | undefined>

// Stands in for the host: environment, session, file writes and processes, all recorded.
const harness = (on: On, env: Env) => {
  const writes: Record<string, string> = {}
  const runs: string[][] = []
  on('env.get', async (_$, e) => ({ value: env[e.name] }))
  on('session.id', async () => ({ value: '11112222-3333-4444-5555-666677778888' }))
  on('session.root', async () => ({ value: '/work/proj' }))
  on('fs.write', async (_$, e) => {
    writes[e.path] = e.text

    return { value: undefined }
  })
  on('fs.exists', async () => ({ value: false }))
  on('process.run', async (_$, e) => {
    runs.push([...e.argv])
    const stdout = e.argv[3] === 'find-claude' ? '4242\n' : ''

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  return { writes, runs }
}

test('outside the wrapper it stops nothing and installs the wrapper for next time', async ($, on) => {
  const { writes, runs } = harness(on, { HOME: '/h' })
  const answer = await $.command.run({ command: 'restart' })

  expect(String(answer.text)).toContain('Open a new terminal tab')
  expect(writes['/h/.claude-restart/wrapper.zsh']).toBe(WRAPPER)
  expect(Object.keys(writes).some(path => path.includes('request-'))).toBe(false)
  expect(runs).toEqual([])
})

test('inside the wrapper it leaves the request and quits Claude Code', async ($, on) => {
  const { writes, runs } = harness(on, { HOME: '/h', CLAUDE_RESTART_TOKEN: 'tok', CLAUDE_RESTART_SHELL_PID: '99' })
  const answer = await $.command.run({ command: 'restart' })

  expect(writes['/h/.claude-restart/request-tok']).toBe('id=11112222-3333-4444-5555-666677778888\ncwd=/work/proj\nbypass=1\n')
  expect(runs.map(argv => argv[3])).toEqual(['find-claude', 'quit-claude'])
  expect(runs[1]?.[4]).toBe('4242')
  expect(String(answer.text)).toContain('Restarting')
})

test('setup writes the wrapper and sources it from ~/.zshrc once', async ($, on) => {
  const { writes } = harness(on, { HOME: '/h' })
  await $.command.run({ command: 'restart', args: 'setup' })

  expect(writes['/h/.claude-restart/wrapper.zsh']).toBe(WRAPPER)
  expect(writes['/h/.zshrc']).toContain(SOURCE_LINE)
})
