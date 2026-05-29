# Obsidian Checkers Hider

Obsidian Checkers Hider is an Obsidian plugin for hiding completed or custom-status checklist items while keeping the note content intact.

It started as a standalone continuation of the original Completed Task Display plugin, with support for custom checkbox markers, inverted matching, per-page overrides, and better Live Preview hiding through CodeMirror decorations.

## Features

- Toggle matching checklist items from the ribbon, command palette, or clickable status bar.
- Hide standard completed tasks like `[x]` and `[X]`.
- Configure custom checkbox markers such as `[-]`, `[/]`, `[?]`, or `[!]`.
- Choose whether the marker list means "hide these" or "keep these visible".
- Optionally hide indented sub-bullets and nested tasks under a hidden parent task in Source and Live Preview.
- Disable hiding for individual pages with inline or frontmatter tags.
- Works in Reading view and Live Preview/Source mode.

## Installation

### Manual Install

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Put the files in `<vault>/.obsidian/plugins/obsidian-checkers-hider/`.
3. Reload Obsidian.
4. Enable `Obsidian Checkers Hider` in Settings -> Community plugins.

### Development Install

```bash
npm install
npm run build
```

Then copy or symlink this repository into:

```text
<vault>/.obsidian/plugins/obsidian-checkers-hider/
```

## Usage

Use the ribbon icon, the `Toggle Checkers Hider` command, or the status bar control to switch hiding on and off globally.

The global toggle is saved between sessions.

## Settings

### Task Marker Mode

`Hide listed markers` hides only tasks whose checkbox marker is listed in `Task markers`.

Default:

```text
x, X
```

This hides:

```markdown
- [x] done
- [X] done
```

`Keep listed markers` is the inverted behavior. It keeps `[ ]` and the listed custom markers visible, then hides other non-empty task statuses.

For example, with markers:

```text
?, /
```

These stay visible:

```markdown
- [ ] open
- [?] question
- [/] in progress
```

Other non-empty statuses, including `[x]`, are hidden.

### Task Markers

Enter markers separated by commas or spaces:

```text
x, X, -, /
```

Do not include the brackets. Use `/`, not `[/]`.

### Hide Sub-Bullets

When enabled, Source mode and Live Preview also hide indented lines below a hidden task until the next blank line or same-level line.

Example:

```markdown
- [x] done
  - nested bullet
  - [ ] nested unchecked task
- [ ] independent task
```

With `Hide sub-bullets` on, the first three lines are hidden. With it off, only the completed parent task is hidden.

In Reading view, nested content is part of the rendered list item, so it follows the hidden parent task.

### Page Override Tags

Use `Page override tags` to show completed or matching tasks on specific pages even when global hiding is enabled.

Defaults:

```text
checkers-show-completed, ctd-show-completed
```

Inline tag:

```markdown
#checkers-show-completed
```

Frontmatter:

```yaml
---
tags:
  - checkers-show-completed
---
```

The override is evaluated per markdown view, so different tabs can show different behavior at the same time.

## Development

```bash
npm install
npm test
npm run build
```

Release files are:

- `main.js`
- `manifest.json`
- `styles.css`

## Credits

Based on [heliostatic/completed-task-display](https://github.com/heliostatic/completed-task-display) by Ben Lee-Cohen.

## License

MIT License. See [LICENSE](LICENSE).
