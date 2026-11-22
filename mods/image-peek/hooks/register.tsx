import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// Claude Code saves every image pasted into the prompt box as
//   <tmp>/claude-<uid>/<project-slug>/<session-id>/images/<N>.png
// and puts "[Image #N]" in the draft. This mod draws those files.

const PANE = 'image-peek-viewer'
const THUMB_ROWS = 6
const THUMB_MAX_COLS = 36
// A terminal cell is about twice as tall as it is wide.
const CELL_ASPECT = 2
const IMAGE_TAG = /\[Image #(\d+)\]/g

const draft = atom({ plugin: 'image-peek', key: 'draft' } as const, [])
const isHidden = atom({ plugin: 'image-peek', key: 'isHidden' } as const, false)
const viewing = atom({ plugin: 'image-peek', key: 'viewing' } as const, null)

type Size = { width: number; height: number }

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Decodes a short base64 string to bytes. */
const decode = (text: string) => {
  const clean = text.replace(/=+$/, '')
  const out: number[] = []
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map(j => Math.max(0, ALPHABET.indexOf(clean[i + j] ?? 'A')))
    const word = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!
    out.push((word >> 16) & 255, (word >> 8) & 255, word & 255)
  }
  return new Uint8Array(out)
}

const numbersIn = (text: string) => {
  const found = new Set<number>()
  for (const match of text.matchAll(IMAGE_TAG)) found.add(Number(match[1]))
  return [...found].sort((a, b) => a - b)
}

const sameList = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((n, i) => n === b[i])

/** The largest box of cells inside maxCols x maxRows keeping the picture's shape. */
const fit = (size: Size, maxCols: number, maxRows: number) => {
  const ratio = size.width / Math.max(1, size.height)
  let rows = maxRows
  let columns = Math.round(rows * CELL_ASPECT * ratio)
  if (columns > maxCols) {
    columns = maxCols
    rows = Math.round(columns / (CELL_ASPECT * ratio))
  }
  return {
    columns: Math.min(255, Math.max(1, columns)),
    rows: Math.min(255, Math.max(1, rows)),
  }
}

// Module variables start over on a reload; both are cheap to find again.
let imagesDir: string | null | undefined
const sizes = new Map<string, Size | null>()

/** This session's images folder, found once by its session id. */
/** The current user's id, so only their own claude-<uid> folder is read. */
const userId = async ($: EngineInterface) => {
  const run = await $.process.run(['id', '-u']).catch(() => undefined)
  const uid = run?.exitCode === 0 ? run.stdout.trim() : ''
  return /^\d+$/.test(uid) ? uid : null
}

/**
 * This session's images folder, found once by its session id: only under
 * <tmp>/claude-<own uid>, never through a symbolic link, and only where its
 * real path stays inside that folder.
 */
const findDir = async ($: EngineInterface) => {
  if (imagesDir) return imagesDir
  const uid = await userId($)
  if (!uid) return null
  const sessionId = await $.session.id()
  const tmpdir = (await $.env.get('TMPDIR'))?.replace(/\/$/, '')
  const roots = [...(tmpdir ? [tmpdir] : []), '/tmp', '/private/tmp']
  for (const root of roots) {
    const base = `${root}/claude-${uid}`
    const baseStat = await $.fs.stat(base, { resolve: true }).catch(() => undefined)
    if (!baseStat || baseStat.kind !== 'dir' || baseStat.isLink || !baseStat.realPath) continue
    const baseReal = baseStat.realPath.replace(/\/$/, '')
    const projects = await $.fs.list(base).catch(() => [])
    for (const project of projects) {
      if (project.isLink || project.kind !== 'dir') continue
      const dir = `${base}/${project.name}/${sessionId}/images`
      const dirStat = await $.fs.stat(dir, { resolve: true }).catch(() => undefined)
      const isSafe =
        dirStat?.kind === 'dir' &&
        !dirStat.isLink &&
        dirStat.realPath?.startsWith(`${baseReal}/`) === true
      if (isSafe) {
        imagesDir = dir
        return dir
      }
    }
  }
  return null
}

const pathOf = async ($: EngineInterface, n: number) => {
  const dir = await findDir($)
  return dir ? `${dir}/${n}.png` : null
}

/** Width and height from the PNG header, or null when not a readable PNG. */
const sizeOf = async ($: EngineInterface, path: string) => {
  if (sizes.has(path)) return sizes.get(path) ?? null
  let size: Size | null = null
  try {
    const { base64 } = await $.fs.read(path, { as: 'bytes', length: 24 })
    const head = decode(base64)
    if (head[0] === 0x89 && head[1] === 0x50 && head.length >= 24) {
      const view = new DataView(head.buffer)
      size = { width: view.getUint32(16), height: view.getUint32(20) }
    }
  } catch {
    size = null
  }
  if (size) sizes.set(path, size)
  return size
}

