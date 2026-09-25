# entity-extensions

Lets sub-plugins attach typed DB fields to a parent plugin's entity table without coupling the parent. Mirrors `attachments.defineLink` — both factories return a typed handle; the underlying pgTable never crosses the consumer's barrel.

## Why

A child plugin that wants per-entity state (toggles, settings, soft-delete flags) should not force the parent plugin to declare a column. Adding `auto_launch` to `_agents` to power a sub-plugin's row action backwards-couples the parent's schema to the feature. With this primitive, the child owns its own `<parent>_ext_<name>` side-table end-to-end: tables, live-state resource, HTTP route, UI.

## API

An extension is an **entity with a parent key and two timestamps added for you**. It is declared in two halves, so the browser can read the row schema without importing drizzle:

```ts
// shared/resources.ts (or core/ when another plugin reads the row) — browser-safe
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

export const transposeShape = defineExtensionShape({
  key: "songId",                       // the parent key's name
  fields: { semitones: intField() },   // the plugin's own fields
  // serverOnly?:     ["contentHash"]              — own fields kept off the wire
  // wireTimestamps?: ["createdAt" | "updatedAt"]  — timestamps put ON the wire
});
export const TransposeRowSchema = transposeShape.schema;   // { songId, semitones }
```

```ts
// server/internal/tables.ts
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { transposeShape } from "../../shared/resources";

export const songTranspose = defineExtension(_songs, "transpose", transposeShape, {
  columns: { semitones: { default: 0 } },   // DB-only concerns, own fields only
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it up.
// The leading `_` and the `internal/` location keep cross-plugin imports
// impossible — only `songTranspose` (the handle) goes in barrels.
export const _songTransposeExt = songTranspose.table;
```

```ts
await songTranspose.upsert(songId, { semitones: 3 });
const row = await songTranspose.get(songId);   // full row, server-only columns included
await songTranspose.delete(songId);
```

This creates `sonata_songs_ext_transpose(parent_id text PK FK → sonata_songs.id ON DELETE CASCADE, semitones integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), updated_at …)`. Drizzle-kit picks the table up via the `tables.ts` pattern in `SCHEMA_GLOBS` (`plugins/database/plugins/migrations/core/internal/schema-glob-patterns.ts`) — no central registration.

### `defineExtensionShape({ key, fields, serverOnly?, wireTimestamps? })` — `core/`

Returns a frozen `{ key, fields, serverOnly, schema }`:

- `fields` is the **complete** field record, in column order: `{ [key]: textField(), ...fields, createdAt: dateField(), updatedAt: dateField() }`. The order is load-bearing — drizzle-kit diffs columns positionally, and it is the order every extension table has always had.
- `serverOnly` is the plugin's `serverOnly` plus every timestamp not listed in `wireTimestamps`.
- `schema` is `wireSchema(fields, serverOnly)` from `entities/core` — the same helper `defineEntity` uses, so the browser's schema and the server's come from the same code with the same inputs.

### `defineExtension(parent, name, shape, meta?)` — `server/`

Built on `defineEntity`. The table is `<parent>_ext_<name>`; the key column is the shape's key (`primaryKey`), stored as `parent_id` with the FK to `parent.id` ON DELETE CASCADE; both timestamps default to `now()`. `meta` takes the DB-only concerns:

- `columns` — `default` / `name` / `references` for the plugin's **own** fields (`defineEntity`'s `meta.columns`). The key and the timestamps are the primitive's, so they are not declarable here.
- `indexes` — see below.

The handle is an `Entity` (`name`, `table`, `schema`, `wireColumns`) plus `key`, `get(id)`, `upsert(id, patch)` and `delete(id)`, all keyed on `table[key]`. `schema` **is** `shape.schema` — the same object, not a rebuilt one. `upsert`'s patch is the plugin's own columns only (DB-defaulted ones optional); it never writes `updatedAt` (see below).

### The key is named after the parent

Each extension names its parent key (`songId`, `conversationId`, `taskId`, `blockId`, `serverId`). The table's JS property and the wire field share that name, so no loader renames `parentId` to the domain key. Only the DB column keeps the generic `parent_id` name — the DDL is unchanged by the name you pick.

### Wire, timestamps and `serverOnly`

