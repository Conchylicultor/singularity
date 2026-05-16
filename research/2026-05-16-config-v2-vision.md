# Config v2 — Vision

## Motivation

The current config system stores values in the database. Config v2 moves to human-readable JSONC files on disk, making config editable by both the UI and text editors/agents, with a clean abstraction layer that can be swapped to cloud storage later.

## Use cases

1. **Basic primitives** — boolean, string, number, enum. (e.g. "auto-build on push")
2. **Structured data** — Zod-typed objects. (e.g. shadow presets with color/opacity/blur/spread/offset fields)
3. **Collections** — Sorted lists of structured items, each with stable identity. (e.g. conversation categories, review file sections, prompt templates)
4. **UI ordering** — Each reorderable slot implicitly backs its rank state as config, so order is persisted, editable, and resettable.
5. **Theme tokens** — Color palettes, typography, shadows, shape — all expressible as config fields.

## API

### defineConfig

Each plugin declares its config with typed field helpers:

```ts
const config = defineConfig({
  fields: {
    autoBuild: boolField({
      default: true,
      label: "Auto-build on push",
      description: "Automatically run ./singularity build when a push to main is detected.",
    }),

    reviewSections: listField({
      label: "Review sections",
      itemLabel: "Section",
      fields: {
        icon: avatarField(),
        name: textField({ label: "Name" }),
        paths: listField({
          label: "File patterns",
          fields: {
            pattern: textField({ placeholder: "src/**/*.ts" }),
          },
        }),
      },
    }),
  },
});
```

**Field types** — each field carries its Zod schema, default value, and UI renderer:

- `boolField` — toggle switch
- `textField` — single-line input
- `multiLineTextField` — textarea, optionally with attachments
- `numberField` — numeric input with optional min/max/step
- `enumField` — dropdown or radio group from a fixed set
- `avatarField` — icon + color picker
- `colorField` — color picker
- `listField` — sorted list of sub-items; nested `fields` define each item's shape
- `objectField` — grouped sub-fields rendered as a section
- `jsonField` — raw JSON editor for advanced/escape-hatch use

### useConfig

On the web side, `useConfig` returns reactive values that update live:

```ts
const { autoBuild, reviewSections } = useConfig(config);
```

On the server side, `config.get("autoBuild")` reads the current value synchronously from the in-memory cache.

## Storage

### File layout

```
~/.singularity/config/
  <plugin-tree>/
    <config-name>.jsonc          # user's config (editable)
  .applied/
    <plugin-tree>/
      <config-name>.jsonc        # shadow: last-applied repo defaults (auto-managed, hidden)
```

Each `defineConfig` maps to a single file. The path mirrors the plugin hierarchy: `config/conversations/conversation-category/categories.jsonc`.

### Storage abstraction

The config ↔ disk layer is a self-contained interface:

```ts
interface ConfigStore {
  read(path: string): Promise<JsonValue | undefined>
  write(path: string, value: JsonValue): Promise<void>
  watch(path: string, cb: (value: JsonValue) => void): Disposable
  list(): Promise<string[]>
}
```

The first implementation is JSONC-on-disk. The interface is the seam for future backends (cloud sync, multi-user).

### Reactivity

A `@parcel/watcher` instance on `~/.singularity/config/` detects changes from any source (UI, text editor, agent). Changes emit through the existing live-state/notifications system so `useConfig` hooks re-render instantly.

## Default configs

### Repo defaults

Default config values are committed in a top-level `config/` folder in the repo, mirroring the `~/.singularity/config/` structure:

```
config/
  conversations/
    conversation-category/
      categories.jsonc
  build/
    settings.jsonc
```

These files are the "blessed defaults" — they document every config field with comments and provide the starting values. Agents can edit them before pushing to customize defaults for the project.

### Build-time generation

During `./singularity build`, configs are collected from all `defineConfig` declarations:

- **New config** (no file exists in `config/`) — generated with defaults and field descriptions as comments.
- **Existing config** — a shadow `.generated.jsonc` (gitignored) is written alongside. The build diffs it against the committed file:
  - New fields → appended with defaults and a `// NEW` marker.
  - Removed fields → flagged as warning in build output.
  - No silent overwrites of agent edits.
- A `config-in-sync` check fails if uncommitted schema drift exists, forcing explicit reconciliation.

### Server-start merge (three-way)

When the server starts, repo defaults are merged into the user's `~/.singularity/config/` using a three-way strategy:

| User value | Old applied default | New repo default | Result |
|---|---|---|---|
| == old default | — | changed | **Update** to new default (user never customized) |
| != old default | — | changed | **Keep** user value (intentional customization) |
| — | — | new field | **Set** to new default |
| exists | — | field removed | **Keep** in file (no data loss), log warning |

After merge, the new repo defaults are written to `.applied/` as the shadow for next time.

## Collection identity

Every item in a `listField` automatically gets a stable `id: string` (UUID, assigned on creation). This ensures reordering, editing, and cross-referencing don't break when items move. The `id` is part of the persisted JSONC but hidden from the UI editor.

## Validation & graceful degradation

When reading config from disk:

- Valid JSONC, valid schema → use as-is.
- Valid JSONC, schema violation on some fields → use defaults for invalid fields, keep valid ones, surface warning toast.
- Invalid JSONC (parse error) → fall back to full defaults, surface error toast.

Never crash on bad config.

## Reset to defaults

The UI offers per-field and per-config-block reset. Resetting a field deletes it from the user's JSONC file — the three-way merge sees it as "not customized" and applies the repo default on next start. Instant reset (no restart needed) by falling through to the in-memory default.

## Auto-registration in UI

`defineConfig` produces a contribution that the settings pane discovers automatically. Each field type carries its own React renderer. The settings pane walks all registered configs, grouped by plugin hierarchy, and calls `field.render()` for each. No manual registration step.

For documentation, the build step that generates `config/` files also updates `plugins-details.md` with each plugin's config fields — same pattern as slots and contributions.

## Import / export

Since config is a directory of JSONC files, backup/restore is `cp -r`. The backup plugin treats `~/.singularity/config/` as another backup source alongside DB and secrets.

## Migration from current system

A one-time migration reads all existing DB config rows, writes them as JSONC files to `~/.singularity/config/`, and drops the config table. This runs automatically on first server start after the cutover. Plugins update their `defineConfig` calls from the old DB-backed API to the new field-based API.
