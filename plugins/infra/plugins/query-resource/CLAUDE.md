# query-resource

A declarative SQL-query → keyed-live-state compiler. Most live-state resources
are SQL-shaped, yet each one hand-writes its loader, hand-authors its
`identityTable` string (which can drift from what the loader actually reads), and
either hand-rolls a scoped-recompute loader or silently FULL-recomputes on every
covered write. `query-resource` turns ONE constrained drizzle declaration into
the object the existing two-arg
`defineResource(descriptor, ServerResourceOptions & ScopePolicy)` already
accepts — deriving the FULL loader, the Layer-2 scoped loader, the
`identityTable`, and the client keyField from a single source. **Zero changes to
`resource-runtime`.**

```ts
// shared/core (web-safe descriptor — NO drizzle):
export const notificationsResource = queryResourceDescriptor(
  "notifications", NotificationSchema, "id", { bootCritical: true },
);

// server:
export const notificationsResource = queryResource(notificationsDescriptor, {
  from: notifications,                       // PgTable | PgView | Entity
  where: eq(notifications.dismissed, false),
  orderBy: desc(notifications.createdAt),
});
```

## What it derives

1. **Identity.** `Entity` → base table = `entity.name`, pk = the single primary
   of `getTableColumns(entity.table)`, default projection = `wireColumns`.
   `PgTable` → base = `getTableConfig(table).name`, pk = its single primary,
   default projection = select-all. `PgView` → **requires** `identity.pk` (a view
   has no PK metadata); base table = `identity.table` ?? `relationIdentityBase(viewName)`,
   with a **loud throw** when that leaves the view unresolved. A composite /
   missing PK (with no `identity.pk` override) throws — such a resource stays on a
   plain push `defineResource`.
2. **keyField.** The wire field the client `keyOf` reads. With a `select`
   projection it is the projection key whose column matches the pk (matched by
   DB column name, so an aliased projection — `{ conversationId: table.parentId }`
   — keys on the alias `"conversationId"`); without one, the pk's JS property
   name. Throws if the pk is not projected. `queryResource` asserts the
   descriptor's `queryPk` equals this keyField — a boot-time throw on drift.
3. **FULL loader.** `select(map).from(rel)[.where][.orderBy][.limit]`.
4. **Scoped loader.** The same select/where composed with
   `and(where, pk IN (affectedIds))` and **no orderBy/limit** — a partial refill
   of only the changed rows. Fires only under the `identityTable` policy.
5. **ScopePolicy.** `{ identityTable }` by default; `{ recompute: {kind:"full"} }`
   when `spec.recompute` is set. Never both, never neither.

## Keyed-only, and why push is excluded

The compiler emits **keyed resources only**. A push loader that ignored
`ctx.affectedIds` would broadcast a partial (scoped) array as the whole value —
corrupting every subscriber's snapshot. Keyed-ness comes solely from the client
descriptor (`queryResourceDescriptor` → `keyedResourceDescriptor`), so the scope
policy is mandatory by construction; push/invalidate resources keep plain
`defineResource`.

## The `recompute: {full}` escape hatch (K/full)

Windowed reads (`orderBy … LIMIT N`) can't be scoped: a row entering or leaving
the window is a *membership* change a per-id refill can't express, and a scoped
refill of an out-of-window row would corrupt the snapshot. Declare
`recompute: { kind: "full", reason }` — the loader then always runs the FULL
query and ignores `ctx.affectedIds`, while still gaining Layer-1 keyed row
diffing. `releaseHistoryResource` / `buildHistoryResource` are the archetype.

## RULE: a mutable-column `where` requires `recompute: {full}`

**`where` + the default `identityTable` scoping is sound only when every column
the `where` reads is immutable post-insert.** The scoped refill runs
`and(where, pk IN affectedIds)` and merges what comes back — but
`diffKeyedScoped` **never emits deletes** (a scoped notify never asserts
membership). So if an UPDATE flips a `where` column and the row stops matching,
the scoped query returns nothing for that id, nothing is merged, and the
now-excluded row sits **stale in every client snapshot** until the next FULL
recompute. This is a correctness bug, not a staleness nit.

