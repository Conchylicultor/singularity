# config_v2

See [config v2 vision](../../research/2026-05-16-config-v2-vision.md) for the
full design rationale, planned field types, and storage model.

## Declaring config (plugin author)

```ts
import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { avatarField } from "@plugins/fields/plugins/avatar/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";

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

### App scopes: per-app config in git

A descriptor's config can be customized **per app** straight from version control — no code declares scopes; you commit a JSONC file at an `@app/<id>` path and `./singularity build` does the rest. An app at `http://<wt>.localhost:9000` whose id is `<id>` then resolves the scoped values; every other app keeps the base value.

**To customize app `<id>` for the descriptor at `<plugin-tree>` (config name `<name>`, usually `config`):**

1. Create `config/<plugin-tree>/@app/<id>/<name>.jsonc`.
2. Put **only the fields that differ** for that app, e.g. `{ "captureUrlByDefault": false }` (a partial delta — schema default-backfill fills the rest).
3. Line 1: `// @hash <hash>` copied from the **base** origin `config/<plugin-tree>/<name>.origin.jsonc`. A scoped override anchors to the base origin — **no scoped origin is ever committed**.
4. `./singularity build`. Propagation resolves the scope as `baseEffective ⊕ scopedDelta` and writes it to `~/.singularity/config/<wt>/<plugin-tree>/@app/<id>/<name>.origin.jsonc`.
5. `./singularity check config-origins-in-sync` validates the `@hash` against the base origin and the document against the schema.

This is the base-override workflow (Layer 1) one path segment deeper. Any registered descriptor can be git-scoped — it does **not** need `scope: "app"` (that marker only governs the theme "Customize for app" fork-all-descriptors UX).

**Reading a scoped value (consumer):** thread the app scope yourself — `config_v2` is app-agnostic. `useConfig(cfg, { scopeId: appId ? \`app:${appId}\` : undefined })` with `appId = useCurrentAppId()`. Committed scopes are pre-hydrated in the boot snapshot, so the scoped value paints on the first frame (no flash). On the server, `getConfig(cfg, "app:<id>")`.

**Semantics:** a committed scope is a frozen snapshot of `baseEffective ⊕ delta` (recomputed each build), so its non-overridden fields track the git base as of the last build — not a runtime base edit — consistent with every `forkScope` snapshot. A runtime user fork (theme "Customize for app") layers on top; un-customizing drops the runtime override and falls back to the committed scope, not to global.

**Per-app scopes in settings:** the config detail pane is scope-aware. A scope tab bar at the top offers a **Base** tab plus one tab per app the descriptor is customized for (read live from `configV2ScopesResource`), each resolving its label + icon from `Apps.App.useContributions()` and carrying a warning **conflict dot** when that scope has a stale override. Selecting a tab re-keys every read (values, tiers, conflicts) and every write (`set-field`, `reset-field`, `acknowledge`/`merge`/`delete-override`, raw file) to that `scopeId`, so fields, tiers, the conflict banner, and "Reset all" all act on the selected scope. The **`+` App** button forks a brand-new per-descriptor customization (`fork-descriptor-scope`) for any app not yet customized, then selects it. On a non-Base tab a **Stop customizing** action (`remove-descriptor-scope`) drops the descriptor's whole per-app customization — distinct from "Reset all", which only reverts edits to the scoped origin — and falls back to Base via the live scopes resource.

### Hash chain

Each layer's override records the hash of its origin (`// @hash` on line 1). Two independent hashes at the user layer:
1. `// @hash` in git override → hash of git origin (tracks code changes)
2. `// @hash` in user override → hash of user origin (tracks git config changes, which includes both code and agent overrides)

### Override semantics

Overwrites are **full copies**, not deltas. `setConfig` writes `{ ...currentValues, [key]: newValue }` — always a complete document. `parseDocument` fills missing keys from defaults, so partial files degrade gracefully but the canonical write path always produces a full document.

### Conflict precedence: origin wins until reconciled

`effective(origin, overwrites)` normally returns the override when it exists. But when the override's `// @hash` is stale relative to its origin (a **conflict** — the origin moved underneath an override written against an older version), the **origin takes precedence** until the user manually reconciles. Reconciling = any of: edit a field (rewrites the override against the current origin), "Keep my values" / acknowledge-conflict (bumps the hash so the override wins again), "Accept new defaults" / delete-override (drops the override entirely), or **"Merge"** / merge-conflict (three-way merge — see below).

### Three-way merge (ancestor snapshot)

"Keep my values" and "Accept new defaults" are all-or-nothing — they discard one side wholesale. The **Merge** resolver reconciles per field: a field only the user changed keeps the user's value, a field only the upstream changed takes the new default, and a field **both** changed differently is a true conflict left for manual resolution.

