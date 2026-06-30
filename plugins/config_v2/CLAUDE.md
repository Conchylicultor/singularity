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

## Descriptor provenance (`source`)

Every `ConfigDescriptor` carries a `source: "manual" | "reorder" | "view"`, set by
`defineConfig` (defaults to `"manual"`). It distinguishes **hand-authored** configs
from the two **auto-generated** families — one descriptor per reorderable render
slot (`reorderDirectiveDescriptor`, `source: "reorder"`) and one per DataView
consumer (`viewsDescriptor`, `source: "view"`). It is named `source`, **not
`origin`**, deliberately: `origin` already means the `.origin.jsonc` code/git layer
throughout this plugin, so reusing it would collide.

`source` lives on the descriptor object only — it is **not** part of the config
document or schema, so it never affects an origin `@hash` or
`config-origins-in-sync`. The settings config nav surfaces it as a filterable
`enum` field (filter by Authored / Reorder / View) and a per-row tag. When a new
primitive starts generating descriptors, give it its own `source` value rather than
leaving generated configs indistinguishable from authored ones.

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

**Scoped read/write are symmetric — one authoritative signal.** Both ends key off the **same** server predicate, `scopeHasOwnConfig(descriptor, scopeId)` (the scope's origin OR override exists), so they can never disagree:

- **Read.** `useConfig` decides whether to read the scoped key purely from membership in the live `configV2ScopesResource` (`config-v2.scopes`, keyed by `{ path }`) — the list of scopes a descriptor has its own config for, recomputed from `scopeHasOwnConfig` and re-notified on every scoped-file change. It honors a scope whether it became real via a committed git scope, a theme fork, **or a plain scoped `setConfig` write**. While the list loads it falls back to the global value (the correct currently-shown value), never `descriptor.defaults`. Committed scopes' membership + values are boot-hydrated, so they paint scoped on the first frame.
- **Write (fork-on-write).** A scoped `useSetConfig`/`setConfig` to a scope that has **no own config yet** auto-snapshots the current base into that scope's origin (same redacted snapshot `forkScope` writes) and then writes the override — no explicit fork ceremony. Writing to a scope makes it exist *and* readable. The only loud failure left is the legitimate one: a write when `./singularity build` was never run (no **base** origin at all) still throws "run ./singularity build".

There is **no** separate client heuristic for "is this scope active" — the old `forked`/committed-scope re-derivation is gone. `useScopeForked` remains a public read hook for the theme "Customize for app" toggle, but it no longer gates `useConfig`.

**Semantics:** a committed scope is a frozen snapshot of `baseEffective ⊕ delta` (recomputed each build), so its non-overridden fields track the git base as of the last build — not a runtime base edit — consistent with every `forkScope` snapshot. A runtime user fork (theme "Customize for app" or fork-on-write) layers on top; un-customizing drops the runtime override and falls back to the committed scope, not to global.

**Per-app scopes in settings:** the config detail pane is scope-aware. A scope tab bar at the top offers a **Base** tab plus one tab per app the descriptor is customized for (read live from `configV2ScopesResource`), each resolving its label + icon from `Apps.App.useContributions()` and carrying a warning **conflict dot** when that scope has a stale override. Selecting a tab re-keys every read (values, tiers, conflicts) and every write (`set-field`, `reset-field`, `acknowledge`/`merge`/`delete-override`, raw file) to that `scopeId`, so fields, tiers, the conflict banner, and "Reset all" all act on the selected scope. The **`+` App** button forks a brand-new per-descriptor customization (`fork-descriptor-scope`) for any app not yet customized, then selects it. On a non-Base tab a **Stop customizing** action (`remove-descriptor-scope`) drops the descriptor's whole per-app customization — distinct from "Reset all", which only reverts edits to the scoped origin — and falls back to Base via the live scopes resource.

### Promoting a runtime edit to a git default (`promotableToGit`)

Layers 1–2 flow code → git → user. The **staging** sub-plugin
([`plugins/staging`](plugins/staging/CLAUDE.md)) adds the reverse arrow for
opted-in descriptors: a runtime (user-layer) edit can be **promoted back into the
committed git layer** as a "default for everyone". Mark a descriptor with
`defineConfig({ promotableToGit: true, ... })` to enable it — the flag is the
single generic contract; the staging primitive keys entirely off it (any
registered descriptor with the flag is promotable, with zero staging-code
changes).

The flow is generic over `(pluginId, configName)` and the **full config
document** (not a single field):

1. A consumer stages a candidate value via the staging web API
   (`useStageConfigDefault` → `POST /api/config-v2/staged-defaults`, body
   `{ pluginId, configName, value }`). The stage handler refuses anything whose
   descriptor isn't registered with `promotableToGit: true` (`findPromotableDescriptor`
   over `getAllDescriptors()` — the config_v2 registry *is* the allow-list).
