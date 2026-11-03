import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Topic } from '../types'

const MODEL = 'haiku'
const RECENT_MAX = 6
const PANE = 'session-topic'

const topic = atom({ plugin: 'session-topic', key: 'topic' } as const, null, {
  shape: 'topic-1',
})
const recent = atom({ plugin: 'session-topic', key: 'recent' } as const, [])
const enabled = atom({ plugin: 'session-topic', key: 'enabled' } as const, null)
const mode = atom({ plugin: 'session-topic', key: 'mode' } as const, null)

// Picker labels from plugin.json mapped to theme keys, so themes still apply.
const COLORS: Record<string, string | null> = {
  orange: 'claude',
  blue: 'suggestion',
  green: 'success',
  yellow: 'warning',
  violet: 'autoAccept',
  teal: 'planMode',
  none: null,
}

type View = 'band' | 'pane'

type Config = {
  isEnabled: boolean
  view: View
  color: string | null
  bandChars: number
  paneChars: number
}

// The one place options are read; values outside the manifest's bounds throw.
function parseConfig(options: PluginOptions): Config {
  const view = String(options.view ?? 'band')
  if (view !== 'band' && view !== 'pane') {
    throw new Error(`session-topic: unknown view ${view}`)
  }
  const color = String(options.color ?? 'orange')
  if (!(color in COLORS)) throw new Error(`session-topic: unknown color ${color}`)
  const num = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(options[key] ?? fallback)
    if (!Number.isFinite(n) || n < min || n > max) {
      throw new Error(`session-topic: ${key} must be ${min}..${max}, got ${n}`)
    }

    return Math.round(n)
  }

  return {
    isEnabled: options.enabled !== false,
    view,
    color: COLORS[color] ?? null,
    bandChars: num('band_chars', 80, 30, 200),
    paneChars: num('pane_chars', 280, 60, 1000),
  }
}

type Budget = { title: number; detail: number }

function budgetFor(cfg: Config, view: View): Budget {
  return view === 'pane'
    ? { title: Math.max(cfg.bandChars, 80), detail: cfg.paneChars }
    : { title: cfg.bandChars, detail: cfg.bandChars }
}

function systemPrompt(b: Budget, view: View): string {
  const room =
    view === 'pane'
      ? `a sidebar pane: line 1 at most ${b.title} characters; line 2 may be` +
        ` a short paragraph of up to ${b.detail} characters on one line`
      : `a narrow band: each line at most ${b.detail} characters`

  return [
    'You maintain a two-line banner that reminds a developer which subject a',
    'Claude Code session is about, so they can tell sessions apart at a glance.',
    'Line 1: the overall subject, a short title (e.g. "ESO Infisical provider:',
    'detached auth PR"). Line 2: the current focus within it.',
    `The banner is shown in ${room}.`,
    'Keep line 1 unless the subject has clearly changed; refresh line 2 when the',
    'focus within the subject moved. If nothing is worth changing, reply SAME.',
    'Otherwise reply with exactly two lines, plain text, no labels, no quotes,',
    'no markdown, no trailing period. Never answer the requests themselves.',
  ].join('\n')
}

