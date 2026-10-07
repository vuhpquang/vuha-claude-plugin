import type { EngineInterface, Register } from 'claude-code'

import { FIND_CLAUDE_PID, parseArgs, QUIT_LATER, requestFile, SOURCE_LINE, WRAPPER, WRAPPER_DIR, WRAPPER_FILE } from './restart'

const HELP = [
  '/restart        quit and reopen this session, permissions bypassed',
  '/restart safe   the same, with normal permission prompts',
  '/restart setup  install the zsh wrapper that does the reopening (once)',
].join('\n')

const setup = async ($: EngineInterface, home: string) => {
  await $.fs.write(`${home}/${WRAPPER_DIR}/${WRAPPER_FILE}`, WRAPPER)
  const zshrc = `${home}/.zshrc`
  const current = (await $.fs.exists(zshrc)) ? await $.fs.read(zshrc) : ''
  if (current.includes(SOURCE_LINE)) {
    return `Wrapper updated at ~/${WRAPPER_DIR}/${WRAPPER_FILE}; ~/.zshrc already sources it.`
  }
  await $.fs.write(zshrc, `${current}${current.endsWith('\n') || current === '' ? '' : '\n'}\n# claude /restart\n${SOURCE_LINE}\n`)

  return [
    `Wrapper written to ~/${WRAPPER_DIR}/${WRAPPER_FILE} and sourced from ~/.zshrc.`,
    'Open a new terminal tab (or run `source ~/.zshrc`), start Claude there, then /restart works.',
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'restart',
      description: 'Quit and reopen this same session (permissions bypassed); "safe" keeps prompts, "setup" installs it',
    })

    return next(e)
  })

  on('command.run', { command: 'restart' }, async ($, e) => {
    const { action, bypass } = parseArgs(e.args ?? '')
    const home = (await $.env.get('HOME')) ?? ''

    if (action === 'help') {
      return { text: HELP }
    }
    if (action === 'setup') {
      return { text: await setup($, home) }
    }

    const token = await $.env.get('CLAUDE_RESTART_TOKEN')
    const shellPid = await $.env.get('CLAUDE_RESTART_SHELL_PID')
    if (!token || !shellPid) {
      return {
        text: 'This Claude Code was not started through the restart wrapper, so nothing could reopen it.\nRun /restart setup once, open a new terminal tab, and start Claude there.',
      }
    }

    const found = await $.process.run(['sh', '-c', FIND_CLAUDE_PID, 'find-claude', shellPid])
    const pid = found.stdout.trim()
    if (found.exitCode !== 0 || !/^\d+$/.test(pid)) {
      return { text: 'Could not find the Claude Code process to restart; nothing was changed.' }
    }

    const id = await $.session.id()
    const cwd = await $.session.root()
    await $.fs.write(`${home}/${WRAPPER_DIR}/request-${token}`, requestFile({ id, cwd, bypass }))
    await $.process.run(['sh', '-c', QUIT_LATER, 'quit-claude', pid])

    return { text: `↻ Restarting… this session (${id.slice(0, 8)}) reopens${bypass ? ' with permissions bypassed' : ''}.` }
  }).catch(() => ({ text: 'Restart failed before Claude Code was stopped; this session keeps running.' }))
}
