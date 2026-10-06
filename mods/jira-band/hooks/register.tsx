import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { JiraView } from '../types'
import { authHeader, issueKeyOf, statusColor, toIssue } from './jira'

const STALE_MS = 10 * 60 * 1000
const view = atom({ plugin: 'jira-band', key: 'view' } as const, null)
const isHidden = atom({ plugin: 'jira-band', key: 'isHidden' } as const, false)

type JiraOptions = { url: string; user: string }

const currentBranch = async ($: EngineInterface) => {
  const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'], { timeoutMs: 5000 })

  return exitCode === 0 ? stdout.trim() : ''
}

const refresh = async ($: EngineInterface, opts: JiraOptions, force: boolean) => {
  const branch = await currentBranch($).catch(() => '')
  const key = issueKeyOf(branch)
  const now = await $.clock.now()
  const previous = await read($, view)

  if (!force && previous && previous.key === key && now - previous.fetchedAt < STALE_MS) {
    return
  }

  const url = (opts.url || (await $.env.get('JIRA_URL')) || '').replace(/\/+$/, '')
  const token = (await $.env.get('JIRA_API_TOKEN')) || ''
  const next: JiraView = { branch, key, issue: null, error: null, fetchedAt: now }

  if (key && (!url || !token)) {
    next.error = 'set JIRA_URL (or the jiraUrl option) and JIRA_API_TOKEN'
  } else if (key) {
    try {
      const res = await $.http.fetch(`${url}/rest/api/2/issue/${key}?fields=summary,status,assignee`, {
        headers: { Authorization: authHeader(token, opts.user), Accept: 'application/json' },
      })
      if (res.ok) {
        next.issue = toIssue(JSON.parse(res.text), url)
      } else {
        next.error = `Jira ${res.status}`
      }
    } catch (error) {
      next.error = error instanceof Error ? error.message : String(error)
    }
  }

  await update($, view, () => next)
}

export const register: Register = (on, options) => {
  const opts: JiraOptions = {
    url: (options.jiraUrl as string | undefined) ?? '',
    user: (options.jiraUser as string | undefined) ?? '',
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'jira-band',
      description: 'Show or hide the Jira ticket of the current branch above the prompt',
    })
    void refresh($, opts, true)

    return next(e)
  })

  on('command.run', { command: 'jira-band' }, async $ => {
    const hidden = await update($, isHidden, value => !value)
    if (!hidden) {
      await refresh($, opts, true)
    }

    return { text: hidden ? 'Jira band hidden.' : 'Jira band shown.' }
  })

  // The branch may change during a turn (git checkout); re-read it after each one.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    void refresh($, opts, false)

    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    const data = await read($, view)

    if (e.props.hasSurvey || !data?.key || (await read($, isHidden))) {
      return below
    }

    const { Box, Link, Text } = $.ui.resolve(e)
    const issue = data.issue

    return (
      <Box flexDirection="column">
        <Box paddingX={1}>
          <Text wrap="truncate-end">
            <Text color="claude">◆ </Text>
            {issue ? <Link href={issue.url} label={issue.key} /> : <Text bold>{data.key}</Text>}
            {issue && (
              <Text>
                {' '}
                <Text color={statusColor(issue.statusCategory)} bold>
                  {issue.status}
                </Text>
                <Text> {issue.summary}</Text>
                {issue.assignee !== null && <Text dimColor> · {issue.assignee}</Text>}
              </Text>
            )}
            {data.error !== null && <Text dimColor> · {data.error}</Text>}
          </Text>
        </Box>
        {below}
      </Box>
    )
  })
}
