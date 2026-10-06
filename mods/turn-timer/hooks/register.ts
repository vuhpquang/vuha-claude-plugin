import type { Register, Timer } from 'claude-code'

import { formatDuration, turnText } from './format'

export const register: Register = (on, options) => {
  const longTurnSeconds = Number(options.longTurnSeconds ?? 120)
  let startedAt = 0
  let tools = 0
  let ticker: Timer | null = null

  on('prompt.submit', async ($, e, next) => {
    startedAt = await $.clock.now()
    tools = 0
    ticker?.cancel()
    ticker = $.clock.every(1000, () => {
      void $.clock.now().then(now => $.ui.status(turnText((now - startedAt) / 1000, tools, true)))
    })

    return next(e)
  }).catch(($, e, next) => next(e))

  // Only the main loop's calls count; a subagent's carry an agentId.
  on('tool.call', ($, e, next) => {
    if (e.agentId === undefined) {
      tools += 1
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    ticker?.cancel()
    ticker = null

    if (startedAt > 0) {
      const seconds = ((await $.clock.now()) - startedAt) / 1000
      $.ui.status(turnText(seconds, tools, false))
      if (longTurnSeconds > 0 && seconds >= longTurnSeconds) {
        $.ui.toast(`Turn done in ${formatDuration(seconds)} (${tools} tool calls)`)
      }
    }

    return done
  })
}
