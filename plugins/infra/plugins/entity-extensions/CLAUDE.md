# entity-extensions

Lets sub-plugins attach typed DB fields to a parent plugin's entity table without coupling the parent. Mirrors `attachments.defineLink` — both factories return a typed handle; the underlying pgTable never crosses the consumer's barrel.

## Why

A child plugin that wants per-entity state (toggles, settings, soft-delete flags) should not force the parent plugin to declare a column. Adding `auto_launch` to `_agents` to power a sub-plugin's row action backwards-couples the parent's schema to the feature. With this primitive, the child owns its own `<parent>_ext_<name>` side-table end-to-end: tables, live-state resource, HTTP route, UI.

## API

```ts
import { boolean } from "drizzle-orm/pg-core";
import { _agents } from "@plugins/conversations/plugins/agents/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

export const agentAutoLaunch = defineExtension(_agents, "auto_launch", {
  enabled: boolean("enabled").notNull().default(false),
});
// Re-export the underlying pgTable so drizzle-kit's schema glob picks it
// up. The leading `_` and the `internal/` location keep cross-plugin
// imports impossible — only `agentAutoLaunch` (the handle) goes in barrels.
export const _agentAutoLaunchTable = agentAutoLaunch.table;
```

```ts
await agentAutoLaunch.upsert(agentId, { enabled: true });
const row = await agentAutoLaunch.get(agentId);
await agentAutoLaunch.delete(agentId);
```

Creates `agents_ext_auto_launch(parent_id text PK FK CASCADE, enabled bool NOT NULL DEFAULT false, created_at, updated_at)`. Drizzle-kit picks the table up via the `tables.ts` pattern in `SCHEMA_GLOBS` (`plugins/database/plugins/migrations/core/internal/schema-glob-patterns.ts`) — no central registration.

The handle exposes `.table` for same-plugin raw queries (live-state resource loaders that read all rows, complex SQL composition keyed by columns other than `parentId`). Cross-plugin imports of the underlying pgTable are blocked by the plugin-boundary checker (R4) because the table stays in `internal/`.

### `indexes`

The table ships with exactly one index: the implicit btree behind the `parent_id` primary key. That covers every read the handle's own methods make, so **a table read only by `parent_id` needs no `indexes` at all**. Declare one only when the plugin composes a query off `.table` keyed by something else — that read is otherwise a seq scan, and there is no other supported way to add the index (generated migrations are never hand-edited).

The optional 4th argument takes an `indexes` callback receiving the typed columns `t` and a builder pair `b`:

```ts
export const promptBlock = defineExtension(
  _tasks,
  "prompt_block",
  {
    pageId: text("page_id").notNull(),
    blockId: text("block_id").notNull(),
  },
  {
    // b.index("block_created") → index("tasks_ext_prompt_block_block_created_idx")
    indexes: (t, b) => [b.index("block_created").on(t.blockId, t.createdAt)],
  },
);
```

**The name is derived, not authored.** The caller gives a short table-local suffix; the primitive prefixes the derived table name and appends `_idx`. An extension's table name is computed (`<parent>_ext_<name>`), so re-typing it as a string would be pure drift — a typo or a later parent rename yields a silently misleading index name that Postgres accepts without complaint. Binding the prefix makes a wrong name unrepresentable.

`b.index` / `b.uniqueIndex` return **drizzle's own builders**, so the full surface stays available: `.on()`, `.using("gin", …)`, `.where(sql\`…\`)`, `.desc()`. `t` is keyed by JS property name and covers `parentId`, `createdAt` and `updatedAt` alongside the user's columns.

Two module-eval throws guard the primitive's invariants:

- **Reserved column names.** Declaring `parentId`, `createdAt` or `updatedAt` in `columns` used to silently produce an incoherent table (the spread order lets `parentId` lose to the user column while the timestamps win). It now throws, naming the key and the table.
- **Identifier length.** `<table>_<suffix>_idx` past Postgres's 63-**byte** limit is silently truncated, which can collide with another index. It throws with the offending name and its byte length. The suffix shape is validated too (`/^[a-z0-9_]+$/`, non-empty).

## Wire-up

Each consumer plugin owns its own:
- `server/internal/tables.ts` — calls `defineExtension(...)`
- `server/internal/resource.ts` — `defineResource({mode: "push"})` returning the rows
- `core/endpoints.ts` — `defineEndpoint(...)` for the `POST /api/<feature>/:parentId` mutation
- `server/index.ts` — registers the resource and wires the mutation via `implement(...)`
- `shared/resources.ts` — `resourceDescriptor(...)` for the web client
- `web/components/...` — `useResource(...)` for reads + `useEndpointMutation(...)` / `fetchEndpoint(...)` (from `@plugins/infra/plugins/endpoints/web`) for the mutation

The parent plugin doesn't change.

## Migration: moving an existing column to an extension

Drizzle-kit auto-emits `DROP COLUMN` before `CREATE TABLE` (alphabetical order). To preserve data, hand-edit the generated SQL after `./singularity build` to reorder as:

1. `CREATE TABLE <parent>_ext_<name> (...)`
2. `INSERT INTO <parent>_ext_<name> (parent_id, <col>) SELECT id, <col> FROM <parent> WHERE <predicate>`
3. `DROP VIEW <parent>_v` (if any view depends on the column)
4. `ALTER TABLE <parent> DROP COLUMN <col>`
5. `CREATE VIEW <parent>_v` (rebuilt without the column)

If no data needs preserving, accept the auto-generated migration as-is.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Lets sub-plugins attach typed DB fields to a parent's entity table via 1:1 side-tables. Each consumer owns its <parent>_ext_<name> table; FK CASCADE on parent delete.
- Load-bearing: yes
- Server:
  - Uses: `database.db`
  - DB schema: `plugins/infra/plugins/entity-extensions/server/internal/define-extension.ts`
  - Exports (types):
    - `EntityExtension`
    - `ExtensionIndexBuilders`
    - `ExtensionMeta`
  - Exports (values):
    - `defineExtension`
    - `EntityExtensions`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/health`
    - `apps/pages/agent-origin`
    - `apps/pages/starred`
    - `apps/sonata/playback-history`
    - `apps/sonata/rich/key-mode`
    - `apps/sonata/rich/rhythm-controls`
    - `apps/sonata/sources/chord-grid`
    - `apps/sonata/sources/midi`
    - `apps/sonata/sources/ultimate-guitar`
    - `apps/sonata/transpose`
    - `apps/story/marker`
    - `conversations/conversation-category`
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

<!-- AUTOGENERATED:END -->
