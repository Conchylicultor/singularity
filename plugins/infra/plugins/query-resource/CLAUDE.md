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
   has no PK metadata) **and** `identity.table` (matching the view's
   `View({ view, identityTable })` declaration) — the base cannot be derived
   here because `queryResource(...)` resolves at module eval, before the
   boot-time contribution collection that populates `relationIdentityBase`;
   a missing declaration is a **loud throw**. A composite / missing PK (with no
   `identity.pk` override) throws — such a resource stays on a plain push
   `defineResource`.
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
diffing. `buildHistoryResource` is the archetype.

## RULE: a mutable-column `where` requires `scopedMembership` or `recompute:{full}`

**`where` + the plain `identityTable` scoping is sound only when every column
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
  discriminator, anything never UPDATEd) → plain K/scoped is fine.
- `where` on a **mutable** column (`dismissed`, a status, any flag a mutation
  flips) → declare EITHER:
  - **`scopedMembership: true`** (M5, the preferred choice for a non-windowed
    scan): a where-flip is detected as a membership **exit** (the scoped refill
    fails to return a requested id) and shipped as a real delete + `order`, so
    the row leaves every client snapshot incrementally — no whole-list FULL. An
    INSERT enters via the derived `orderOf`; a plain field flip still ships one
    upsert. See the next section.
  - **`recompute: { kind: "full", reason: "where-filtered membership: …" }`** —
    the fallback for windowed reads (which cannot membership-scope). The FULL
    loader re-runs the whole query and `diffKeyedFull` ships the disappearance as
    a real per-row delete, while in-place flips still ship as single-row upserts.
- No `where` at all → membership only changes via INSERT/DELETE. Without
  `scopedMembership` the feed delivers those as FULL (`op: "I" | "D"`); with it
  they ship incrementally (see the next section). Either is correct.

`notificationsResource` (`where dismissed = false`, flipped by dismiss/dismiss-all)
is the archetype of the mutable case; it currently uses `recompute:{full}` and is
a candidate to migrate to `scopedMembership`. The `conversations-active` /
`conversations-system` scans (`where active = true`, `active` flipped when a
conversation ends) are the first `scopedMembership` adopters.

## `scopedMembership: true` — incremental membership (M5)

Opt a **non-windowed** keyed scan into row-level membership scoping so an
INSERT / DELETE / where-flip no longer forces a FULL recompute. The compiler
derives, alongside the FULL + scoped loaders, an **`orderOf`** query — the
ids-only `select(pk).from(rel)[.where][.orderBy]` (**never a limit**) — and emits
`scopedMembership: { orderOf }` into `serverOpts`. The runtime
(`resource-runtime`) reconciles each flush's changed ids against the per-pk
snapshot:

- **DELETE** → delete + new `order` (prior order minus the id), **zero DB
  queries** (no loader, no `orderOf` — the order comes from the in-memory
  snapshot).
- **where-flip exit** (UPDATE where the refill returns nothing for a requested
  id) → same delete + order shape, one scoped refill, no `orderOf`.
- **INSERT / where-flip entry** (a refilled id absent from the snapshot) → upsert
  + `order`; `orderOf` runs **exactly once** to place the entrant.
- **in-place field flip** → a single upsert, `order` omitted (identical to plain
  K/scoped).

`orderOf`'s cost model: it runs **only when a row enters** membership; exits and
in-place changes derive their order from the prior snapshot, so the common
status-flip path issues no extra query.

Incompatibilities (loud throw at module eval in `compileQuery`): `scopedMembership`
cannot combine with `limit` (a windowed read cannot membership-scope) or with
`recompute` (the opposite policy — `recompute:{full}` has no `identityTable`).
Absent ⇒ byte-identical to the pre-M5 FULL-on-membership-change behavior. See
`research/2026-07-03-global-scoped-membership-m5.md` and the runtime section in
`plugins/framework/plugins/resource-runtime/CLAUDE.md`.

## Bounded membership: `windowQueryResource` (window / point)

> **DEFAULT for new resources.** A NEW DB-backed collection resource is declared with
> `windowQueryResource` (window or point membership) — the unbounded `queryResource` form and
> hand-written unbounded keyed/push collections above are **legacy pending migration**; do not
> use them as precedent for new work. Reach for plain `queryResource` only for a set that is
> provably small and bounded by the domain itself (and say why in a comment). Migration state +
> rationale: `research/2026-07-18-global-bounded-working-set-resource-contract.md`.