2. Staged rows live in `staged_config_default` (composite PK
   `(plugin_id, config_name)`, last-write-wins) and stream to the UI via the
   `config-v2-staged-defaults` live resource + an optimistic overlay. The review
   pane's generic "Default for everyone" section lists them with a pluggable
   before→after diff (`Staging.DiffRenderer` slot, `GenericConfigDiff` fallback)
   and Apply / Discard / Apply-all controls.
3. Apply enqueues the `config-v2.land-defaults` job (`dedup: "singleton"`): it
   `safeParse`s the value against the descriptor schema, writes
   `config/<plugin-tree>/<configName>.jsonc` with `// @hash` restamped against the
   live origin (so the override is born in-sync), and `./singularity push`es it to
   `main` from a throwaway worktree. Malformed rows are skipped + logged; only
   landed keys are drained.

Consumers own the value shape behind their own barrel (collection-consumer
separation): **reorder** stages `{ items: tree }` per slot (and contributes the
rich tree diff renderer); **composition** stages `{ manifests: [...] }` via its
`usePromoteManifestsToGit()` hook. Neither the review section nor the staging
primitive knows anything domain-specific.

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

- **Default-backfill.** Every `FieldsRecord`→`z.object` composition (`fieldsToZodObject` from `@plugins/fields/core`, `listField`, `objectField`) wraps each field schema via `fieldSchemaWithDefault(field)` = `field.schema.default(field.defaultValue)`. `defineConfig` builds its schema as `fieldsToZodObject(fields).passthrough()` — `fieldsToZodObject` returns a strict object and config applies `.passthrough()` itself (unknown-key tolerance across schema evolution). A key missing from a stored document heals to that field's default — e.g. a preprompt stored before the `icon` avatarField was added reads back with the no-icon default rather than failing validation. The on-disk file self-heals on the next `setConfig` (canonical write is a full document).
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
- **`ConfigWatcher`** (`config-watcher.ts`) — `@parcel/watcher`-based file-change detection on `~/.singularity/config/`. Debounce (100ms) + ceiling (1s); the blanket 30s reconcile is **disabled** (`reconcileMs: null`). Config files only change in-process (`setConfig` / fork) or via `./singularity build` propagation, and parcel fires on every disk write regardless of writer, so a missed event is structurally impossible — the reconcile only produced an O(N²) idle re-read/recompute storm. Callbacks are `() => void` — the registry re-reads via `jsoncConfigProxy` on notification.

### In-memory derived caches (scopes / conflict-paths / modified-counts)