The compiler cannot detect column mutability statically, so this is a declared
rule, checked at review time:

- `where` on **immutable** columns (a parent FK like `threadId`, a fixed `type`
  discriminator, anything never UPDATEd) → K/scoped is fine.
- `where` on a **mutable** column (`dismissed`, a status, any flag a mutation
  flips) → declare `recompute: { kind: "full", reason: "where-filtered
  membership: …" }`. The FULL loader re-runs the whole query and `diffKeyedFull`
  ships the disappearance as a real per-row delete — while in-place field flips
  still ship as single-row upserts (the Layer-1 win survives).
- No `where` at all → membership only changes via INSERT/DELETE, which the feed
  already delivers as FULL (`op: "I" | "D"`). K/scoped is safe.

`notificationsResource` (`where dismissed = false`, flipped by dismiss/dismiss-all)
is the archetype of the mutable case. M5 (opt-in scoped membership: DELETE then
INSERT semantics) may relax this.

## Ordering-staleness caveat

A scoped keyed delta omits `order` (it asserts only in-place row upserts, never
membership/order). So a scoped update that changes a row's sort position leaves
it **in place** until the next FULL recompute reships `order`. This is identical
to `conversationsActive` today and is an accepted trade-off — the payoff is that
a status/title flip on one row ships one row, not the whole ordered list.

## `rel()` cascade edges (compiled now, load-bearing in M4)

`rel(upstream, upstreamTable, { fk, upstreamPk }, { signature? })` declares a
cross-resource cascade: when `upstream` notifies, the edge's `affectedMap`
self-queries the FK column (`selectDistinct({ fk }).from(upstreamTable).where(pk
IN ids)`) to translate changed upstream ids → this resource's changed ids —
reproducing the hand-written attempts↔conversations closure. `edges` are compiled
into `dependsOn` today; the tasks/agents cascade migrates onto them in M4.

## The `db` seam

`spec.db` defaults to the real per-worktree drizzle `db` (a top-level static
import — the boundary system forbids inline `import()`), coerced once through a
minimal structural `QueryDb` facade. Unit tests always inject a fake `db`, but
`@plugins/database/server` still evaluates at import time and requires
`SINGULARITY_WORKTREE` — the test files import `./test-env` FIRST, which sets a
placeholder worktree name (the pg pool connects lazily, so no DB is touched).
`compile.test.ts` renders SQL via `new PgDialect().sqlToQuery(...)`;
`compile-runtime.test.ts` wires a compiled resource into a real
`createResourceRuntime` with a fake WS and drives `applyDbChange`.

## Boundaries

- `core/` — `queryResourceDescriptor` + the `QueryResourceContract` type. Web-safe:
  **no drizzle** (bundled into the browser).
- `server/` — `queryResource`, `compileQuery`, `rel`, and the spec types. Owns all
  drizzle usage and the `identityTable`/keyField derivation.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Declarative SQL query→resource compiler: one drizzle-based declaration derives the loader, scoped loader, identityTable, and client keyOf for keyed live-state resources.
- Server:
  - Uses: `database.db`, `database/derived-views.relationIdentityBase`
  - DB schema: `plugins/infra/plugins/query-resource/server/internal/compile-runtime.test.ts`, `plugins/infra/plugins/query-resource/server/internal/compile.test.ts`
  - Exports: Types: `CompiledQuery`, `Edge`, `EntitySource`, `QueryDb`, `QueryResourceSpec`, `QuerySource`, `SelectMap`; Values: `compileQuery`, `queryResource`, `rel`
- Core:
  - Uses: `primitives/live-state.keyedResourceDescriptor`, `primitives/live-state.ResourceDescriptor`
  - Exports: Types: `QueryResourceContract`; Values: `queryResourceDescriptor`
- Cross-plugin:
  - Imported by: `apps/browser/bookmarks`, `apps/mail/reading-pane`, `apps/pages/starred`, `apps/story/generation`, `build`, `conversations/conversation-category`, `conversations/conversation-progress`, `plugin-meta/plugin-health`, `release`, `shell/notifications`, `tasks/auto-start`

<!-- AUTOGENERATED:END -->
