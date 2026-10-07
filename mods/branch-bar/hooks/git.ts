import type { BranchRef } from '../types'

// `git for-each-ref --format=%(refname)%09%(committerdate:relative) refs/heads refs/remotes`
// Local branches first; a remote branch shows only when no local branch has its name.
export const parseRefs = (out: string): BranchRef[] => {
  const locals: BranchRef[] = []
  const remotes: BranchRef[] = []
  for (const line of out.split('\n')) {
    const [ref, when = ''] = line.split('\t')
    if (!ref) {
      continue
    }
    if (ref.startsWith('refs/heads/')) {
      locals.push({ name: ref.slice('refs/heads/'.length), remote: null, when })
    } else if (ref.startsWith('refs/remotes/')) {
      const full = ref.slice('refs/remotes/'.length)
      const slash = full.indexOf('/')
      const name = slash === -1 ? '' : full.slice(slash + 1)
      if (name === '' || name === 'HEAD') {
        continue
      }
      remotes.push({ name, remote: full, when })
    }
  }
  const localNames = new Set(locals.map(ref => ref.name))
  const seen = new Set<string>()
  const onlyRemote = remotes.filter(ref => {
    if (localNames.has(ref.name) || seen.has(ref.name)) {
      return false
    }
    seen.add(ref.name)

    return true
  })

  return [...locals, ...onlyRemote]
}

// Every word of the filter must appear in the name, in any order; case does not matter.
export const filterRefs = (refs: readonly BranchRef[], filter: string, limit = 60): BranchRef[] => {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)

  return refs.filter(ref => words.every(word => ref.name.toLowerCase().includes(word))).slice(0, limit)
}

// `git rev-list --left-right --count @{u}...HEAD`: "behind<TAB>ahead".
export const parseCounts = (out: string) => {
  const [behind = '0', ahead = '0'] = out.trim().split(/\s+/)

  return { behind: Number(behind) || 0, ahead: Number(ahead) || 0 }
}

// What `git check-ref-format --branch` would refuse, checked before offering "create".
export const isValidBranchName = (name: string) =>
  name.length > 0 &&
  !/[\s~^:?*[\\]|\.\.|@\{|\/\/|^[-/.]|[/.]$|\.lock$/.test(name)

export const switchArgv = (ref: { name: string; remote: string | null }) =>
  ref.remote === null ? ['switch', ref.name] : ['switch', '--track', ref.remote]

export const createArgv = (name: string) => ['switch', '-c', name]

// The first line git printed that says what went wrong.
export const gitError = (stderr: string, stdout = '') => {
  const lines = `${stderr}\n${stdout}`.split('\n').map(line => line.trim()).filter(Boolean)

  return lines.find(line => /^(error|fatal):/i.test(line)) ?? lines[0] ?? 'git failed'
}