// Limits are approximate: the model aims at them, the cut lands a bit past.
function clean(line: string, max: number): string {
  const text = line
    .replace(/^\s*(line\s*\d\s*[:.-]|\d[.)]|[-*>#]+)\s*/i, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.]$/, '')
    .trim()
  const hard = Math.round(max * 1.15)

  return text.length > hard ? `${text.slice(0, hard - 1)}…` : text
}

async function isOn($: EngineInterface, cfg: Config): Promise<boolean> {
  return (await read($, enabled)) ?? cfg.isEnabled
}

async function viewOf($: EngineInterface, cfg: Config): Promise<View> {
  return (await read($, mode)) ?? cfg.view
}

// One refresh at a time; a prompt arriving mid-call reruns it once after.
let isRunning = false
let isDirty = false
let isPending = false
let isRewrite = false

async function refresh(
  $: EngineInterface,
  cfg: Config,
  rewrite = false,
): Promise<void> {
  isRewrite ||= rewrite
  if (isRunning) {
    isDirty = true

    return
  }
  isRunning = true
  try {
    do {
      isDirty = false
      isPending = false
      const force = isRewrite
      isRewrite = false
      await refreshOnce($, cfg, force)
    } while (isDirty)
  } finally {
    isRunning = false
  }
}

async function refreshOnce(
  $: EngineInterface,
  cfg: Config,
  force: boolean,
): Promise<void> {
  if (!(await isOn($, cfg))) return
  const current = await read($, topic)
  if (current?.isPinned) return
  const prompts = await read($, recent)
  if (prompts.length === 0) return

  const view = await viewOf($, cfg)
  const b = budgetFor(cfg, view)
  const banner = current
    ? `Current banner:\n${current.title}\n${current.detail}` +
      (force ? '\n(The space changed: rewrite it to fit; do not reply SAME.)' : '')
    : 'Current banner: (none yet, so you must reply with two lines)'
  const history = prompts
    .map((p, i) => `[${i === prompts.length - 1 ? 'newest' : i + 1}] ${p}`)
    .join('\n\n')
  const r = await $.model.complete({
    model: MODEL,
    system: systemPrompt(b, view),
    prompt: `${banner}\n\nThe developer's recent requests, oldest first:\n${history}`,
    maxTokens: Math.min(1024, 80 + Math.ceil((b.title + b.detail) / 2)),
    effort: 'low',
    timeoutMs: 20_000,
  })
  if (!r.isAnswered) return

  const reply = r.text.trim()
  if (/^same\b/i.test(reply) && current) return
  const lines = reply.split('\n').map(l => l.trim()).filter(Boolean)
  const title = clean(lines[0] ?? '', b.title)
  if (!title) return
  const detail = clean(lines.slice(1).join(' '), b.detail)
  const now = await $.clock.now()

  await update($, topic, prev =>
    prev?.isPinned ? prev : { title, detail, isPinned: false, updatedAt: now },
  )
}

async function openPane($: EngineInterface, cfg: Config) {
  return $.ui.open({
    id: PANE,
    title: 'Topic',
    rows: Math.min(12, 2 + Math.ceil(cfg.paneChars / 60)),
    columns: 36,
  })
}

export const register: Register = (on, options) => {
  const cfg = parseConfig(options)

  const HELP = [
    '/topic              show the banner and these commands',
    '/topic on|off       turn the banner (and its Haiku calls) on or off',
    '/topic <title>      pin your own title (optional "| detail" for line 2)',
    '/topic auto         unpin and let Haiku track the subject again',
    '/topic refresh      unpin and re-derive it now from the recent prompts',
    '/topic pane         show it in a pane (a sidebar in fullscreen)',
    '/topic band         back to the band above the prompt',
  ].join('\n')

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'topic',
      description: 'Turn on/off, set, pin, refresh or move the session topic banner',
    })
    if (cfg.view === 'pane' && (await isOn($, cfg))) await openPane($, cfg)

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    const text = e.text.trim()
    if (!e.command && !e.isMeta && text.length >= 4) {
      const snippet = text.length > 600 ? `${text.slice(0, 600)}…` : text
      await update($, recent, list => [...list, snippet].slice(-RECENT_MAX))
      if (await isOn($, cfg)) {
        isPending = true
        // Off the dispatch, so the prompt is never held up by the Haiku call.
        $.clock.after(0, () => void refresh($, cfg))
      }
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (isPending) await refresh($, cfg)

    return next(e)
  })

  on('command.run', { command: 'topic' }, async ($, e) => {
    const args = e.args.trim()
    const word = args.toLowerCase()

    if (word === '' || word === 'help') {
      const t = await read($, topic)
      const state = !(await isOn($, cfg))
        ? 'Topic banner is off.'
        : t
          ? `${t.title}\n${t.detail}\n(${t.isPinned ? 'pinned by you' : 'auto'})`
          : 'No topic yet: it appears after your next prompt.'

      return { text: `${state}\n\n${HELP}` }
    }
    if (word === 'on' || word === 'show') {
      await update($, enabled, () => true)
      if ((await viewOf($, cfg)) === 'pane') await openPane($, cfg)
      if (!(await read($, topic))) await refresh($, cfg)

      return { text: 'Topic banner on.' }
    }
    if (word === 'off' || word === 'hide') {
      await update($, enabled, () => false)
      await $.ui.close({ id: PANE })

      return { text: 'Topic banner off: no band, no pane, no Haiku calls.' }
    }
    if (word === 'auto') {
      await update($, topic, t => (t ? { ...t, isPinned: false } : t))
      $.clock.after(0, () => void refresh($, cfg))

      return { text: 'Topic is automatic again.' }
    }
    if (word === 'refresh') {
      await update($, topic, t => (t ? { ...t, isPinned: false } : t))
      await refresh($, cfg, true)
      const t = await read($, topic)

      return { text: t ? `${t.title}\n${t.detail}` : 'Nothing to derive yet.' }
    }
    if (word === 'pane' || word === 'band') {
      const was = await viewOf($, cfg)
      await update($, mode, () => word)
      await update($, enabled, () => true)
      if (word === 'pane') await openPane($, cfg)
      else await $.ui.close({ id: PANE })
      // A different space wants a different length: rewrite unless pinned.
      if (was !== word) $.clock.after(0, () => void refresh($, cfg, true))

      return {
        text:
          word === 'pane'
            ? 'Topic pane opened; the band is off while it is up.'
            : 'Topic is back in the band above the prompt.',
      }
    }

    const [title, ...rest] = args.split('|')
    const view = await viewOf($, cfg)
    const b = budgetFor(cfg, view)
    const pinned: Topic = {
      title: clean(title ?? '', b.title),
      detail: clean(rest.join('|'), b.detail),
      isPinned: true,
      updatedAt: await $.clock.now(),
    }
    await update($, topic, () => pinned)
    await update($, enabled, () => true)

    return { text: `Pinned: ${pinned.title}` }
  })

  // Closing the pane by hand (Esc, its mark) brings the band back.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin.kind === 'person') {
      await update($, mode, () => 'band')
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const t = await read($, topic)
    if (!t) {
      return <Text dimColor>No topic yet: send a prompt, or /topic &lt;title&gt;.</Text>
    }
    const color = cfg.color ?? undefined

    return (
      <Box flexDirection="column">
        <Text color={color} weight="bold">
          {t.title}
          {t.isPinned ? ' [pinned]' : ''}
        </Text>
        <Text color={color} italic>
          {t.detail}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || e.props.view.agentId) return next(e)
    if (!(await isOn($, cfg)) || (await viewOf($, cfg)) === 'pane') return next(e)
    const t = await read($, topic)
    if (!t) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const cols = Math.max(20, e.props.bodyColumns)
    const head = ` ▌ ${t.title}${t.isPinned ? ' [pinned]' : ''}`
    const body = `   ${t.detail || ' '}`

    return (
      <Box flexDirection="column">
        {cfg.color ? (
          <Text
            backgroundColor={cfg.color}
            color="inverseText"
            weight="bold"
            wrap="truncate-end"
          >
            {head.padEnd(cols)}
          </Text>
        ) : (
          <Text weight="bold" wrap="truncate-end">
            {head}
          </Text>
        )}
        <Text color={cfg.color ?? undefined} italic wrap="truncate-end">
          {body}
        </Text>
      </Box>
    )
  })
}
