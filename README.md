# session-topic

A Claude Code mod that keeps a two-line banner above the prompt saying what the session is about. With several sessions open it tells you which one you are looking at.

Line 1 is the overall subject, line 2 the current focus within it. After each prompt a small Haiku call reads your last few prompts and either leaves the banner alone or rewrites it, so it follows you when the subject changes. The call runs in the background and never holds up your prompt.

## Install

At the prompt of a terminal session:

```
/plugin install session-topic --marketplace alekc/claude-session-topic
```

From a shell:

```
claude plugin install session-topic --marketplace alekc/claude-session-topic
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `alekc/claude-session-topic`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope. Needs Claude Code 2.1.287 or later with mods enabled.

## Commands

```
/topic              show the banner and these commands
/topic on|off       turn the banner (and its Haiku calls) on or off for this session
/topic <title>      pin your own title; add "| detail" for line 2
/topic auto         unpin and let Haiku track the subject again
/topic refresh      unpin and re-derive it now from the recent prompts
/topic pane         show it in a pane instead (a sidebar in fullscreen)
/topic band         back to the band above the prompt
```

## Settings

Set at install, in `/config`, or with `/plugin configure session-topic@claude-session-topic`.

| Option | Default | What it does |
| --- | --- | --- |
| `enabled` | `true` | Whether the banner is on when a session starts. `/topic on` and `/topic off` override it for one session. |
| `view` | `band` | Where the topic shows when a session starts: `band` above the prompt, or `pane` (a sidebar in fullscreen). `/topic band` and `/topic pane` switch it for one session. |
| `color` | `orange` | `orange`, `blue`, `green`, `yellow`, `violet`, `teal` (taken from your theme), or `none` for plain bold and italic text. |
| `band_chars` | `80` | Approximate characters per line in the band. A line wider than the terminal is cut anyway. |
| `pane_chars` | `280` | Approximate characters for the focus text in the pane, which has room for a short paragraph. |

The lengths are targets for Haiku, not hard limits: text is cut a little past them.

## Notes

- Claude Code gives mods no slot at the top of the screen. The band above the prompt is the one fixed place a mod can draw, which is why the banner lives there.
- Cost: one low-effort Haiku completion per prompt, billed to the session's credentials. Slash commands and very short prompts are skipped, and nothing is called while the banner is off.
- The prompts it reads stay in your session: they go to the same API your session already uses, and the mod stores nothing on disk.

## Development

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## License

MIT
