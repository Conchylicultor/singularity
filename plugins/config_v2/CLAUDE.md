# config_v2

See [config v2 vision](../../research/2026-05-16-config-v2-vision.md) for the
full design rationale, planned field types, and storage model.

## Declaring config (plugin author)

```ts
import { defineConfig } from "@plugins/config_v2/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";

export const myConfig = defineConfig("my-plugin", {
  fields: {
    enabled: boolField({ label: "Enabled", default: true }),
    name: textField({ label: "Display name" }),
    items: listField({
      label: "Items",
      itemFields: {
        title: textField({ label: "Title" }),
      },
    }),
  },
});
```

Each field carries its Zod schema, default value, and UI metadata; the settings pane
renders them automatically. Field types live under `plugins/fields/plugins/`; see
[fields/CLAUDE.md](plugins/fields/CLAUDE.md) to add new ones.

## Reading config

**Web:** `useConfig(myConfig)` returns reactive values that update live.

**Server:** `getConfig(myConfig)` reads the current value from the in-memory
cache. `watchConfig(myConfig, cb)` notifies on changes.

## Descriptor provenance (`source`)

Every `ConfigDescriptor` carries a `source: "manual" | "reorder" | "view"`, set by
`defineConfig` (defaults to `"manual"`), distinguishing **hand-authored** configs from
the two **auto-generated** families — one descriptor per reorderable render slot
(`reorderDirectiveDescriptor`) and one per DataView consumer (`viewsDescriptor`). Named
`source`, **not `origin`**: `origin` already means the `.origin.jsonc` layer here.

`source` lives on the descriptor object only — **not** in the config document or schema,
so it never affects an origin `@hash` or `config-origins-in-sync`; the settings config nav
surfaces it as a filterable `enum`. A new primitive that generates descriptors must give
itself its own `source` value.

## Three-layer config model

Config flows through three layers, each with a human-editable override mechanism:

```
Code (defineConfig)  →  git config/  →  ~/.singularity/config/
   defaults + schema      repo defaults     user config
```

### Layer 1: Code → git (build-time)

`./singularity build` generates `config/<plugin-tree>/<name>.origin.jsonc` from `defineConfig` defaults. First line: `// @hash <12-hex>` (content hash).

**Agent overrides:** Copy to `config/<plugin-tree>/<name>.jsonc`, edit values, keep the `// @hash` line from origin.

**Conflict detection:** when origin regenerates with a new hash, `config-origins-in-sync` fails on any `.jsonc` override still referencing the old one. Review the origin change, update the override, restamp `// @hash`.

### Layer 2: git → user (build-time)

`./singularity build` propagates the resolved git config (override if present, else origin) to `~/.singularity/config/<plugin-tree>/<name>.origin.jsonc` with a hash of the source content. The server reads from this directory at startup without re-propagating.

**User overrides:** UI `setConfig` or manual edits create `~/.singularity/config/<plugin-tree>/<name>.jsonc` with the origin's content hash.

**Conflict detection:** When git config changes, the propagated origin hash updates. A stale user override hash triggers `console.warn` on server start. (UI notification not yet wired.)

### App scopes: per-app config in git

A descriptor's config can be customized **per app** straight from version control — no code declares scopes; you commit a JSONC file at an `@app/<id>` path and `./singularity build` does the rest. The app whose id is `<id>` then resolves the scoped values; every other app keeps the base value.

**To customize app `<id>` for the descriptor at `<plugin-tree>` (config name `<name>`, usually `config`):**

1. Create `config/<plugin-tree>/@app/<id>/<name>.jsonc`.
2. Put **only the fields that differ** for that app, e.g. `{ "captureUrlByDefault": false }` (a partial delta — schema default-backfill fills the rest).
3. Line 1: `// @hash <hash>` copied from the **base** origin `config/<plugin-tree>/<name>.origin.jsonc`. A scoped override anchors to the base origin — **no scoped origin is ever committed**.
4. `./singularity build`. Propagation resolves the scope as `baseEffective ⊕ scopedDelta` and writes it to `~/.singularity/config/<wt>/<plugin-tree>/@app/<id>/<name>.origin.jsonc`.
5. `./singularity check config-origins-in-sync` validates the `@hash` against the base origin and the document against the schema.