/** Every image number saved in this session, ascending. */
const allNumbers = async ($: EngineInterface) => {
  const dir = await findDir($)
  if (!dir) return []
  const entries = await $.fs.list(dir).catch(() => [])
  return entries
    .map(entry => /^(\d+)\.png$/.exec(entry.name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number)
    .sort((a, b) => a - b)
}

const trackDraft = async ($: EngineInterface, text: string) => {
  const now = numbersIn(text)
  if (!sameList(now, await read($, draft))) await update($, draft, () => now)
}

const openViewer = async ($: EngineInterface, n: number) => {
  await update($, viewing, () => n)
  await $.ui.open({ id: PANE, title: 'Image preview' })
}

/** A row of thumbnails with a button under each, plus the hide toggle. */
const thumbnails = async ($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], numbers: number[], where: string) => {
  const elements = $.ui.resolve(e)
  const { Box, Text, Button } = elements
  const Image = 'Image' in elements ? elements.Image : undefined
  const hidden = await read($, isHidden)
  const label = `🖼 ${numbers.length} image${numbers.length > 1 ? 's' : ''} `
  const toggle = (
    <Button
      key={`${where}-toggle`}
      label={hidden ? 'Show' : 'Hide'}
      dimColor
      onPress={() => update($, isHidden, value => !value)}
    />
  )

  if (hidden || !Image) {
    return (
      <Box>
        <Text dimColor>{label}</Text>
        {Image && toggle}
        {numbers.map(n => (
          <Button key={`${where}-open-${n}`} label={`#${n}`} dimColor onPress={() => openViewer($, n)} />
        ))}
      </Box>
    )
  }

  const cells = []
  for (const n of numbers) {
    const path = await pathOf($, n)
    const size = path ? await sizeOf($, path) : null
    const box = size ? fit(size, THUMB_MAX_COLS, THUMB_ROWS) : null
    cells.push(
      <Box key={`${where}-cell-${n}`} flexDirection="column" marginRight={2}>
        {path && size && box ? (
          <Image
            key={`${where}-img-${n}`}
            source={{ file: path, format: 'png' }}
            columns={box.columns}
            rows={box.rows}
            alt={`[Image #${n}]`}
          />
        ) : (
          <Text dimColor>[Image #{n}: no preview]</Text>
        )}
        <Button key={`${where}-open-${n}`} label={`⤢ #${n}`} dimColor onPress={() => openViewer($, n)} />
      </Box>,
    )
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Text dimColor>{label}</Text>
        {toggle}
      </Box>
      <Box flexDirection="row" flexWrap="wrap">
        {cells}
      </Box>
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'image-peek',
      description: 'Toggle pasted-image thumbnails (args: show | hide | open)',
    })
    return next(e)
  })

  on('command.run', { command: 'image-peek' }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    if (arg === 'open') {
      const all = await allNumbers($)
      const last = all[all.length - 1]
      if (last === undefined) return { text: 'No pasted images in this session yet.' }
      await openViewer($, last)
      return { text: `Showing Image #${last}.` }
    }
    const hidden =
      arg === 'hide' ? true : arg === 'show' ? false : !(await read($, isHidden))
    await update($, isHidden, () => hidden)
    return { text: hidden ? 'Image previews hidden.' : 'Image previews shown.' }
  })

  // Keep the draft's [Image #N] list current: a paste or key, and anything else
  // that changes the box (a clear after submit, a history recall).
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    if ('text' in box && typeof box.text === 'string') await trackDraft($, box.text)
    return box
  })

  on('prompt.change', async ($, e, next) => {
    await trackDraft($, e.text)
    return next(e)
  })

  // Above the prompt: the images in the draft being written.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const numbers = await read($, draft)
    if (numbers.length === 0) return next(e)
    return thumbnails($, e, numbers, 'band')
  })

  // Under each sent message: the images it carried.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const row = await next(e)
    const numbers = numbersIn(e.props.text)
    if (numbers.length === 0) return row
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {row}
        <Box paddingLeft={2}>{await thumbnails($, e, numbers, `msg-${e.requestId}`)}</Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Text, Button } = elements
    const Image = 'Image' in elements ? elements.Image : undefined
    const all = await allNumbers($)
    const wanted = await read($, viewing)
    const current = wanted !== null && all.includes(wanted) ? wanted : all[all.length - 1]

    if (current === undefined) {
      return <Text dimColor>No pasted images in this session yet.</Text>
    }

    const at = all.indexOf(current)
    const prev = at > 0 ? all[at - 1] : undefined
    const nextOne = at < all.length - 1 ? all[at + 1] : undefined
    const path = await pathOf($, current)
    const size = path ? await sizeOf($, path) : null
    const cols = Math.max(10, (e.props.bodyColumns ?? e.viewport?.columns ?? 80) - 2)
    const rows = Math.max(5, (e.props.scroll?.bodyRows ?? (e.viewport?.rows ?? 30) - 6) - 4)
    const box = size ? fit(size, cols, rows) : null

    return (
      <Box flexDirection="column">
        <Box>
          <Text bold>Image #{current} </Text>
          <Text dimColor>
            {size ? `${size.width}×${size.height} · ` : ''}
            {at + 1}/{all.length}
          </Text>
        </Box>
        <Box marginTop={1} marginBottom={1}>
          {path && size && box && Image ? (
            <Image
              key="view"
              source={{ file: path, format: 'png' }}
              columns={box.columns}
              rows={box.rows}
              alt={`[Image #${current}]`}
            />
          ) : (
            <Text dimColor>{Image ? 'Could not read this image.' : 'This surface cannot draw images.'}</Text>
          )}
        </Box>
        <Box>
          {prev !== undefined && (
            <Button key="prev" hotkey="h" label="← Prev" onPress={() => update($, viewing, () => prev)} />
          )}
          {nextOne !== undefined && (
            <Button key="next" hotkey="l" label="Next →" onPress={() => update($, viewing, () => nextOne)} />
          )}
          <Button key="close" hotkey="q" role="dismiss" label="Close" onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )
  })
}