A real three-way merge needs the **base** — the origin the override was written against. Only its hash lives in the `// @hash` header, and the user-layer origin (`~/.singularity/config/`) is propagated by build, not versioned, so the old content is otherwise unrecoverable. So `propagate()` **snapshots the base at the conflict transition**: when it is about to overwrite a user origin that an *in-sync* override depends on (`oldOrigin.hash === override.hash && override.hash !== newHash`), it first writes the old origin content to a sibling `<name>.ancestor.jsonc`. The predicate is idempotent — once the override is stale, `oldOrigin.hash !== override.hash`, so repeated builds never clobber the true base — and `propagateConfigToUser` deletes any orphaned ancestor on a no-conflict build.

`threeWayMerge(base, ours, theirs)` (pure, in `tier-logic.ts`) returns the merged document plus the list of truly-conflicting keys. `computeAllConflicts` reads the ancestor when present and attaches `trueConflictKeys` to the `kind: "hash"` conflict entry; its presence is what makes the settings UI offer **Merge** and flag only those fields (legacy conflicts with no ancestor fall back to the binary Keep/Accept). `mergeConflictByPath` writes the merged document: with no true conflict it bumps the hash and deletes the ancestor (fully resolved); otherwise it keeps the stale hash so the conflict stays surfaced — re-running Merge after the user resolves the remaining fields is idempotent and finalizes it. The ancestor is also deleted by acknowledge-conflict and delete-override (every terminal resolution).

**Every config file on disk must carry a `// @hash` header.** It is the anchor conflict detection compares against; a file without one is corrupt, not a benign "untracked" override. This invariant is enforced loudly at both boundaries: `jsoncConfigProxy.read()` throws on a hashless file, and `setConfig` throws rather than fabricating a hashless override when no origin has been propagated (run `./singularity build` first). The hash chain therefore always exists — there is no "null hash wins" fallback.