The bounded-working-set sibling of `queryResource`
(`research/2026-07-18-global-bounded-working-set-resource-contract.md`): the
subscription's params tuple names a **bounded selector**, so a change costs
O(changed) + O(window), never O(collection), and the value is never the whole
table. Two kinds, one compiler — exactly ONE of `window` / `point` per spec,
matching the descriptor factory:

```ts
// shared/core — the descriptor carries the selector CODEC both sides share:
export const pushesResource = windowQueryResourceDescriptor(
  "pushes", PushSchema, "id", { defaultLimit: 100, bootCritical: true });
export const categoriesResource = pointQueryResourceDescriptor(
  "conversation-categories", CategorySchema, "conversationId");

// server:
windowQueryResource(pushesResource, {
  from: pushes,
  orderBy: { col: pushes.createdAt, dir: "desc" },  // order-column updates re-derive the window (cost note below)
  window: { maxLimit: 500 },
});
windowQueryResource(categoriesResource, {
  from: categories,
  select: { conversationId: categories.parentId, /* … */ },
  point: { by: categories.parentId },               // IS the identity pk
});

// web:
useWindowResource(pushesResource)              // El[] at the default window
usePointResource(categoriesResource, convId)   // El | null — O(1), no .find()
```

What the compiler derives per kind:

- **window** — the windowed FULL loader (`where → ORDER BY → LIMIT`, the limit
  decoded from the params via the descriptor codec and clamped to `maxLimit`),
  the Layer-2 scoped refill (`pk IN affectedIds`, no order/limit), and
  `windowIdsOf` (the ids-only windowed query — same where/order/limit as the
  loader, so the membership authority cannot drift from it), and
  `orderSignatureOf` (derived from the declared order columns — see the
  order-column note below), emitted as
  `membership: { kind: "window", windowIdsOf, orderSignatureOf }`. `orderBy` is
  `{ col, dir }` pairs, not raw
  SQL: the compiler appends the pk tiebreaker (a window must be a prefix of a
  strict total order) and renders explicit `NULLS LAST`, and a future cursor
  derives its keyset seek (`primitives/keyset`) from the same keys.
- **point** — the loader as a scoped read over `ctx?.affectedIds ??
  point.decode(params)` (an empty set short-circuits to `[]`, no query),
  emitted as `membership: { kind: "point", idsOf: point.decode }`. `point.by`
  **is** the identity pk — the change-feed routes by intersecting changed
  identity ids with each tuple's set, so any other column could never
  intersect (declaring both `identity.pk` and a different `by` throws).

**Order-column updates are HANDLED.** The compiler always derives an
`orderSignatureOf` for the window kind — the canonical join of the declared
order columns' wire values (the auto pk tiebreaker is excluded; every declared
order column must be projected, or module eval throws). The runtime compares it
per refilled member row and re-derives the window via `windowIdsOf` when it
moved, so an UPDATE that bumps an order column (a `createdAt` resurface)
reorders the wire window instead of leaving it stale. What remains of the old
update-stability rule is a **cost note**: each order-column update costs one
O(window) ids query (content-only updates stay on the zero-ids-query in-place
path), so prefer mostly-stable order columns for very hot rows. The
mutable-`where` rule above does NOT apply here either way: a where-flip is a
detected membership exit/entry.

Structural differences from `queryResource`: no `limit` / `recompute` /
`scopedMembership` fields exist on the spec (the bound comes from the params;
membership is always incremental); bounded resources are never L2-persisted
(runtime-enforced), so a `bootCritical` window loads via boot-snapshot's
fallback loader at the descriptor's `defaultParams` — the identical tuple
`useWindowResource` subscribes to. `defaultLimit` lives ONLY on the descriptor
(the client default and the boot default must be one number); the spec carries
only `maxLimit`, and `defaultLimit > maxLimit` throws at module eval. Misuse
(window+point, missing `orderBy`, kind/descriptor drift, `point.by` ≠
identity pk, `queryPk` ≠ derived keyField) all throw at module eval — a bad
spec is a boot crash, never a silent misbehavior.

## Ordering-staleness caveat

A scoped keyed delta omits `order` (it asserts only in-place row upserts, never
membership/order). So a scoped update that changes a row's sort position leaves
it **in place** until the next FULL recompute reships `order`. This is identical
to `conversationsActive` today and is an accepted trade-off — the payoff is that
a status/title flip on one row ships one row, not the whole ordered list.

## `rel()` cascade edges (load-bearing)

