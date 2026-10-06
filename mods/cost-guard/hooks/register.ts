import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { newWarnings, statusText } from './guard'

const warned = atom({ plugin: 'cost-guard', key: 'warned' } as const, [])

type Limits = { costWarnUsd: number; rateWarnPercent: number }

const check = async ($: EngineInterface, limits: Limits) => {
  const { cost, rateLimits } = await $.session.usage()
  const usd = cost?.usd
  const text = statusText(usd, rateLimits)

  $.ui.status(text ? `💸 ${text}` : undefined)

  const fresh = newWarnings(usd, rateLimits, limits, await read($, warned))
  if (fresh.length > 0) {
    $.ui.toast(fresh.map(warning => warning.text).join(' · '), { timeoutMs: 8000 })
    await update($, warned, list => [...list, ...fresh.map(warning => warning.id)])
  }
}

export const register: Register = (on, options) => {
  const limits: Limits = {
    costWarnUsd: Number(options.costWarnUsd ?? 5),
    rateWarnPercent: Number(options.rateWarnPercent ?? 80),
  }

  on('session.start', async ($, e, next) => {
    void check($, limits)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void check($, limits)

    return done
  })
}
