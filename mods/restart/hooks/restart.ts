// The zsh side: a `claude` function that runs the real binary and, when it exits because of
// /restart, reopens the session it was asked to. Kept here so `/restart setup` can write it.
export const WRAPPER_DIR = '.claude-restart'
export const WRAPPER_FILE = 'wrapper.zsh'
export const SOURCE_LINE = `[ -f "$HOME/${WRAPPER_DIR}/${WRAPPER_FILE}" ] && source "$HOME/${WRAPPER_DIR}/${WRAPPER_FILE}"`

export const WRAPPER = `# Written by the restart plugin (/restart setup). Lets /restart reopen the same session.
claude() {
  local dir="$HOME/${WRAPPER_DIR}"
  local token="$$-$RANDOM$RANDOM"
  local req="$dir/request-$token"
  CLAUDE_RESTART_TOKEN="$token" CLAUDE_RESTART_SHELL_PID="$$" command claude "$@"
  local code=$?
  local id cwd bypass k v back
  local -a args
  while [[ -f "$req" ]]; do
    id="" cwd="" bypass=""
    while IFS='=' read -r k v; do
      case "$k" in
        id) id="$v" ;;
        cwd) cwd="$v" ;;
        bypass) bypass="$v" ;;
      esac
    done < "$req"
    rm -f "$req"
    [[ -z "$id" ]] && break
    args=(--resume "$id")
    [[ "$bypass" == 1 ]] && args+=(--dangerously-skip-permissions)
    print -P "%F{208}↻ restarting Claude Code, session $id%f"
    # No subshell: Claude's parent must stay this shell, or the next /restart cannot find it.
    back="$PWD"
    builtin cd -q -- "\${cwd:-$PWD}" || break
    CLAUDE_RESTART_TOKEN="$token" CLAUDE_RESTART_SHELL_PID="$$" command claude "\${args[@]}"
    code=$?
    builtin cd -q -- "$back"
  done
  return $code
}
`

// Session ids and paths go in a file the wrapper reads line by line, never evaluates.
export const requestFile = (request: { id: string; cwd: string; bypass: boolean }) => {
  if (/[\n\r]/.test(request.id + request.cwd)) {
    throw new Error('session id or folder contains a newline')
  }

  return `id=${request.id}\ncwd=${request.cwd}\nbypass=${request.bypass ? 1 : 0}\n`
}

// Finds Claude Code's own process: the ancestor of the probe whose parent is the wrapper's shell.
export const FIND_CLAUDE_PID = [
  'shell="$1"; p="$PPID"',
  'while [ "$p" -gt 1 ]; do',
  '  pp=$(ps -o ppid= -p "$p" | tr -d " ")',
  '  [ "$pp" = "$shell" ] && { echo "$p"; exit 0; }',
  '  p="$pp"',
  'done',
  'exit 1',
].join('\n')

// Signals it after the command's answer has been drawn; detached, so it outlives the plugin.
export const QUIT_LATER = '( sleep 0.4; kill -TERM "$1" ) >/dev/null 2>&1 &'

export type RestartArgs = { action: 'restart' | 'setup' | 'help'; bypass: boolean }

export const parseArgs = (args: string): RestartArgs => {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (words.includes('setup') || words.includes('install')) {
    return { action: 'setup', bypass: true }
  }
  if (words.includes('help')) {
    return { action: 'help', bypass: true }
  }

  return { action: 'restart', bypass: !(words.includes('safe') || words.includes('--safe')) }
}
