import type { MergeRequest } from '../types'

type GitlabMr = {
  id: number
  iid: number
  title: string
  web_url: string
  draft?: boolean
  has_conflicts?: boolean
  user_notes_count?: number
  detailed_merge_status?: string
  author?: { username?: string }
  references?: { full?: string }
}

export const toMergeRequest = (mr: GitlabMr): MergeRequest => ({
  id: mr.id,
  iid: mr.iid,
  title: mr.title,
  url: mr.web_url,
  project: (mr.references?.full ?? '').replace(/!\d+$/, ''),
  author: mr.author?.username ?? '',
  status: mr.detailed_merge_status ?? 'unchecked',
  isDraft: mr.draft === true,
  hasConflicts: mr.has_conflicts === true,
  notes: mr.user_notes_count ?? 0,
})

// GitLab's detailed_merge_status, said in a few words and a theme colour.
export const statusBadge = (mr: MergeRequest): { text: string; color: string } => {
  if (mr.hasConflicts || mr.status === 'conflict') return { text: 'conflict', color: 'error' }
  if (mr.isDraft || mr.status === 'draft_status') return { text: 'draft', color: 'inactive' }

  switch (mr.status) {
    case 'mergeable':
      return { text: 'ready', color: 'success' }
    case 'ci_still_running':
    case 'checking':
    case 'unchecked':
      return { text: 'ci running', color: 'warning' }
    case 'ci_must_pass':
      return { text: 'ci failed', color: 'error' }
    case 'discussions_not_resolved':
      return { text: 'open threads', color: 'warning' }
    case 'not_approved':
      return { text: 'needs approval', color: 'suggestion' }
    case 'need_rebase':
      return { text: 'needs rebase', color: 'warning' }
    default:
      return { text: mr.status.replace(/_/g, ' '), color: 'inactive' }
  }
}
