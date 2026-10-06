import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { MergeRequest, MrLists } from '../types'
import { statusBadge, toMergeRequest } from './gitlab'

const PANE = 'mr-panel'
const REFRESH_MS = 5 * 60 * 1000
const lists = atom({ plugin: 'mr-panel', key: 'lists' } as const, null)
const isLoading = atom({ plugin: 'mr-panel', key: 'isLoading' } as const, false)

const settings = async ($: EngineInterface, apiOption: string) => ({
  api: (apiOption || (await $.env.get('GITLAB_API_URL')) || '').replace(/\/+$/, ''),
  token: (await $.env.get('GITLAB_PERSONAL_ACCESS_TOKEN')) || (await $.env.get('GITLAB_TOKEN')) || '',
})

const fetchMrs = async ($: EngineInterface, apiOption: string): Promise<MrLists> => {
  const { api, token } = await settings($, apiOption)
  const empty = { mine: [], toReview: [], fetchedAt: await $.clock.now() }

  if (!api || !token) {
    return { ...empty, error: 'Set GITLAB_API_URL (or the gitlabApiUrl option) and GITLAB_PERSONAL_ACCESS_TOKEN.' }
  }

  const get = async <T,>(path: string): Promise<T> => {
    const res = await $.http.fetch(`${api}${path}`, { headers: { 'PRIVATE-TOKEN': token } })
    if (!res.ok) {
      throw new Error(`GitLab ${res.status} on ${path.split('?')[0]}`)
    }

    return JSON.parse(res.text) as T
  }

  try {
    const me = await get<{ id: number }>('/user')
    const [mine, toReview] = await Promise.all([
      get<Parameters<typeof toMergeRequest>[0][]>('/merge_requests?scope=created_by_me&state=opened&per_page=30'),
      get<Parameters<typeof toMergeRequest>[0][]>(`/merge_requests?scope=all&state=opened&reviewer_id=${me.id}&per_page=30`),
    ])

    return { mine: mine.map(toMergeRequest), toReview: toReview.map(toMergeRequest), fetchedAt: empty.fetchedAt, error: null }
  } catch (error) {
    return { ...empty, error: error instanceof Error ? error.message : String(error) }
  }
}

const refresh = async ($: EngineInterface, apiOption: string) => {
  await update($, isLoading, () => true)
  const next = await fetchMrs($, apiOption)
  await update($, lists, () => next)
  await update($, isLoading, () => false)
}

const isOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

export const register: Register = (on, options) => {
  const apiOption = (options.gitlabApiUrl as string | undefined) ?? ''

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mr-panel',
      description: 'Show or hide your open GitLab merge requests and review requests',
    })
    $.clock.every(REFRESH_MS, () => {
      void isOpen($).then(open => (open ? refresh($, apiOption) : undefined))
    })

    return next(e)
  })

  on('command.run', { command: 'mr-panel' }, async $ => {
    if (await isOpen($)) {
      await $.ui.close({ id: PANE })

      return { text: 'MR panel closed.' }
    }

    await $.ui.open({ id: PANE, title: 'Merge requests' })
    void refresh($, apiOption)

    return { text: 'MR panel open.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const data = await read($, lists)
    const loading = await read($, isLoading)

    const review = (mr: MergeRequest) =>
      $.prompt.submit({ text: `Review this GitLab merge request: ${mr.url}`, asUser: true })

    const section = (label: string, items: MergeRequest[], showAuthor: boolean) => (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color="suggestion" bold>{label}</Text>
          <Text dimColor> · {items.length}</Text>
        </Text>
        {items.length === 0 && <Text dimColor>  nothing open</Text>}
        {items.map(mr => {
          const badge = statusBadge(mr)

          return (
            <Box key={`mr-${label}-${mr.id}`} flexDirection="column" marginTop={1}>
              <Box justifyContent="space-between">
                <Text wrap="truncate-end">
                  <Text color={badge.color}>● </Text>
                  <Link href={mr.url} label={`!${mr.iid}`} />
                  <Text bold> {mr.title}</Text>
                </Text>
                <Button key={`review-${mr.id}`} label="▶ review" plain dimColor onPress={() => review(mr)} />
              </Box>
              <Box paddingLeft={2}>
                <Text dimColor wrap="truncate-end">
                  <Text color={badge.color}>{badge.text}</Text>
                  {' · '}{mr.project}
                  {showAuthor ? ` · @${mr.author}` : ''}
                  {mr.notes > 0 ? ` · ${mr.notes} comments` : ''}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
    )

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Box justifyContent="space-between">
          <Text>
            <Text color="claude">◆ </Text>
            <Text bold>Merge requests</Text>
            {loading && <Text dimColor> loading…</Text>}
          </Text>
          <Button key="refresh" label="↻ refresh" plain dimColor onPress={() => refresh($, apiOption)} />
        </Box>
        {data?.error && <Text color="error">{data.error}</Text>}
        {data && !data.error && section('TO REVIEW', data.toReview, true)}
        {data && !data.error && section('MINE', data.mine, false)}
        <Box marginTop={1}>
          <Text dimColor>▶ review asks Claude to review it · refreshes every 5 min · /mr-panel to hide</Text>
        </Box>
      </Box>
    )
  })
}
