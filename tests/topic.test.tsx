import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'session-topic',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 60,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'session-topic',
  component: 'Pane',
  requestId: 'session-topic',
  props: {
    title: 'Topic',
    isFocused: false,
    bodyColumns: 36,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('pin, band, pane, and on/off', async ($, on) => {
  on('command.register', () => ({ value: { command: 'topic' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.after', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const pinned = await $.command.run({ command: 'topic', args: 'ESO PR | review fixes' })
  expect(pinned.text).toBe('Pinned: ESO PR')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /ESO PR/ }))?.text).toMatch(
      /ESO PR \[pinned\]/,
    )
    expect((await ui.find({ type: 'Text', text: /review fixes/ }))?.text).toMatch(
      /review fixes/,
    )
    await ui.unmount()
  }

  await $.command.run({ command: 'topic', args: 'pane' })
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await pane.find({ type: 'Text', text: /review fixes/ }))?.text).toBe(
    'review fixes',
  )
  await pane.unmount()
  const yielded = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await yielded.find({ type: 'Text' }))?.text).toBe('engine')
  await yielded.unmount()
  await $.command.run({ command: 'topic', args: 'band' })

  const off = await $.command.run({ command: 'topic', args: 'off' })
  expect(off.text).toMatch(/off/)
  const hidden = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await hidden.find({ type: 'Text' }))?.text).toBe('engine')
  await hidden.unmount()

  await $.command.run({ command: 'topic', args: 'on' })
  const back = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await back.find({ type: 'Text', text: /ESO PR/ }))?.text).toMatch(/ESO PR/)
  await back.unmount()
})

test(
  'enabled: false in the config starts off until /topic on',
  { options: { enabled: false } },
  async ($, on) => {
    on('command.register', () => ({ value: { command: 'topic' } }))
    on('session.start', (_, e) => ({ cwd: e.cwd }))

    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const status = await $.command.run({ command: 'topic', args: '' })
    expect(status.text).toMatch(/^Topic banner is off\./)

    await $.command.run({ command: 'topic', args: 'on' })
    const after = await $.command.run({ command: 'topic', args: '' })
    expect(after.text).toMatch(/^No topic yet/)
  },
)

test('color none draws plain text, not a padded bar', { options: { color: 'none' } }, async ($, on) => {
  on('command.register', () => ({ value: { command: 'topic' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 0 }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'topic', args: 'Plain' })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Plain/ }))?.text).toBe(' ▌ Plain [pinned]')
  await ui.unmount()
})

test('view: pane in the config opens the pane at start', { options: { view: 'pane' } }, async ($, on) => {
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'topic' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.now', () => ({ value: 0 }))
  on('clock.after', () => ({ value: undefined }))
  on('ui.open', (_, e) => {
    opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(opened).toEqual(['session-topic'])
  await $.command.run({ command: 'topic', args: 'Docked' })
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await band.find({ type: 'Text' }))?.text).toBe('engine')
  await band.unmount()

  await $.command.run({ command: 'topic', args: 'band' })
  const back = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await back.find({ type: 'Text', text: /Docked/ }))?.text).toMatch(/Docked/)
  await back.unmount()
})