- **Own fields are on the wire** unless listed in `serverOnly` (`defineEntity`'s rule). A server-only column stays in the DDL and in `get`'s row, but is never selected by `wireColumns`, so it cannot leak.
- **Timestamps are off the wire** unless listed in `wireTimestamps`. They belong to the primitive, so leaving them off by default cannot drop a column the plugin cares about — and it keeps a write that changes nothing from sending a row diff just because `updatedAt` moved.

### Loaders

A side table holds one row per parent, and a reader almost always wants the row of the ONE parent on screen. So the default is a **point resource**: the client subscribes to the ids it draws, and a write to another parent's row never reaches it. The reference is `conversations/conversation-progress`:

```ts
// shared/ — the descriptor, keyed on the shape's key
export const progressResource = pointQueryResourceDescriptor<Progress>(
  "conversation-progress", ProgressSchema, "conversationId");

// server/internal/resource.ts
export const progressLiveResource = windowQueryResource(progressResource, {
  from: conversationProgress,                          // no `select`: wireColumns + the PK identity are derived
  point: { by: conversationProgress.table.conversationId },
});

// web — no whole-table read, no `.find(id)`
const progress = usePointResource(progressResource, conversationId);
```

Because the handle is an entity, no form has a row projection left to write:

| Resource form | Loader |
|---|---|
| **point** `windowQueryResource` (default) | `from: ext`, **no `select`** — query-resource defaults the projection to `wireColumns` and the identity to the single PK — and `point: { by: ext.table.<key> }` |
| push `defineResource` over the whole table — **legacy, do not copy** | `schema: z.array(ext.schema)`, `loader: () => db.select(ext.wireColumns).from(ext.table)` |
| push resource folding rows into a `Record` — **legacy, do not copy** | `db.select(ext.wireColumns)`, then the fold; each value's schema is `ext.schema` |

The two push forms re-send every parent's row to every subscriber on any write, and make each reader pick its one row with `.find(id)`. The Sonata per-song settings, `task-efforts` and `task-preprompts` still use them: they are on the legacy list awaiting migration (`research/2026-07-18-global-bounded-working-set-resource-contract.md`), not precedent. A reader that needs every parent's row — typically to sort the parent list by an extension column — is an open design question in the live-resources redesign, not a reason to reach for a push form.

A `select: { conversationId: t.parentId, … }` map or a `.map((r) => ({ songId: r.parentId, … }))` is the hand-rolled projection `no-hand-rolled-entity-projection` bans: a column added to the table silently misses the wire.

### `indexes`

The table ships with exactly one index: the implicit btree behind the `parent_id` primary key. That covers every read the handle's own methods make, so **a table read only by its key needs no `indexes` at all**. Declare one only when the plugin composes a query off `.table` keyed by something else — that read is otherwise a seq scan, and there is no other supported way to add the index (generated migrations are never hand-edited).

`meta.indexes` is a callback receiving the typed columns `t` and a builder pair `b`:

```ts
export const promptBlock = defineExtension(_tasks, "prompt_block", promptBlockShape, {
  // b.index("block_created") → index("tasks_ext_prompt_block_block_created_idx")
  indexes: (t, b) => [b.index("block_created").on(t.blockId, t.createdAt)],
});
```

**The name is derived, not authored.** The caller gives a short table-local suffix; the primitive prefixes the derived table name and appends `_idx`. An extension's table name is computed (`<parent>_ext_<name>`), so re-typing it as a string would be pure drift — a typo or a later parent rename yields a silently misleading index name that Postgres accepts without complaint. Binding the prefix makes a wrong name unrepresentable.

`b.index` / `b.uniqueIndex` return **drizzle's own builders**, so the full surface stays available: `.on()`, `.using("gin", …)`, `.where(sql\`…\`)`, `.desc()`. `t` is keyed by JS property name and covers the key, `createdAt` and `updatedAt` alongside the plugin's own fields.

### `updatedAt`

Derived, never written: every side-table gets the derived-`updatedAt` trigger of [`entities`](../entities/CLAUDE.md) → **Derived updatedAt**, so `updated_at` moves to `now()` only when a counted column really changes, and any app write to it RAISEs. `defineExtension` builds the total `touchedBy` map itself — the key and `createdAt` never count, **every own column counts by default** — so a new column cannot be missed (over-counting is the only possible error, and it is harmless). Override a column with `meta.touchedBy` (`false`, or `{ into, outOf }` typed against the column's value type): e.g. `touchedBy: { checkedAt: false }` for a column a probe rewrites every run. A presence-only extension (no own columns) compiles a trigger that never bumps. A direct `db.update(ext.table)` / `insert … onConflictDoUpdate` must not set `updatedAt` either.

### Module-eval throws

- **Reserved field names** (`defineExtensionShape`). A plugin field named after the chosen key, `createdAt` or `updatedAt` would collide with the primitive's own field, so the declared shape and the DDL would disagree. It throws, naming the key and the field. A key named `createdAt` / `updatedAt` throws too.
- **Identifier length** (`defineExtension`). `<table>_<suffix>_idx` past Postgres's 63-**byte** limit is silently truncated, which can collide with another index. It throws with the offending name and its byte length. The suffix shape is validated too (`/^[a-z0-9_]+$/`, non-empty).
- Everything `defineEntity` checks (a field type with no storage, a `serverOnly` key that is not a field).

## Wire-up

Each consumer plugin owns its own:
- `shared/resources.ts` (or `core/` when another plugin reads the row) — `defineExtensionShape(...)`, the row schema (`= shape.schema`) and the `resourceDescriptor(...)` for the web client
- `server/internal/tables.ts` — `defineExtension(parent, name, shape, meta?)`, plus the `.table` re-export
- `server/internal/resource.ts` — the live-state resource, in one of the loader forms above
- `shared/endpoints.ts` (or `core/`) — `defineEndpoint(...)` for the `POST /api/<feature>/:id` mutation
- `server/index.ts` — registers the resource and wires the mutation via `implement(...)`
- `web/components/...` — `useResource(...)` for reads + `useEndpointMutation(...)` / `fetchEndpoint(...)` (from `@plugins/infra/plugins/endpoints/web`) for the mutation

The parent plugin doesn't change. `sonata/transpose` is the reference consumer.

## Migration: moving data into or out of an extension

If no data needs preserving, accept the auto-generated migration as-is — that is the common case.

To preserve it, the move takes **two pushes** (expand → migrate → contract), because a backfill cannot depend on schema its own branch creates:

1. **Expand.** Add the extension (or, moving the other way, the destination table) while leaving the old column/table in place. One ordinary `./singularity build --migration-name <slug>`; both shapes coexist on main.
2. **Migrate + contract.** `--custom-migration` to backfill across — its source and destination are both on main now — then delete the old shape from `schema.ts` for the `DROP`.

Never hand-edit the generated SQL to interleave the DML: a schema migration's SQL must match its snapshot's DDL, and the push-time hand-edit detector aborts. The ordering rule and its `--reset-migration` mechanics live in [`database/migrations/CLAUDE.md`](../../../database/plugins/migrations/CLAUDE.md) → **Ordering a backfill against a schema change**; the `data-migration-reset-stable` check catches a violation at build time.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Lets sub-plugins attach typed DB fields to a parent's entity table via 1:1 side-tables. Each consumer owns its <parent>_ext_<name> table; FK CASCADE on parent delete.
- Load-bearing: yes
- Server:
  - Uses:
    - `database.db`
    - `database.DbExecutor`
    - `infra/entities.DefaultedKeys`
    - `infra/entities.defaultNow`
    - `infra/entities.defineEntity`
    - `infra/entities.Entity`
    - `infra/entities.EntityColumns`
    - `infra/entities.EntityMeta`
    - `infra/entities.EntityMetaBase`
    - `infra/entities.TouchedBy`
  - Exports (types):
    - `EntityExtension`
    - `ExtensionIndexBuilders`
    - `ExtensionMeta`
  - Exports (values):
    - `defineExtension`
    - `EntityExtensions`
- Core:
  - Uses:
    - `fields/date/config.dateField`
    - `fields/date/config.DateFieldDef`
    - `fields/text/config.textField`
    - `fields/text/config.TextFieldDef`
    - `infra/entities.wireSchema`
  - Exports (types):
    - `AnyExtensionShape`
    - `ExtensionFields`
    - `ExtensionServerOnly`
    - `ExtensionShape`
    - `ExtensionShapeDef`
    - `ExtensionTimestamp`
    - `ExtensionWireShape`
  - Exports (values):
    - `defineExtensionShape`
    - `EXTENSION_TIMESTAMPS`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/health`
    - `apps/pages/agent-origin`
    - `apps/pages/starred`
    - `apps/sonata/playback-history`
    - `apps/sonata/rich/chord-mode`
    - `apps/sonata/rich/key-mode`
    - `apps/sonata/rich/rhythm-controls`
    - `apps/sonata/sources/chord-grid`
    - `apps/sonata/sources/midi`
    - `apps/sonata/sources/ultimate-guitar`
    - `apps/sonata/transpose`
    - `conversations/conversation-preprompt`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/notes`
    - `conversations/conversation-view/turn-summary`
    - `conversations/conversations-view/queue`
    - `page/annotations/todo/task-link`
    - `page/prompt/link`
    - `plugin-meta/plugin-health`
    - `tasks/auto-start`
    - `tasks/task-category`
    - `tasks/task-effort`
    - `tasks/task-preprompt`
    - `tasks/task-source-url`

<!-- AUTOGENERATED:END -->