The three aggregate live resources — `config-v2.scopes` (one global `{}` map of storePath→scopeIds), `config-v2.conflict-paths` (set of conflicting storePaths), and `config-v2.modified-counts` (storePath→count) — are read by their loaders from **in-memory maps in `resource.ts`**, never by re-walking the filesystem or rescanning all descriptors per load. The authoritative predicates are still on disk (`scopeHasOwnConfig`, `computeDescriptorConflict`, effective-vs-default), but they are evaluated **only when a config file actually changes** (boot warm-up + the `refreshScopeMembers` / `refreshConflictPaths` / `refreshModifiedCount` calls in `registry.ts`'s notify path), each recomputing just the one changed descriptor and notifying iff its slice changed. So a subscribe / WS-reconnect-replay / boot-snapshot read is a pure memory read. `config-v2.conflicts` is keyed per-descriptor (`{ path, scopeId? }`) so opening one config page recomputes one descriptor, not the whole ~180-descriptor map.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Reactive useConfig hook for reading typed JSONC config in the browser. Typed JSONC config handles for server plugins.
- Web:
  - Slots: `ConfigV2.WebRegister` ← `apps-core.app-rail-framing`, `apps-core.surface.floating`, `apps-core.surface.floating.wallpaper`, `apps.sonata.audio.metronome`, `apps.sonata.notation`, `apps.sonata.piano-keyboard`, `apps.sonata.piano-roll`, `apps.sonata.piano-roll.fx-comets`, `apps.sonata.piano-roll.fx-core`, `apps.sonata.piano-roll.fx-ripples`, `apps.sonata.piano-roll.fx-shatter`, `apps.sonata.primitives.keyboard`, `apps.sonata.sources.midi.folders`, `apps.sonata.voicing`, `auth.google`, `auth.notion`, `backup`, `backup.sources.attachments`, `backup.sources.claude-settings`, `backup.sources.config`, `backup.sources.databases`, `backup.sources.project-memory`, `backup.sources.secrets`, `backup.sources.singularity-platform`, `backup.sources.transcripts`, `backup.targets.google-drive`, `backup.targets.local`, `build`, `conversations`, `conversations.conversation-category`, `conversations.conversation-view.launch-prompts`, `conversations.conversation-view.prompt-templates`, `conversations.conversation-view.push-and-exit`, `conversations.conversation-view.turn-summary`, `conversations.conversations-view.sidebar-region`, `conversations.hibernation`, `conversations.model-provider`, `conversations.preprompts`, `debug.live-state-churn.monitor`, `debug.op-rate`, `debug.queue-health`, `debug.slow-ops`, `integrations.gmail`, `plugin-meta.composition`, `primitives.data-view`, `reorder`, `review.code-review`, `shell.global-action-bar`, `stats.commits`, `stats.cost`, `tasks.task-draft-form`, `ui.segmented-progress-bar`, `ui.sidebar-framing`, `ui.tab-bar`, `ui.theme-engine`, `ui.tokens.categorical`, `ui.tokens.chart`, `ui.tokens.color-adjust`, `ui.tokens.color-palette`, `ui.tokens.density`, `ui.tokens.font-family`, `ui.tokens.rich-text-palette`, `ui.tokens.shadow`, `ui.tokens.shape`, `ui.tokens.sidebar-palette`, `ui.tokens.type-scale`
  - Contributes: `Core.Boot`
  - Uses: `infra/endpoints.fetchEndpoint`, `infra/endpoints.useEndpointMutation`, `primitives/live-state.hydrateResource`, `primitives/live-state.useResource`
  - Exports: Types: `ConfigRegistration`; Values: `ConfigV2`, `useConfig`, `useConfigRegistrations`, `useScopeMembership`, `useSetConfig`
- Server:
  - Uses: `infra/file-watcher.createFileWatcher`, `infra/file-watcher.FileWatcher`, `infra/paths.MAIN_WORKTREE_NAME`, `infra/paths.REPO_ROOT`, `infra/paths.SINGULARITY_DIR`
  - Exports: Types: `FieldStorageProvider`; Values: `acknowledgeConflictByPath`, `ConfigV2`, `deleteOverrideByPath`, `deleteScope`, `forkConfig`, `forkDescriptorScope`, `forkScope`, `getAllDescriptors`, `getConfig`, `getFieldStorageProvider`, `getRawFileContent`, `getScopedDescriptors`, `hasFieldStorageProvider`, `mergeConflictByPath`, `registerFieldStorageProvider`, `removeDescriptorScope`, `resetConfigByPath`, `setConfig`, `setConfigByPath`, `watchConfig`
- Core:
  - Uses: `fields.fieldsToZodObject`, `infra/endpoints.defineEndpoint`, `primitives/live-state.resourceDescriptor`
  - Exports: Types: `ConfigDescriptor`, `ConfigProxy`, `ConfigSource`, `ConfigV2ConflictEntry`, `ConfigV2ConflictPaths`, `ConfigV2Conflicts`, `ConfigV2ModifiedCounts`, `ConfigV2Scopes`, `ConfigV2ScopesMap`, `ConfigV2Tiers`, `ConfigV2ValidationIssue`, `ConfigV2Values`, `ConfigValues`, `Disposable`, `JsonValue`; Values: `APP_SCOPE_DIR`, `appScopeId`, `codeConfigProxy`, `computeHash`, `configSnapshot`, `configV2ConflictEntrySchema`, `configV2ConflictPathsResource`, `configV2ConflictPathsSchema`, `configV2ConflictResource`, `configV2ConflictsSchema`, `configV2ModifiedCountsResource`, `configV2ModifiedCountsSchema`, `configV2Resource`, `configV2ScopesMapSchema`, `configV2ScopesResource`, `configV2ScopesSchema`, `configV2TiersResource`, `configV2TiersSchema`, `configV2ValidationIssueSchema`, `configV2ValuesSchema`, `defineConfig`, `deleteScope`, `effective`, `forkDescriptorScope`, `forkScope`, `hasConflict`, `propagate`, `readonlyProxy`, `readTypedConfig`, `removeDescriptorScope`, `scopeAppId`, `setConfigField`, `stringifyConfigValue`, `threeWayMerge`, `validationIssues`
- Cross-plugin:
  - Imported by: `apps-core/surface/floating`, `apps-core/surface/floating/wallpaper`, `apps/sonata/audio/metronome`, `apps/sonata/notation`, `apps/sonata/piano-keyboard`, `apps/sonata/piano-roll`, `apps/sonata/piano-roll/fx-comets`, `apps/sonata/piano-roll/fx-core`, `apps/sonata/piano-roll/fx-ripples`, `apps/sonata/piano-roll/fx-shatter`, `apps/sonata/primitives/keyboard`, `apps/sonata/rich/voicing-controls`, `apps/sonata/shell`, `apps/sonata/sources/midi/folders`, `apps/sonata/voicing`, `auth/google`, `auth/google/setup-wizard`, `auth/notion`, `backup`, `backup/sources/attachments`, `backup/sources/claude-settings`, `backup/sources/config`, `backup/sources/databases`, `backup/sources/project-memory`, `backup/sources/secrets`, `backup/sources/singularity-platform`, `backup/sources/transcripts`, `backup/targets/google-drive`, `backup/targets/local`, `build`, `config_v2/config-link`, `config_v2/settings`, `config_v2/staging`, `conversations`, `conversations/conversation-category`, `conversations/conversation-view/launch-prompts`, `conversations/conversation-view/prompt-templates`, `conversations/conversation-view/push-and-exit`, `conversations/conversation-view/turn-summary`, `conversations/hibernation`, `conversations/model-provider`, `conversations/preprompts`, `debug/live-state-churn/monitor`, `debug/op-rate`, `debug/queue-health`, `debug/slow-ops`, `fields/secret/config`, `framework/tooling/codegen`, `integrations/gmail`, `plugin-meta/composition`, `primitives/data-view`, `primitives/data-view/custom-columns`, `primitives/data-view/view-core`, `reorder`, `review/code-review`, `shell/global-action-bar`, `stats/commits`, `stats/cost`, `tasks/task-draft-form`, `ui/segmented-progress-bar`, `ui/tab-bar`, `ui/tab-bar/customizer`, `ui/theme-engine`, `ui/theme-engine/theme-customizer`, `ui/theme-toggle`, `ui/tokens/categorical`, `ui/tokens/chart`, `ui/tokens/color-adjust`, `ui/tokens/color-palette`, `ui/tokens/density`, `ui/tokens/font-family`, `ui/tokens/font-family/google-fonts`, `ui/tokens/rich-text-palette`, `ui/tokens/shadow`, `ui/tokens/shape`, `ui/tokens/sidebar-palette`, `ui/tokens/type-scale`, `ui/tweakcn/community-browser`, `ui/variant-region`
- Sub-plugins:
  - **`config-link`** — Deep-link affordances from any config-backed surface to its settings section. useOpenConfig() navigates to a descriptor's config pane; ConfigGearButton and ConfigPopoverHeader surface it as a gear; ConfigSelectContent / ConfigMenuContent bake the gear into Select / DropdownMenu picker chrome.
  - **`fields`** — Field type registry. Sub-plugins contribute field types with core factories and web renderers.
  - **`settings`** — Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields. Surfaced inside the Settings app. HTTP endpoints for setting and resetting config_v2 field values.
  - **`staging`** — Generic config_v2 git-promotion staging (web): the optimistic staged-defaults overlay host, mutation + store hooks, the pluggable diff-renderer slot, and the generic structural diff fallback. Any promotableToGit descriptor's runtime edit can be promoted to a committed git-layer default. Generic config_v2 git-promotion staging: stage/apply/apply-all/discard endpoints for any promotableToGit descriptor, a live staged-defaults resource, the atomic git-layer writer, and a non-blocking job that lands the full config document directly on main via a throwaway worktree.

<!-- AUTOGENERATED:END -->
