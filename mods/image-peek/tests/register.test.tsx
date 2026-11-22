import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ROW = {
  plugin: 'image-peek',
  component: 'UserMessage',
  requestId: 'msg-1',
  props: { text: 'what is in [Image #1] ?', origin: { kind: 'composer' }, isExpanded: false },
} as const

const engine = (on: On) => {
  on('session.id', () => ({ value: 'sess' }))
  on('env.get', () => ({ value: undefined }))
  on('fs.list', () => ({ value: [] }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>the prompt</Text>
  })
}

test('a sent message with [Image #1] gets a preview, and its button opens the pane', async ($, on) => {
  const opened: string[] = []
  engine(on)
  on('ui.open', (_, e) => {
    opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } }
  })

  const ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  await ui.press({ key: 'msg-msg-1-open-1' })
  expect(opened).toEqual(['image-peek-viewer'])
  await ui.unmount()
})

test('a message without images is left alone', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({
    ...ROW,
    props: { ...ROW.props, text: 'no pictures here' },
    surface: 'terminal',
  })
  expect(await ui.find({ key: 'msg-msg-1-open-1' })).toBeUndefined()
  await ui.unmount()
})

test('the hide button collapses the preview', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  expect((await ui.find({ key: 'msg-msg-1-toggle' }))?.text).toContain('Hide')
  await ui.press({ key: 'msg-msg-1-toggle' })
  expect((await ui.find({ key: 'msg-msg-1-toggle' }))?.text).toContain('Show')
  await ui.unmount()
})