`rel(upstream, hops, { signature? })` declares a cross-resource cascade: when
`upstream` notifies, the compiled edge's `affectedMap` chains `hops` to translate
changed upstream ids → this resource's changed ids. **Load-bearing:** the
tasks/attempts/agents cascade (the last hand-written `affectedMap` scoping in the
codebase) now rides these derived edges.

A **hop** is one join step — read `to` (distinct) from `via` for every row whose
`from` column is in the incoming id set:

```ts
export interface Hop { via: PgTable | PgView; from: PgColumn; to: PgColumn }
```

- **Single-hop** (a plain FK translation) reproduces the old attempts↔conversations
  closure. `rel(conversationsActive, { via: _conversations, from: _conversations.id,
  to: _conversations.attemptId })` ⇒ `affectedMap = ids =>
  selectDistinct({ v: attemptId }).from(_conversations).where(id IN ids)`.
- **Multi-hop** (a hop array) chains one `selectDistinct` per hop, each hop's
  distinct `to` values feeding the next hop's `from IN (…)`. The agent-launches
  edge is two hops: `conv id → task id (conversations_v) → launch id
  (_agent_launches)` — collapsing the old conv→attempt→task→launch 3-table join
  because `conversations_v` already carries `taskId`.

Per-hop semantics: ids are `String()`-coerced and **deduped between hops**; an
**empty hop short-circuits** the whole chain to `[]` with no further query. That
short-circuit is sound because the runtime never calls `affectedMap` with an
empty set (it guards on the delivered affected set upstream), so an empty result
can only mean "no downstream rows".

Two ways to consume edges:

- **`queryResource({ …, edges: [rel(…)] })`** — the compiler folds them into
  `serverOpts.dependsOn` for a fully-declarative resource (`tasksResource`).
- **`compileEdges([rel(…)], db?)`** — compile edges for a **hand-written**
  `defineResource` that keeps a bespoke loader but wants derived scoping
  (`attemptsResource`'s nested-conversation loader, `agentLaunchesResource`'s
  rollup loader). `db` defaults to the real per-worktree drizzle `db`.

`opts.signature` is passed through verbatim to the `DependsOnEntry` — the
relevance gate that drops a cascade whose downstream-relevant upstream projection
is unchanged (e.g. a conversation's transient `waitingFor`/`updatedAt`, which the
tasks/attempts aggregates never read).

## The `db` seam

`spec.db` defaults to the real per-worktree drizzle `db` (a top-level static
import — the boundary system forbids inline `import()`), coerced once through a
minimal structural `QueryDb` facade. Unit tests always inject a fake `db`.
`@plugins/database/server` is **import-safe**: the pg pool (and its
`SINGULARITY_WORKTREE` requirement) is built lazily on the first real query, so
merely importing `db` and injecting a fake never touches a worktree — no test
env shim needed. `compile.test.ts` renders SQL via `new PgDialect().sqlToQuery(...)`;
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
  - Uses: `database.db`, `primitives/keyset.orderByClauses`, `primitives/keyset.SortKey`
  - Exports: Types: `CompiledQuery`, `Edge`, `EntitySource`, `Hop`, `QueryDb`, `QueryResourceSpec`, `QuerySource`, `SelectMap`, `WindowOrderKey`, `WindowQueryResourceSpec`; Values: `compileEdges`, `compileQuery`, `compileWindowQuery`, `queryResource`, `rel`, `windowQueryResource`
- Core:
  - Uses: `primitives/live-state.keyedResourceDescriptor`, `primitives/live-state.pointResourceDescriptor`, `primitives/live-state.PointResourceDescriptor`, `primitives/live-state.ResourceDescriptor`, `primitives/live-state.windowResourceDescriptor`, `primitives/live-state.WindowResourceDescriptor`
  - Exports: Types: `PointQueryResourceContract`, `QueryResourceContract`, `WindowQueryResourceContract`; Values: `pointQueryResourceDescriptor`, `queryResourceDescriptor`, `windowQueryResourceDescriptor`
- Cross-plugin:
  - Imported by: `apps/browser/bookmarks`, `apps/mail/reading-pane`, `apps/pages/starred`, `apps/story/generation`, `build`, `conversations/agents`, `conversations/conversation-category`, `conversations/conversation-progress`, `plugin-meta/plugin-health`, `shell/notifications`, `tasks/auto-start`, `tasks/tasks-core`

<!-- AUTOGENERATED:END -->
