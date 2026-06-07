# config_v2

See [config v2 vision](../../research/2026-05-16-config-v2-vision.md) for the
full design rationale, planned field types, and storage model.

## Declaring config (plugin author)

```ts
import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { avatarField } from "@plugins/fields/plugins/avatar/plugins/config/core";
import { listField } from "@plugins/config_v2/plugins/fields/plugins/list/core";

export const myConfig = defineConfig("my-plugin", {
  fields: {
    enabled: boolField({ label: "Enabled", default: true }),
    name: textField({ label: "Display name" }),
    icon: avatarField({ label: "Icon" }),
    items: listField({
      label: "Items",
      itemFields: {
        title: textField({ label: "Title" }),
      },
    }),
  },
});
```

Each field carries its Zod schema, default value, and UI metadata. The
settings pane renders fields automatically — no manual registration. Available
field types live under `plugins/fields/plugins/`; see
[fields/CLAUDE.md](plugins/fields/CLAUDE.md) to add new ones.

## Reading config

**Web:** `useConfig(myConfig)` returns reactive values that update live.

**Server:** `getConfig(myConfig)` reads the current value from the in-memory
cache. `watchConfig(myConfig, cb)` notifies on changes.

## Three-layer config model

Config flows through three layers, each with a human-editable override mechanism:

```
Code (defineConfig)  →  git config/  →  ~/.singularity/config/
   defaults + schema      repo defaults     user config
```

### Layer 1: Code → git (build-time)

`./singularity build` generates `config/<plugin-tree>/<name>.origin.jsonc` from `defineConfig` defaults. First line: `// @hash <12-hex>` (content hash).

**Agent overrides:** Copy to `config/<plugin-tree>/<name>.jsonc`, edit values, keep the `// @hash` line from origin.

**Conflict detection:** When origin regenerates with a new hash, the `config-origins-in-sync` check fails on any `.jsonc` override referencing the old hash. Agent must review origin changes, update the override, and set `// @hash` to the new origin hash.

### Layer 2: git → user (build-time)

`./singularity build` propagates the resolved git config (override if present, else origin) to `~/.singularity/config/<plugin-tree>/<name>.origin.jsonc` with a hash of the source content. The server reads from this directory at startup without re-propagating.

**User overrides:** UI `setConfig` or manual edits create `~/.singularity/config/<plugin-tree>/<name>.jsonc` with the origin's content hash.

**Conflict detection:** When git config changes, the propagated origin hash updates. A stale user override hash triggers `console.warn` on server start. (UI notification not yet wired.)

### Hash chain

Each layer's override records the hash of its origin (`// @hash` on line 1). Two independent hashes at the user layer:
1. `// @hash` in git override → hash of git origin (tracks code changes)
2. `// @hash` in user override → hash of user origin (tracks git config changes, which includes both code and agent overrides)

### Override semantics

Overwrites are **full copies**, not deltas. `setConfig` writes `{ ...currentValues, [key]: newValue }` — always a complete document. `parseDocument` fills missing keys from defaults, so partial files degrade gracefully but the canonical write path always produces a full document.

### Conflict precedence: origin wins until reconciled

`effective(origin, overwrites)` normally returns the override when it exists. But when the override's `// @hash` is stale relative to its origin (a **conflict** — the origin moved underneath an override written against an older version), the **origin takes precedence** until the user manually reconciles. Reconciling = any of: edit a field (rewrites the override against the current origin), "Keep my values" / acknowledge-conflict (bumps the hash so the override wins again), or "Accept new defaults" / delete-override (drops the override entirely).

**Every config file on disk must carry a `// @hash` header.** It is the anchor conflict detection compares against; a file without one is corrupt, not a benign "untracked" override. This invariant is enforced loudly at both boundaries: `jsoncConfigProxy.read()` throws on a hashless file, and `setConfig` throws rather than fabricating a hashless override when no origin has been propagated (run `./singularity build` first). The hash chain therefore always exists — there is no "null hash wins" fallback.

