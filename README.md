# Checkers Hider

Hide completed and custom-status checklist items in Obsidian without changing your notes.

Checkers Hider can hide regular completed tasks like `[x]`, custom checkbox markers like `[-]` or `[/]`, and matching tasks rendered by Reading view, Live Preview, Kanban, Canvas, Dataview task lists, and hover previews.

## Features

- Hide or show matching checklist items with a command, status bar icon, or optional ribbon button.
- Hide completed tasks by default: `[x]` and `[X]`.
- Configure custom task markers such as `-`, `/`, `?`, or `!`.
- Choose whether the marker list means "hide these markers" or "keep these markers visible".
- Optionally hide nested bullets under a hidden task.
- Optionally show all checkboxes while editing, while still hiding them in preview.
- Disable hiding on specific pages with an inline or frontmatter tag.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from a release.
2. Create this folder in your vault:

```text
<vault>/.obsidian/plugins/obsidian-checkers-hider/
```

3. Put the three files into that folder.
4. Reload Obsidian.
5. Enable `Checkers Hider` in Settings -> Community plugins.

## Usage

Use `Toggle Checkers Hider` from the command palette, the status bar checkbox icon, or the optional ribbon button.

The status bar icon is dark green when hiding is enabled and gray when it is disabled.

## Settings

`Task marker mode`

- `Hide listed markers`: hides only markers listed in `Task markers`.
- `Keep listed markers`: keeps `[ ]` and listed markers visible, then hides other non-empty task statuses.

`Task markers`

Markers are entered without brackets, separated by commas or spaces:

```text
x, X, -, /
```

`Hide sub-bullets`

Also hides indented bullets and nested tasks under a hidden task.

`Show all checkboxes in edit mode`

Keeps Source mode, Live Preview, and popover editing fully visible while preview modes still hide matching tasks.

`Page override tags`

Show matching tasks on specific pages even when hiding is globally enabled.

Default tags:

```text
checkers-show-completed, ctd-show-completed
```

You can use an inline tag:

```markdown
#checkers-show-completed
```

Or frontmatter:

```yaml
---
tags:
  - checkers-show-completed
---
```

## Credits

Based on [heliostatic/completed-task-display](https://github.com/heliostatic/completed-task-display) by Ben Lee-Cohen.

## License

MIT License. See [LICENSE](LICENSE).