This is the base-override workflow (Layer 1) one path segment deeper. Any registered descriptor can be git-scoped — it does **not** need `scope: "app"` (that marker only governs the theme "Customize for app" fork-all-descriptors UX).

**Reading a scoped value (consumer):** thread the app scope yourself — `config_v2` is app-agnostic. `useConfig(cfg, { scopeId: appId ? \`app:${appId}\` : undefined })` with `appId = useCurrentAppId()`. Committed scopes are pre-hydrated in the boot snapshot, so the scoped value paints on the first frame (no flash). On the server, `getConfig(cfg, "app:<id>")`.

**Scoped read/write are symmetric.** Both ends key off the **same** server predicate, `scopeHasOwnConfig(descriptor, scopeId)` (the scope's origin OR override exists), so they can never disagree:

- **Read.** `useConfig` decides whether to read the scoped key purely from membership in the live `configV2ScopesResource` (`config-v2.scopes`, keyed by `{ path }`), recomputed from `scopeHasOwnConfig` on every scoped-file change — so a scope counts whether it became real via a committed git scope, a theme fork, **or a plain scoped `setConfig` write**. While the list loads it falls back to the global value, never `descriptor.defaults`. `useScopeForked` remains a read hook for the theme "Customize for app" toggle but does **not** gate `useConfig`.
- **Write (fork-on-write).** A scoped `useSetConfig`/`setConfig` to a scope with **no own config yet** auto-snapshots the current base into that scope's origin (the same redacted snapshot `forkScope` writes) and then writes the override — no explicit fork ceremony. A write when no **base** origin exists at all still throws "run ./singularity build".

**Semantics:** a committed scope is a frozen snapshot of `baseEffective ⊕ delta` recomputed each build, so its non-overridden fields track the git base as of the last build, not a runtime base edit. A runtime user fork layers on top; un-customizing drops the runtime override and falls back to the committed scope, not to global.

**Per-app scopes in settings:** the config detail pane is scope-aware — a **Base** tab plus one tab per customized app (live from `configV2ScopesResource`); selecting a tab re-keys every read and write to that `scopeId`. **`+` App** forks a new per-descriptor customization (`fork-descriptor-scope`); **Stop customizing** (`remove-descriptor-scope`) drops the descriptor's whole per-app customization — distinct from "Reset all", which only reverts edits to the scoped origin.

### Hash chain

Each layer's override records the hash of its *own* origin on line 1: a git override's `// @hash` tracks code changes; a user override's tracks git-config changes (code *and* agent overrides).

### Override semantics

Overwrites are **full copies**, not deltas: `setConfig` writes `{ ...currentValues, [key]: newValue }`, always a complete document. `parseDocument` fills missing keys from defaults, so a hand-written partial file still degrades gracefully.

### Conflict precedence: origin wins until reconciled

`effective(origin, overwrites)` normally returns the override when it exists. But when the override's `// @hash` is stale (a **conflict** — the origin moved underneath an override written against an older version), the **origin takes precedence** until the user reconciles: edit a field (rewrites the override against the current origin), "Keep my values" / acknowledge-conflict (bumps the hash so the override wins again), "Accept new defaults" / delete-override (drops the override), or **"Merge"** / merge-conflict (below).

### Three-way merge (ancestor snapshot)

"Keep my values" and "Accept new defaults" are all-or-nothing. The **Merge** resolver reconciles per field: only-user-changed keeps the user's value, only-upstream-changed takes the new default, and both-changed-differently is a true conflict left for manual resolution.

A three-way merge needs the **base** — the origin the override was written against — but only its hash lives in `// @hash`, and the user-layer origin is propagated by build, not versioned. So `propagate()` **snapshots the base at the conflict transition**: about to overwrite a user origin an *in-sync* override depends on (`oldOrigin.hash === override.hash && override.hash !== newHash`), it first writes the old origin to a sibling `<name>.ancestor.jsonc`. That predicate is idempotent — once the override is stale the hashes differ, so repeated builds never clobber the true base — and `propagateConfigToUser` deletes any orphaned ancestor on a no-conflict build.

`threeWayMerge(base, ours, theirs)` (pure, `tier-logic.ts`) returns the merged document plus the truly-conflicting keys. `computeAllConflicts` attaches `trueConflictKeys` to the `kind: "hash"` entry when an ancestor exists; its presence is what makes the UI offer **Merge** (legacy conflicts with no ancestor fall back to binary Keep/Accept). `mergeConflictByPath` bumps the hash and deletes the ancestor when nothing truly conflicts; otherwise it keeps the stale hash so the conflict stays surfaced, and re-running Merge finalizes it. Every terminal resolution (acknowledge-conflict, delete-override) also deletes the ancestor.

**Every config file on disk must carry a `// @hash` header** — the anchor conflict detection compares against; a hashless file is corrupt, not a benign "untracked" override. Enforced by throwing at both boundaries: `jsoncConfigProxy.read()` on a hashless file, and `setConfig` rather than fabricating a hashless override when no origin has been propagated. There is no "null hash wins" fallback.

Because the running app resolves to origin during a conflict, the settings editor binds to `conflictEntry.overrideValues` (the user's override document on disk), not to `useConfig` (the resolved value) — otherwise the user could neither see nor fix their pending override.

### Schema evolution

Adding a field to an existing config (including a `listField` item or `objectField` sub-field) must not break documents stored before the field existed. Two mechanisms guarantee this:

- **Default-backfill.** Every `FieldsRecord`→`z.object` composition (`fieldsToZodObject`, `listField`, `objectField`) wraps each field schema via `fieldSchemaWithDefault(field)` = `field.schema.default(field.defaultValue)`, and `defineConfig` builds its schema as `fieldsToZodObject(fields).passthrough()` (`fieldsToZodObject` is strict; config adds the unknown-key tolerance). A key missing from a stored document heals to that field's default instead of failing validation; the file self-heals on the next `setConfig`.
- **Invalid surfacing, not silent fallback.** When the effective document still fails the schema after backfill (a genuine break — a field's type changed under stored data, a bad hand edit), `readTypedConfig` resolves to defaults *and logs a warning*, while `computeAllConflicts` emits a `kind: "invalid"` entry carrying structured `issues` (`{ path, message }`, see `configV2ValidationIssueSchema`) that the settings detail renders as a destructive banner pinpointing each bad field — so disappearing data is never silent. Hash conflicts (`kind: "hash"`) take precedence when both apply. A missing document is the legitimate defaults case, not an "invalid" one.

### Checks

`config-origins-in-sync` (single check, double duty):
1. Every `.origin.jsonc` in `config/` matches current `defineConfig` defaults
2. Every `.jsonc` override has a `// @hash` matching its current origin

`config:overrides-authored` (`check/overrides-authored.ts`) — see
[mandatory overrides](#mandatory-overrides-requiresauthoredoverride) below: a filesystem
scan of `config/**/*.jsonc` (excluding the generated `.origin`/`.ancestor` siblings)
failing on any file still carrying the seeded `// @review` marker. `alwaysRun` (fails
`--skip-checks` builds too) and never cached — the marker is minted by the build itself,
after that run's tree hash was taken.

`config-v2:registrations-paired` (`check/registrations-paired.ts`) — every server
`ConfigV2.Register` has a matching web `ConfigV2.WebRegister` at the same storePath, and
vice versa.

### Mandatory overrides (`requiresAuthoredOverride`)

A descriptor whose committed override must be **deliberate, not defaulted** declares
it:

```ts
defineConfig({
  name: slotId,
  requiresAuthoredOverride: {
    guidance: ["Arrange \"items\" for how this slot renders", "(sidebar = vertical list, toolbar = horizontal bar)"],
  },
  …
})
```

`./singularity build` then does the mechanical half: it **seeds** a missing
`config/<tree>/<name>.jsonc` from its origin — same `// @hash`, same body, same legend
comments — with a one-line `// @review` marker plus the descriptor's `guidance` lines
after the hash header; and it **re-marks + re-stamps** an existing override whose origin
hash moved underneath it. The human half is: arrange the values, delete the marker line.

`guidance` is **descriptor-supplied prose**, so neither the engine nor the check ever
names a config family — the check just echoes each offending file's own marker block back,
and a new family that opts in needs zero edits to either. Today's consumers: reorder's
`reorderDirectiveDescriptor` (per reorderable slot) and data-view's `viewsDescriptor`
(per DataView surface).

Why *review* rather than *presence*: seeding makes absence self-healing (delete a
required override and the next build re-seeds it, marked, which fails), and a stale hash
stops being discharged by retyping it — retyping was acknowledgement, not review.

Seeding is **build-only** (never in the shared `regenerateManifestCodegen` pipeline)
because `regen-generated` runs inside push's merge-driver path followed by an amend
commit, so a marker minted there would land unreviewed; it asserts marker-free instead.
Design:
[`research/2026-07-23-global-authored-override-seeding.md`](../../research/2026-07-23-global-authored-override-seeding.md).

### Internal architecture

- **`jsoncConfigProxy`** — synchronous read/write with `// @hash` header tracking. Used for propagation, `setConfig`, and `reloadValues`.
- **`ConfigWatcher`** (`config-watcher.ts`) — `@parcel/watcher` file-change detection on `~/.singularity/config/`. Debounce (100ms) + ceiling (1s); the blanket 30s reconcile is deliberately **disabled** (`reconcileMs: null`) — it re-fired every watched path (2 per descriptor) into a full conflicts recompute, an O(N²) idle re-read storm with nothing changed. Callbacks are `() => void`; the registry re-reads via `jsoncConfigProxy` on notification.

  These events are a **push-latency** mechanism, not a correctness one — an event can be missed (an out-of-band writer parcel doesn't observe, a dropped fsevent, a path no `CacheEntry` registered). **Never treat "no event" as "no change"**: derived state must be founded on the disk, per the fingerprint memo below.

- **`refreshEntry` (`registry.ts`) — the single "this entry's files changed" path** (re-read from disk → replace `CacheEntry.values` → notify subscribers + values/conflicts/tiers). Called from **both** the watcher (out-of-band writes) **and every in-process writer right after its own write** (`setConfig`, `acknowledgeConflictByPath`, `mergeConflictByPath`, `deleteOverrideByPath`). The second is NOT redundant: on a missed watcher event a writer that waited for its own event would leave `entry.values` stale indefinitely, so `getConfig` — and with it the `config-v2.values` push and the `/api/config-v2/snapshot` boot hydration — would keep serving the pre-write document while the correct value sits on disk. Any new file-mutating path must call it (scoped fork/unfork instead rebuilds via `ensureScopeEntry`/`disposeScopeEntry`). It carries provider-backed (secret) field values forward — they live outside the JSONC document.

### Derived aggregates (conflict-paths / scopes / modified-counts)

Three aggregate live resources summarize all ~180 descriptors at once. They are cheap because none of them re-reads every config file per load — but they arrive at that in two *different* ways, and the difference is load-bearing.

**`config-v2.conflict-paths` — derived from disk, memoized on a file fingerprint.** Its loader is the authority: it re-derives the union over base + every on-disk app scope through the *same* `derivedDescriptorConflict` memo the per-descriptor `config-v2.conflicts` resource uses, so the nav ⚠ badge and the detail banner can't disagree. The memo keys `(storePath, scopeId)` on `(inode, mtime-ns, size)` of the file trio (origin / override / ancestor), so an unchanged descriptor costs 3 `statSync`s, not 3 read+parse+hash. `inode` is what makes it airtight — `jsoncConfigProxy.write` renames a temp file into place, so even a byte-length-identical hash restamp changes it.

The memo key comes from **the filesystem, not an event** — deliberately. `refreshConflictPaths` still runs from the watcher path, but only as a *push-latency* optimization (it diffs a "last published" snapshot and notifies on a flip); it is never the value the loader reads, so a missed watcher event can delay a push but can't produce a wrong answer.

**`config-v2.scopes` (storePath→scopeIds) and `config-v2.modified-counts` — event-fed in-memory maps** in `resource.ts`, recomputed per changed descriptor by `refreshScopeMembers` / `refreshModifiedCount` (boot warm-up + `registry.ts`'s notify path). They read nothing from disk per load — and so **do** go stale on a missed watcher event. Applying the fingerprint-memo treatment above is the intended fix; it just hasn't been done.

`config-v2.conflicts` is keyed per-descriptor (`{ path, scopeId? }`) so opening one config page recomputes one descriptor, not the whole ~180-descriptor map.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Reactive useConfig hook for reading typed JSONC config in the browser. Typed JSONC config handles for server plugins.
- Web:
  - Slots: `ConfigV2.WebRegister` ← `apps-core.app-rail-framing`, `apps-core.surface.floating`, `apps-core.surface.floating.wallpaper`, `apps.sonata.audio.metronome`, `apps.sonata.notation`, `apps.sonata.piano-keyboard`, `apps.sonata.piano-roll`, `apps.sonata.piano-roll.fx-comets`, `apps.sonata.piano-roll.fx-core`, `apps.sonata.piano-roll.fx-ripples`, `apps.sonata.piano-roll.fx-shatter`, `apps.sonata.primitives.keyboard`, `apps.sonata.rich.chord-label`, `apps.sonata.sources.midi.folders`, `apps.sonata.voicing`, `auth.apple-signing`, `auth.google`, `auth.notion`, `backup`, `backup.sources.attachments`, `backup.sources.claude-settings`, `backup.sources.config`, `backup.sources.cost-history`, `backup.sources.databases`, `backup.sources.project-memory`, `backup.sources.secrets`, `backup.sources.singularity-platform`, `backup.sources.transcripts`, `backup.targets.google-drive`, `backup.targets.local`, `build`, `conversations`, `conversations.conversation-category`, `conversations.conversation-view.launch-prompts`, `conversations.conversation-view.prompt-templates`, `conversations.conversation-view.push-and-exit`, `conversations.conversation-view.turn-summary`, `conversations.hibernation`, `conversations.model-provider`, `conversations.preprompts`, `debug.boot-budget`, `debug.boot-monitor`, `debug.boot-watchdog`, `debug.live-state-churn.monitor`, `debug.op-rate`, `debug.paging-probe`, `debug.queue-health`, `debug.read-set-shrink`, `debug.sentinel`, `debug.session-divergence`, `debug.slow-ops`, `debug.stall-monitor`, `debug.trace.engine`, `infra.duress`, `integrations.gmail`, `plugin-meta.composition`, `primitives.data-view`, `reorder`, `review.code-review`, `shell.global-action-bar`, `stats.commits`, `stats.cost`, `tasks.task-draft-form`, `ui.segmented-progress-bar`, `ui.sidebar-framing`, `ui.tab-bar`, `ui.theme-engine`, `ui.tokens.categorical`, `ui.tokens.chart`, `ui.tokens.color-adjust`, `ui.tokens.color-palette`, `ui.tokens.density`, `ui.tokens.font-family`, `ui.tokens.rich-text-palette`, `ui.tokens.shadow`, `ui.tokens.shape`, `ui.tokens.sidebar-palette`, `ui.tokens.type-scale`, `ui.tree-disclosure`
  - Contributes: `Core.Boot`
  - Uses:
    - `infra/endpoints.fetchEndpoint`
    - `infra/endpoints.useEndpointMutation`
    - `primitives/live-state.hydrateResource`
    - `primitives/live-state.useResource`
  - Exports (types): `ConfigRegistration`
  - Exports (values):
    - `ConfigV2`
    - `useConfig`
    - `useConfigRegistrations`
    - `useScopeMembership`
    - `useSetConfig`
- Server:
  - Contributes:
    - `resource.declare` "config-v2.values"
    - `resource.declare` "config-v2.conflicts"
    - `resource.declare` "config-v2.scopes"
    - `resource.declare` "config-v2.conflict-paths"
    - `resource.declare` "config-v2.modified-counts"
    - `resource.declare` "config-v2.tiers"
  - Uses:
    - `infra/file-watcher.createFileWatcher`
    - `infra/file-watcher.FileWatcher`
    - `infra/paths.MAIN_WORKTREE_NAME`
    - `infra/paths.REPO_CONFIG_DIR`
    - `infra/paths.REPO_ROOT`
    - `infra/paths.SINGULARITY_DIR`
  - Exports (types): `FieldStorageProvider`
  - Exports (values):
    - `acknowledgeConflictByPath`
    - `auditUserConfigOrphans`
    - `ConfigV2`
    - `deleteOverrideByPath`
    - `deleteScope`
    - `forkConfig`
    - `forkDescriptorScope`
    - `forkScope`
    - `getAllDescriptors`
    - `getConfig`
    - `getFieldStorageProvider`
    - `getRawFileContent`
    - `getScopedDescriptors`
    - `hasFieldStorageProvider`
    - `mergeConflictByPath`
    - `registerFieldStorageProvider`
    - `removeDescriptorScope`
    - `resetConfigByPath`
    - `setConfig`
    - `setConfigByPath`
    - `watchConfig`
  - Resources:
    - `config-v2.conflict-paths` (push)
    - `config-v2.conflicts` (push)
    - `config-v2.modified-counts` (push)
    - `config-v2.scopes` (push)
    - `config-v2.tiers` (push)
    - `config-v2.values` (push)
- Core:
  - Uses:
    - `fields.fieldsToZodObject`
    - `infra/endpoints.defineEndpoint`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `ConfigDescriptor`
    - `ConfigProxy`
    - `ConfigSource`
    - `ConfigV2ConflictEntry`
    - `ConfigV2ConflictPaths`
    - `ConfigV2Conflicts`
    - `ConfigV2ModifiedCounts`
    - `ConfigV2Scopes`
    - `ConfigV2ScopesMap`
    - `ConfigV2Tiers`
    - `ConfigV2ValidationIssue`
    - `ConfigV2Values`
    - `ConfigValues`
    - `Disposable`
    - `JsonValue`
    - `OrphanEntry`
    - `OrphanFile`
    - `OrphanFileRole`
    - `OrphanReason`
    - `OrphanReport`
    - `OrphanRiskClass`
  - Exports (values):
    - `APP_SCOPE_DIR`
    - `appScopeId`
    - `codeConfigProxy`
    - `computeHash`
    - `configFileOwner`
    - `configSnapshot`
    - `configV2ConflictEntrySchema`
    - `configV2ConflictPathsResource`
    - `configV2ConflictPathsSchema`
    - `configV2ConflictResource`
    - `configV2ConflictsSchema`
    - `configV2ModifiedCountsResource`
    - `configV2ModifiedCountsSchema`
    - `configV2Resource`
    - `configV2ScopesMapSchema`
    - `configV2ScopesResource`
    - `configV2ScopesSchema`
    - `configV2TiersResource`
    - `configV2TiersSchema`
    - `configV2ValidationIssueSchema`
    - `configV2ValuesSchema`
    - `defineConfig`
    - `deleteScope`
    - `effective`
    - `forkDescriptorScope`
    - `forkScope`
    - `hasConflict`
    - `hasReviewMarker`
    - `orphanEntrySchema`
    - `orphanFileRoleSchema`
    - `orphanFileSchema`
    - `orphanReasonSchema`
    - `orphanReportSchema`
    - `orphanRiskClassSchema`
    - `propagate`
    - `readonlyProxy`
    - `readTypedConfig`
    - `removeDescriptorScope`
    - `REVIEW_MARKER`
    - `scopeAppId`
    - `setConfigField`
    - `stringifyConfigValue`
    - `threeWayMerge`
    - `validationIssues`
- Cross-plugin:
  - Imported by:
    - `apps-core/surface/floating`
    - `apps-core/surface/floating/wallpaper`
    - `apps/deploy/deployments`
    - `apps/sonata/audio/metronome`
    - `apps/sonata/notation`
    - `apps/sonata/piano-keyboard`
    - `apps/sonata/piano-roll`
    - `apps/sonata/piano-roll/fx-comets`
    - `apps/sonata/piano-roll/fx-core`
    - `apps/sonata/piano-roll/fx-ripples`
    - `apps/sonata/piano-roll/fx-shatter`
    - `apps/sonata/primitives/keyboard`
    - `apps/sonata/rich/chord-label`
    - `apps/sonata/rich/voicing-controls`
    - `apps/sonata/shell`
    - `apps/sonata/sources/midi/folders`
    - `apps/sonata/view-options`
    - `apps/sonata/voicing`
    - `auth/apple-signing`
    - `auth/apple-signing/setup-wizard`
    - `auth/google`
    - `auth/google/setup-wizard`
    - `auth/notion`
    - `backup`
    - `backup/sources/attachments`
    - `backup/sources/claude-settings`
    - `backup/sources/config`
    - `backup/sources/cost-history`
    - `backup/sources/databases`
    - `backup/sources/project-memory`
    - `backup/sources/secrets`
    - `backup/sources/singularity-platform`
    - `backup/sources/transcripts`
    - `backup/targets/google-drive`
    - `backup/targets/local`
    - `build`
    - `config_v2/config-link`
    - `config_v2/settings`
    - `conversations`
    - `conversations/conversation-category`
    - `conversations/conversation-view/launch-prompts`
    - `conversations/conversation-view/prompt-templates`
    - `conversations/conversation-view/push-and-exit`
    - `conversations/conversation-view/turn-summary`
    - `conversations/hibernation`
    - `conversations/model-provider`
    - `conversations/preprompts`
    - `debug/boot-budget`
    - `debug/boot-monitor`
    - `debug/boot-watchdog`
    - `debug/config-orphans`
    - `debug/live-state-churn/monitor`
    - `debug/op-rate`
    - `debug/paging-probe`
    - `debug/queue-health`
    - `debug/read-set-shrink`
    - `debug/sentinel`
    - `debug/session-divergence`
    - `debug/slow-ops`
    - `debug/stall-monitor`
    - `debug/trace/engine`
    - `fields/secret/config`
    - `framework/tooling/codegen`
    - `infra/duress`
    - `integrations/gmail`
    - `plugin-meta/composition`
    - `primitives/data-view`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/view-core`
    - `reorder`
    - `review/code-review`
    - `shell/global-action-bar`
    - `stats/commits`
    - `stats/cost`
    - `tasks/task-draft-form`
    - `ui/segmented-progress-bar`
    - `ui/tab-bar`
    - `ui/tab-bar/customizer`
    - `ui/theme-engine`
    - `ui/theme-engine/quick-theme`
    - `ui/theme-engine/theme-customizer`
    - `ui/theme-toggle`
    - `ui/tokens/categorical`
    - `ui/tokens/chart`
    - `ui/tokens/color-adjust`
    - `ui/tokens/color-palette`
    - `ui/tokens/density`
    - `ui/tokens/font-family`
    - `ui/tokens/font-family/google-fonts`
    - `ui/tokens/rich-text-palette`
    - `ui/tokens/shadow`
    - `ui/tokens/shape`
    - `ui/tokens/sidebar-palette`
    - `ui/tokens/type-scale`
    - `ui/tweakcn/community-browser`
    - `ui/variant-region`
- Sub-plugins:
  - **`config-link`** — Deep-link affordances from any config-backed surface to its settings section. useOpenConfig() navigates to a descriptor's config pane; ConfigGearButton and ConfigPopoverHeader surface it as a gear; ConfigSelectContent / ConfigMenuContent bake the gear into Select / DropdownMenu picker chrome.
  - **`fields`** — Field type registry. Sub-plugins contribute field types with core factories and web renderers.
  - **`settings`** — Settings UI for config_v2: two-pane nav + detail surface for viewing and editing typed config fields. Surfaced inside the Settings app. HTTP endpoints for setting and resetting config_v2 field values.

<!-- AUTOGENERATED:END -->