Because the running app resolves to origin during a conflict, the settings editor binds to `conflictEntry.overrideValues` (the user's override document on disk), not to `useConfig` (the resolved value) — otherwise the user could neither see nor fix their pending override.

### Schema evolution

Adding a field to an existing config (including a `listField` item or `objectField` sub-field) must not break documents stored before the field existed. Two mechanisms guarantee this:

- **Default-backfill.** Every `FieldsRecord`→`z.object` composition (`buildFieldsSchema`, `listField`, `objectField`) wraps each field schema via `fieldSchemaWithDefault(field)` = `field.schema.default(field.defaultValue)`. A key missing from a stored document heals to that field's default — e.g. a preprompt stored before the `icon` avatarField was added reads back with the no-icon default rather than failing validation. The on-disk file self-heals on the next `setConfig` (canonical write is a full document).
- **Invalid surfacing, not silent fallback.** When the effective document still fails the schema after backfill (a genuine break — a field's type changed under stored data, a bad hand edit), `readTypedConfig` resolves to defaults *and logs a warning*, while `computeAllConflicts` emits a `configV2ConflictEntrySchema` with `kind: "invalid"` (carrying the zod `issues`). The settings detail surfaces this exactly like a hash conflict — a destructive banner with **Reset to defaults** (delete-override) and **View raw** — so disappearing data is never silent. Hash conflicts (`kind: "hash"`) take precedence when both apply. A missing document (no file on disk) is the legitimate defaults case, not an "invalid" one.

### Benefits

- `.origin.jsonc` always present → easy "revert to defaults" and diff display in settings UI
- Hash chain → deterministic conflict detection at each layer
- JSONC → human-readable, agent-editable, version-controllable

### Checks

`config-origins-in-sync` (single check, double duty):
1. Every `.origin.jsonc` in `config/` matches current `defineConfig` defaults
2. Every `.jsonc` override has a `// @hash` matching its current origin

### Internal architecture

- **`jsoncConfigProxy`** — synchronous read/write with `// @hash` header tracking. Used for propagation, `setConfig`, and `reloadValues`.
- **`ConfigWatcher`** (`config-watcher.ts`) — `@parcel/watcher`-based file-change detection on `~/.singularity/config/`. Debounce (100ms) + ceiling (1s) + reconcile (30s). Callbacks are `() => void` — the registry re-reads via `jsoncConfigProxy` on notification.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Reactive useConfig hook for reading typed JSONC config in the browser. Typed JSONC config handles for server plugins.
- Web:
  - Contributes: `Core.Boot`
  - Exports: Types: `ConfigRegistration`; Values: `ConfigV2`, `useConfig`, `useConfigRegistrations`, `useScopeForked`, `useSetConfig`
- Cross-plugin:
  - Imported by: `backup`, `build`, `categorical`, `chart`, `code-review`, `codegen`, `color-adjust`, `color-palette`, `commits`, `community-browser`, `config`, `conversation-category`, `conversations`, `cost`, `density`, `floating-bar`, `google`, `google-drive`, `google-fonts`, `launch-prompts`, `list`, `local`, `model-provider`, `notion`, `object`, `piano-keyboard`, `piano-roll`, `preprompts`, `prompt-templates`, `push-and-exit`, `secret`, `segmented-progress-bar`, `settings`, `setup-wizard`, `shadow`, `shape`, `sidebar-palette`, `theme`, `theme-customizer`, `theme-engine`, `turn-summary`, `typography`
- Core:
  - Exports: Types: `ConfigDescriptor`, `ConfigProxy`, `ConfigV2Conflicts`, `ConfigV2ScopeForked`, `ConfigV2Tiers`, `ConfigV2Values`, `ConfigValues`, `Disposable`, `FieldDef`, `FieldMeta`, `FieldsRecord`, `FieldType`, `InferFieldsObject`, `InferFieldValue`, `JsonValue`; Values: `buildFieldsSchema`, `codeConfigProxy`, `computeHash`, `configSnapshot`, `configV2ConflictEntrySchema`, `configV2ConflictsResource`, `configV2ConflictsSchema`, `configV2Resource`, `configV2ScopeForkedResource`, `configV2ScopeForkedSchema`, `configV2TiersResource`, `configV2TiersSchema`, `configV2ValuesSchema`, `defineConfig`, `defineFieldType`, `deleteScope`, `effective`, `fieldSchemaWithDefault`, `forkScope`, `getFieldResolver`, `hasConflict`, `pickMeta`, `propagate`, `readonlyProxy`, `readTypedConfig`, `registerFieldResolver`, `setConfigField`, `validationIssues`
- Server:
  - Exports: Types: `FieldStorageProvider`; Values: `acknowledgeConflictByPath`, `ConfigV2`, `deleteOverrideByPath`, `deleteScope`, `forkConfig`, `forkScope`, `getAllDescriptors`, `getConfig`, `getFieldStorageProvider`, `getRawFileContent`, `getScopedDescriptors`, `hasFieldStorageProvider`, `registerFieldStorageProvider`, `resetConfigByPath`, `setConfig`, `setConfigByPath`, `watchConfig`
- Sub-plugins:
  - **`fields`** — Field type registry. Sub-plugins contribute field types with core factories and web renderers.
    - Plugins:
      - **`list`** — Sortable list field type with stable UUID identity and fractional-index ordering.
      - **`object`** — Object field type: fixed-structure named sub-fields grouped into a single value.
      - **`secret`** — Secret field type: encrypted storage with set/not-set metadata. Secret field type: encrypted storage with set/not-set metadata. Central-side secret config reader for auth providers.
  - **`settings`** — Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields. HTTP endpoints for setting and resetting config_v2 field values.

<!-- AUTOGENERATED:END -->
