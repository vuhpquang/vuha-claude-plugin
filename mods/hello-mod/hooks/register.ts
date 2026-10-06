import type { Register } from 'claude-code'

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    const hasFailed = ran.deny === undefined && ran.isError === true

    $.ui.status(hasFailed ? `failed: ${e.command.slice(0, 40)}` : undefined)

    return ran
  }).catch(($, e, next) => next(e))
}
