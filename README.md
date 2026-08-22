# pi-cc-header

Claude Code–style startup header for [Pi](https://pi.dev). Animated Pi logo, 9-color palette, IBM stripes, Minecraft gradient, and a configurable info bar.

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

## Commands

All flags under `/pch`:

| Flag | Description | Effect |
|------|-------------|--------|
| `/pch --tg` | Toggle enable/disable | Next session |
| `/pch --c [code]` | Color (c/a/r/o/y/g/w/b/p); no arg = show current | Immediate |
| `/pch --i` | Toggle IBM stripes | Immediate |
| `/pch --m` | Toggle Minecraft gradient | Immediate |
| `/pch --sp [ms]` | Speed (25/50/75/100); no arg = show current | Immediate |
| `/pch --v [all\|pi\|off]` | Version label color; no arg = cycle | Immediate |
| `/pch --ps` | Toggle pkg skills count | Immediate |
| `/pch --s [text\|-c\|-d]` | Slogan: set / toggle / color / delete | Immediate |
| `/pch --ml` | Toggle model/thinking line | Immediate |
| `/pch --df` | Reset to defaults | Immediate |
| `/pch --cl` | Clear all config (pre-uninstall) | Immediate |
| `/pch --h` | Help | — |

## Reset, disable, uninstall

- `/pch --df` — reset all settings to defaults. Does not preserve current config.
- `/pch --tg` — disable/re-enable. While disabled, all style commands are locked. Re-enabling takes effect next session.
- To uninstall cleanly: `/pch --cl` first, then `pi uninstall npm:pi-cc-header`.