Because the running app resolves to origin during a conflict, the settings editor binds to `conflictEntry.overrideValues` (the user's override document on disk), not to `useConfig` (the resolved value) — otherwise the user could neither see nor fix their pending override.

### Schema evolution

Adding a field to an existing config (including a `listField` item or `objectField` sub-field) must not break documents stored before the field existed. Two mechanisms guarantee this:

- **Default-backfill.** Every `FieldsRecord`→`z.object` composition (`buildFieldsSchema`, `listField`, `objectField`) wraps each field schema via `fieldSchemaWithDefault(field)` = `field.schema.default(field.defaultValue)`. A key missing from a stored document heals to that field's default — e.g. a preprompt stored before the `icon` avatarField was added reads back with the no-icon default rather than failing validation. The on-disk file self-heals on the next `setConfig` (canonical write is a full document).
- **Invalid surfacing, not silent fallback.** When the effective document still fails the schema after backfill (a genuine break — a field's type changed under stored data, a bad hand edit), `readTypedConfig` resolves to defaults *and logs a warning*, while `computeAllConflicts` emits a `configV2ConflictEntrySchema` with `kind: "invalid"` carrying structured `issues` (each a `{ path: (string|number)[]; message }` — see `configV2ValidationIssueSchema`). The settings detail surfaces this with a destructive banner that, per issue, names the dotted path, the message, and the **offending value drilled from `overrideValues`**, plus **View diff** (stored-invalid vs defaults), **View raw** (all layers, User → Git → Origin), and **Reset to defaults** (delete-override) — so disappearing data is never silent and the bad field is pinpointed. Hash conflicts (`kind: "hash"`) take precedence when both apply. A missing document (no file on disk) is the legitimate defaults case, not an "invalid" one.

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
  - Slots: `ConfigV2.WebRegister`
  - Contributes: `Core.Boot`
  - Uses: `infra/endpoints.fetchEndpoint`, `infra/endpoints.useEndpointMutation`, `primitives/live-state.hydrateResource`, `primitives/live-state.useResource`
  - Exports: Types: `ConfigRegistration`; Values: `ConfigV2`, `useConfig`, `useConfigRegistrations`, `useScopeForked`, `useSetConfig`
- Cross-plugin:
  - Slot contributors: `backup`, `build`, `categorical`, `chart`, `code-review`, `color-adjust`, `color-palette`, `commits`, `conversation-category`, `conversations`, `cost`, `density`, `floating-bar`, `folders`, `font-family`, `fx-comets`, `fx-core`, `fx-ripples`, `fx-shatter`, `google`, `google-drive`, `keyboard`, `launch-prompts`, `local`, `model-provider`, `notion`, `piano-keyboard`, `piano-roll`, `preprompts`, `prompt-templates`, `push-and-exit`, `segmented-progress-bar`, `shadow`, `shape`, `sidebar-palette`, `slow-ops`, `task-draft-form`, `theme-engine`, `turn-summary`, `type-scale`
  - Imported by: `apps/sonata/piano-keyboard`, `apps/sonata/piano-roll`, `apps/sonata/piano-roll/fx-comets`, `apps/sonata/piano-roll/fx-core`, `apps/sonata/piano-roll/fx-ripples`, `apps/sonata/piano-roll/fx-shatter`, `apps/sonata/primitives/keyboard`, `apps/sonata/sources/midi/folders`, `auth/google`, `auth/google/setup-wizard`, `auth/notion`, `backup`, `backup/google-drive`, `backup/local`, `build`, `config_v2/config-link`, `config_v2/settings`, `conversations`, `conversations/conversation-category`, `conversations/conversation-view/launch-prompts`, `conversations/conversation-view/prompt-templates`, `conversations/conversation-view/push-and-exit`, `conversations/conversation-view/turn-summary`, `conversations/model-provider`, `conversations/preprompts`, `fields/avatar/config`, `fields/bool/config`, `fields/color/config`, `fields/directory-path/config`, `fields/dynamic-enum/config`, `fields/enum/config`, `fields/float/config`, `fields/int/config`, `fields/list/config`, `fields/multiline-text/config`, `fields/object/config`, `fields/reorder-tree/config`, `fields/secret/config`, `fields/text/config`, `framework/tooling/codegen`, `reorder`, `review/code-review`, `shell/floating-bar`, `slow-ops`, `stats/commits`, `stats/cost`, `tasks/task-draft-form`, `ui/segmented-progress-bar`, `ui/theme-engine`, `ui/theme-engine/theme-customizer`, `ui/theme-toggle`, `ui/tokens/categorical`, `ui/tokens/chart`, `ui/tokens/color-adjust`, `ui/tokens/color-palette`, `ui/tokens/density`, `ui/tokens/font-family`, `ui/tokens/font-family/google-fonts`, `ui/tokens/shadow`, `ui/tokens/shape`, `ui/tokens/sidebar-palette`, `ui/tokens/type-scale`, `ui/tweakcn/community-browser`, `ui/variant-region`
- Server:
  - Uses: `infra/file-watcher.createFileWatcher`, `infra/file-watcher.FileWatcher`, `infra/paths.MAIN_WORKTREE_NAME`, `infra/paths.REPO_ROOT`, `infra/paths.SINGULARITY_DIR`
  - Exports: Types: `FieldStorageProvider`; Values: `acknowledgeConflictByPath`, `ConfigV2`, `deleteOverrideByPath`, `deleteScope`, `forkConfig`, `forkDescriptorScope`, `forkScope`, `getAllDescriptors`, `getConfig`, `getFieldStorageProvider`, `getRawFileContent`, `getScopedDescriptors`, `hasFieldStorageProvider`, `mergeConflictByPath`, `registerFieldStorageProvider`, `removeDescriptorScope`, `resetConfigByPath`, `setConfig`, `setConfigByPath`, `watchConfig`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`, `primitives/live-state.resourceDescriptor`
  - Exports: Types: `ConfigDescriptor`, `ConfigProxy`, `ConfigV2ConflictPaths`, `ConfigV2Conflicts`, `ConfigV2ScopeForked`, `ConfigV2Scopes`, `ConfigV2Tiers`, `ConfigV2ValidationIssue`, `ConfigV2Values`, `ConfigValues`, `Disposable`, `FieldDef`, `FieldMeta`, `FieldsRecord`, `InferFieldsObject`, `InferFieldValue`, `JsonValue`; Values: `APP_SCOPE_DIR`, `appScopeId`, `buildFieldsSchema`, `codeConfigProxy`, `computeHash`, `configSnapshot`, `configV2ConflictEntrySchema`, `configV2ConflictPathsResource`, `configV2ConflictPathsSchema`, `configV2ConflictsResource`, `configV2ConflictsSchema`, `configV2Resource`, `configV2ScopeForkedResource`, `configV2ScopeForkedSchema`, `configV2ScopesResource`, `configV2ScopesSchema`, `configV2TiersResource`, `configV2TiersSchema`, `configV2ValidationIssueSchema`, `configV2ValuesSchema`, `defineConfig`, `deleteScope`, `effective`, `fieldSchemaWithDefault`, `forkDescriptorScope`, `forkScope`, `getFieldResolver`, `hasConflict`, `pickMeta`, `propagate`, `readonlyProxy`, `readTypedConfig`, `registerFieldResolver`, `removeDescriptorScope`, `scopeAppId`, `setConfigField`, `stringifyConfigValue`, `threeWayMerge`, `validationIssues`
- Sub-plugins:
  - **`config-link`** — Deep-link affordances from any config-backed surface to its settings section. useOpenConfig() navigates to a descriptor's config pane; ConfigGearButton and ConfigPopoverHeader surface it as a gear.
  - **`fields`** — Field type registry. Sub-plugins contribute field types with core factories and web renderers.
  - **`settings`** — Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields. Surfaced inside the Settings app. HTTP endpoints for setting and resetting config_v2 field values.

<!-- AUTOGENERATED:END -->
