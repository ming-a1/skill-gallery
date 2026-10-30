# Skill Gallery

A DeepSeek Harness Web plugin that shows every installed skill as a card.

The sidebar gains a **技能 / Skills** icon that opens a card gallery. Each card
shows:

- the localized display name: frontmatter `metadata.displayName` first; when a
  skill has none, a cached SkillHub registry lookup may supply its Chinese
  `displayName` (only a CJK answer is accepted, and an offline registry falls
  back to the local name/slug); a trailing `.Skill` brand suffix is removed so
  every card title has the same shape;
- the English name plus slug as the secondary line, an `已装 / Installed` badge,
  and the version;
- one fixed card height (224 px), so a grid row never jumps between a short and
  a long description;
- a two-line description and file count, byte size, and update time, matching
  the numbers on disk;
- a footer with **详情 / Details** and **卸载 / Uninstall**;
- **详情 / Details** opens one frame-wide dialog (`shell.overlay`) with the
  title, slug, installed badge, version, the full description, chips
  for files / size / update date, and rows for the install path, the install
  source (SkillHub when `_meta.json` marks a marketplace install, otherwise the
  local root kind), the invocation mode (model / user), and the publisher: the
  registry owner name when available, else the frontmatter author; the numeric
  `ownerId` from `_meta.json` is never shown. The dialog closes on the X button, the backdrop, Escape, or the
  footer button, keeps keyboard focus inside, and restores focus to the card
  that opened it. Its Uninstall button opens a confirmation dialog naming the
  exact directory to delete; only after confirmation does the Host remove it,
  and the card list refreshes.

The page also has a search box, a refresh button, and light/dark styling driven
purely by `--dsw-alias-*` theme tokens.

## How it reads skills

`lib/skills.js` scans the filesystem skill roots in priority order, read-only:

| Source | Path |
|---|---|
| `user` | `$DSH_HOME/skills` (default `~/.dsh/skills`) |
| `agents` | `$DSH_AGENTS_HOME/skills` (default `~/.agents/skills`) |
| `project` | `<cwd>/.dsh/skills`, `<cwd>/.agents/skills` |
| `custom` | `$DSH_SKILL_GALLERY_DIRS` (path-delimiter separated) |

A skill is a directory bundle `<slug>/SKILL.md` or a flat `<slug>.md`, the same
discovery shape the filesystem skill provider uses. File count and byte size
are summed below the bundle; the newest file mtime becomes the update time.
`_meta.json` (written by SkillHub) supplies the slug, version, numeric owner id,
and publication time.

## Endpoints

Both endpoints are guarded by the Host's browser trust fence
(`connection.requestRejection`).

- `GET /skill-gallery/skills` returns the scanned skills as JSON. Skills without
  a CJK display name get one optional, cached `GET /api/v1/skills/<slug>` lookup
  against SkillHub (default `https://api.skillhub.cn`, override with
  `DSH_SKILLHUB_API`; set it empty to stay offline) so the card can show the
  registry's Chinese name.
- `POST /skill-gallery/uninstall` accepts `{ "id": "<source>:<slug>" }` and
  deletes exactly one currently scanned skill. The only removable target is the
  bundle directory or flat `<name>.md` file the scanner found; it must stay a
  direct child of its scanned root after resolving symlinks. A symlinked skill
  entry removes the link, never its target.

## Files

- `index.js` — Host half: the read-only JSON route.
- `lib/skills.js` — root resolution, discovery, frontmatter parsing, stats.
- `client.js` — Client half: the card page, sidebar icon, locale dictionaries.
- `locale/en.json`, `locale/zh.json` — plugin display metadata.
- `icon.svg` — gallery icon.
