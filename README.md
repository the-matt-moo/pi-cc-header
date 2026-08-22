# pi-cc-header

Claude Code–style startup header for [Pi](https://pi.dev). Animated Pi logo, 9-color palette, IBM stripes, Minecraft gradient, and a configurable info bar.

> **Fork:** `the-matt-moo/pi-cc-header` (fork of `eriiic7z/pi-cc-header`).
> This fork adds custom ASCII logos, random quote slogans, and an independent slogan color. See [Differences from upstream](#differences-from-upstream).

## Install

```bash
pi install npm:pi-cc-header
```

Takes effect on next session or `/reload`.

If your Pi config is read-only (NixOS, declarative setup), set:

```json
{ "ccHeader": { "readOnlyConfig": true } }
```

Visual changes still apply per-session but won't be persisted.

## Features

- 14-frame Pi logo animation, speed 25/50/75/100 ms
- 9-color palette: Anthropic orange, Clawd red, and more
- IBM-style horizontal stripes
- Minecraft-style pixel theme with 4-level 24-bit gradient
- Info bar: version, model, thinking level, skills, prompts, extensions, cwd, AGENTS.md marker
- Customizable slogan
- **Custom ASCII logo** (replace the final animation frame)
- **Random quote slogan** (`"quote"` + centered author, auto-rotated each startup)
- **Independent slogan color** (separate from the logo/header color)

## Commands

All flags under `/pch`:

| Flag | Description | Effect |
|------|-------------|--------|
| `/pch --tg` | Toggle header enable/disable | Next session |
| `/pch --c [code]` | Logo/header color (`c/a/r/o/y/g/w/b/p`); no arg = show current | Immediate |
| `/pch --i` | Toggle IBM stripes | Immediate |
| `/pch --m` | Toggle Minecraft gradient | Immediate |
| `/pch --sp [ms]` | Speed (`25/50/75/100`); no arg = show current | Immediate |
| `/pch --v [all\|pi\|off]` | Version label color; no arg = cycle | Immediate |
| `/pch --ps` | Toggle pkg skills count | Immediate |
| `/pch --s [text]` | Set slogan to literal text | Immediate |
| `/pch --s` | Toggle slogan on/off | Immediate |
| `/pch --s -c [code]` | Slogan color (same codes as `--c`); no code = toggle on/off | Immediate |
| `/pch --s -d` | Delete slogan | Immediate |
| `/pch --s -quote` | Pick a random quote as slogan; enables startup auto-rotation | Immediate |
| `/pch --logo <l1\|l2\|...>` | Set custom ASCII logo lines (pipe-separated) | Immediate |
| `/pch --logo -d` | Restore built-in Pi logo | Immediate |
| `/pch --ml` | Toggle model/thinking line | Immediate |
| `/pch --df` | Reset to defaults | Immediate |
| `/pch --cl` | Clear all config (pre-uninstall) | Immediate |
| `/pch --h` | Help | — |

### Slogan color

Slogan color is independent of the logo color and persisted as `ccHeader.sloganColorCode`.

```bash
/pch --s -c g        # green slogan text
/pch --s -c          # toggle slogan color on/off
```

The quote author name always matches the current slogan color.

### Quotes

`/pch --s -quote` sets a random quote as the slogan in `"quote"` + author format. It also persists a `quoteMode` flag: while enabled, a **new random quote is chosen on every startup**.

Quotes are loaded from a `quotes.json` file. The package ships a default set of 70 quotes; you can override it by placing your own `quotes.json` in your project root (mirroring the array-of-objects shape below):

```json
[
  { "quote": "You have power over your mind - not outside events. Realize this, and you will find strength.", "author": "Marcus Aurelius" }
]
```

Quotes over 10 words are split as evenly as possible across up to 2 lines, preferring a break at punctuation (`. , : ; -`). The author name sits centered beneath, in the slogan color.

### Custom ASCII logo

`/pch --logo` replaces the final animation frame with your own text/art (pipe-separated lines become rows). Lines may carry their own ANSI color.

```bash
/pch --logo  ████ | ▓▓▓▓ | ░░░░      # 3-line custom logo
/pch --logo -d                       # restore built-in Pi logo
```

## Reset, disable, uninstall

- `/pch --df` — reset all settings to defaults. Does not preserve current config.
- `/pch --tg` — disable/re-enable. While disabled, all style commands are locked. Re-enabling takes effect next session.
- To uninstall cleanly: `/pch --cl` first, then `pi uninstall npm:pi-cc-header`.

## Differences from upstream

This fork (`the-matt-moo/pi-cc-header`) builds on `eriiic7z/pi-cc-header`. Fork-specific additions:

| Feature | Description | Command |
|---------|-------------|---------|
| Custom ASCII logo | Substitute final animation frame with your own art/text | `/pch --logo` |
| Random quote slogan | `"quote"` + centered author; auto-rotates each startup | `/pch --s -quote` |
| Independent slogan color | Slogan (and its author) colored separately from the logo | `/pch --s -c <code>` |
| `quotes.json` corpus | 67 default quotes, overridable per-project | — |

Scope notes:

- `readOnlyConfig` mode and the read-only write guards are inherited from upstream (not fork additions).
- The fork ships a smaller, English-only README and no built-in asset images (logo art is code-generated).
- The core animation, palette, stripes, Minecraft gradient, and info-bar fields are unchanged from upstream.