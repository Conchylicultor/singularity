# query-resource

A declarative SQL-query → keyed-live-state compiler: ONE constrained drizzle
declaration derives the FULL loader, the Layer-2 scoped loader, the `identityTable`
(hand-authored elsewhere, and free to drift from what the loader actually reads), and
the client keyField — producing exactly the object the existing two-arg
`defineResource(descriptor, ServerResourceOptions & ScopePolicy)` already accepts.
**Zero changes to `resource-runtime`.**

```ts
// shared/core (web-safe descriptor — NO drizzle):
export const browserBookmarksResource = queryResourceDescriptor(
  "browser-bookmarks", BookmarkRowSchema, "id");

// server:
export const browserBookmarksServerResource = queryResource(browserBookmarksResource, {
  from: _browserBookmarks,                   // PgTable | PgView | Entity
  orderBy: asc(_browserBookmarks.createdAt),
  scopedMembership: true,                    // INSERT/DELETE ship incremental deltas (§ scopedMembership)
});
```

> `where` (and mutable-column filtering) is covered in the RULE section below.
> The former `notifications` example moved to `windowQueryResource` (last section).

## What it derives

1. **Identity.** `Entity` → base = `entity.name`, pk = its table's single primary,
   projection = `wireColumns`; `PgTable` → base = its table name, pk = its single
   primary, select-all; `PgView` → **requires** `identity.pk` + `identity.table`
   (matching the view's `View({ view, identityTable })` declaration), because a
   view has no PK metadata and its identity base cannot be derived at module eval
   — before the boot-time contribution collection that populates
   `relationIdentityBase`. A composite / missing PK with no `identity.pk` override
   throws; such a resource stays on a plain push `defineResource`.
2. **keyField.** The wire field the client `keyOf` reads: the projection key whose
   column matches the pk (matched by DB column *name*, so an aliased projection
   `{ conversationId: table.parentId }` keys on the alias), else the pk's JS
   property name. Throws if the pk is not projected, or if the descriptor's
   `queryPk` disagrees with it.
3. **FULL loader.** `select(map).from(rel)[.where][.orderBy][.limit]`.
4. **Scoped loader.** The same select/where composed with
   `and(where, pk IN (affectedIds))` and **no orderBy/limit** — a partial refill
   of only the changed rows. Fires only under the `identityTable` policy.
5. **ScopePolicy.** `{ identityTable }` by default; `{ recompute: {kind:"full"} }`
   when `spec.recompute` is set. Never both, never neither.

## Keyed-only, and why push is excluded

The compiler emits **keyed resources only**: a push loader that ignored
`ctx.affectedIds` would broadcast a partial (scoped) array as the whole value,
corrupting every subscriber's snapshot. Keyed-ness comes solely from the client
descriptor (`queryResourceDescriptor` → `keyedResourceDescriptor`), so the scope
policy is mandatory by construction; push/invalidate resources keep plain
`defineResource`.

## The `recompute: {full}` escape hatch (K/full)

Windowed reads (`orderBy … LIMIT N`) can't be scoped: a row entering or leaving the
window is a *membership* change a per-id refill can't express, and a scoped refill
of an out-of-window row would corrupt the snapshot. Declare
`recompute: { kind: "full", reason }` — the loader always runs the FULL query and
ignores `ctx.affectedIds`, while still gaining Layer-1 keyed row diffing.

## RULE: a mutable-column `where` requires `scopedMembership` or `recompute:{full}`

**`where` + the plain `identityTable` scoping is sound only when every column the
`where` reads is immutable post-insert.** The scoped refill runs
`and(where, pk IN affectedIds)`, but `diffKeyedScoped` **never emits deletes** (a
scoped notify never asserts membership) — so an UPDATE that flips a row out of the
`where` merges nothing, and the excluded row sits **stale in every client
snapshot** until the next FULL recompute. A correctness bug, not a staleness nit;
column mutability is not statically detectable, so this rule is checked at review
time:

- `where` on **immutable** columns (a parent FK like `threadId`, a fixed `type`
  discriminator, anything never UPDATEd) → plain K/scoped is fine.
- `where` on a **mutable** column (`dismissed`, a status, any flag a mutation
  flips) → declare EITHER **`scopedMembership: true`** (M5, preferred for a
  non-windowed scan: the flip is detected as a membership **exit** and shipped as
  a real delete + `order`, so the row leaves incrementally — see the next
  section) OR **`recompute: { kind: "full", reason: "where-filtered membership:
  …" }`** (the fallback for windowed reads, which cannot membership-scope; the
  FULL loader's `diffKeyedFull` ships the disappearance as a per-row delete,
  while in-place flips still ship as single-row upserts).
- No `where` at all → membership only changes via INSERT/DELETE. Without
  `scopedMembership` the feed delivers those as FULL (`op: "I" | "D"`); with it
  they ship incrementally. Either is correct.

## `scopedMembership: true` — incremental membership (M5)

Opt a **non-windowed** keyed scan into row-level membership scoping so an
INSERT / DELETE / where-flip no longer forces a FULL recompute. The compiler
derives, alongside the FULL + scoped loaders, an **`orderOf`** query — the
ids-only `select(pk).from(rel)[.where][.orderBy]` (**never a limit**) — and emits
`scopedMembership: { orderOf }` into `serverOpts`. The runtime reconciles each
flush's changed ids against the per-pk snapshot (delete / where-flip exit → delete
+ `order` derived from the in-memory snapshot; entry → upsert + `order` with
`orderOf` run exactly once; in-place flip → one upsert, no `order`): see the
runtime section in `plugins/framework/plugins/resource-runtime/CLAUDE.md`. Cost
model: `orderOf` runs **only when a row enters** membership, so the common
status-flip path issues no extra query.

`scopedMembership` cannot combine with `limit` (a windowed read cannot
membership-scope) or `recompute` (the opposite policy — no `identityTable`): loud
throw in `compileQuery`. Absent ⇒ byte-identical to pre-M5. Design:
`research/2026-07-03-global-scoped-membership-m5.md`.

## Bounded membership: `windowQueryResource` (window / point)

> **DEFAULT for new resources.** A NEW DB-backed collection resource is declared with
> `windowQueryResource` (window or point membership) — the unbounded `queryResource` form and
> hand-written unbounded keyed/push collections above are **legacy pending migration**; do not
> use them as precedent for new work. Reach for plain `queryResource` only for a set that is
> provably small and bounded by the domain itself (and say why in a comment). Migration state +
> rationale: `research/2026-07-18-global-bounded-working-set-resource-contract.md`.

The bounded-working-set sibling of `queryResource`: the subscription's params tuple
names a **bounded selector**, so a change costs O(changed) + O(window), never
O(collection), and the value is never the whole table. Two kinds, one compiler —
exactly ONE of `window` / `point` per spec, matching the descriptor factory:

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

// web: useWindowResource(pushesResource) → El[] at the default window;
//      usePointResource(categoriesResource, convId) → El | null, O(1), no .find()
```

What the compiler derives per kind:

- **window** — the windowed FULL loader (`where → ORDER BY → LIMIT`, the limit
  decoded from the params via the descriptor codec and clamped to `maxLimit`),
  the Layer-2 scoped refill (`pk IN affectedIds`, no order/limit), `windowIdsOf`
  (the ids-only windowed query — same where/order/limit as the loader, so the
  membership authority cannot drift from it), and `orderSignatureOf`, emitted as
  `membership: { kind: "window", windowIdsOf, orderSignatureOf }`. `orderBy` is
  `{ col, dir }` pairs, not raw SQL: the compiler appends the pk tiebreaker (a
  window must be a prefix of a strict total order) and renders explicit
  `NULLS LAST`, and a future cursor derives its keyset seek
  (`primitives/keyset`) from the same keys.
- **point** — the loader as a scoped read over `ctx?.affectedIds ??
  point.decode(params)` (an empty set short-circuits to `[]`, no query),
  emitted as `membership: { kind: "point", idsOf: point.decode }`. `point.by`
  **is** the identity pk — the change-feed routes by intersecting changed
  identity ids with each tuple's set, so any other column could never
  intersect (declaring both `identity.pk` and a different `by` throws).

**Order-column updates are HANDLED.** `orderSignatureOf` is the canonical join of
the declared order columns' wire values (the auto pk tiebreaker is excluded; every
declared order column must be projected, or module eval throws). The runtime
compares it per refilled member row and re-derives the window via `windowIdsOf`
when it moved, so a `createdAt` resurface reorders the wire window instead of
leaving it stale. **Cost note:** each order-column update costs one O(window) ids
query (content-only updates stay on the zero-ids-query in-place path), so prefer
mostly-stable order columns for very hot rows. The mutable-`where` rule above does
NOT apply here: a where-flip is a detected membership exit/entry.

Structural differences from `queryResource`: no `limit` / `recompute` /
`scopedMembership` fields exist on the spec (the bound comes from the params;
membership is always incremental); bounded resources are never L2-persisted
(runtime-enforced), so a `bootCritical` window loads via boot-snapshot's
fallback loader at the descriptor's `defaultParams` — the identical tuple
`useWindowResource` subscribes to. `defaultLimit` lives ONLY on the descriptor
(the client default and the boot default must be one number); the spec carries
only `maxLimit`. Every misuse (window+point, missing `orderBy`,
`defaultLimit > maxLimit`, kind/descriptor drift, `point.by` ≠ identity pk,
`queryPk` ≠ derived keyField) throws at module eval — a bad spec is a boot crash,
never a silent misbehavior.

## Ordering-staleness caveat

A scoped keyed delta omits `order` (in-place row upserts only, never
membership/order), so a scoped update that moves a row's sort position leaves it
**in place** until the next FULL recompute reships `order` — an accepted trade-off:
a status/title flip ships one row, not the whole ordered list.

## `rel()` cascade edges (load-bearing)

`rel(upstream, hops, { signature? })` declares a cross-resource cascade: when
`upstream` notifies, the compiled edge's `affectedMap` chains `hops` to translate
changed upstream ids → this resource's changed ids. **Load-bearing:** the
tasks/attempts/agents cascade (the last hand-written `affectedMap` scoping in the
codebase) now rides these derived edges.

A **hop** (`{ via, from, to }`) is one join step — read `to` (distinct) from `via`
for every row whose `from` column is in the incoming id set. A single hop is a
plain FK translation (`rel(conversationsActive, { via: _conversations, from:
_conversations.id, to: _conversations.attemptId })` ⇒ `affectedMap = ids =>
selectDistinct({ v: attemptId }).from(_conversations).where(id IN ids)`); a hop
array chains one `selectDistinct` per hop, each hop's distinct `to` feeding the
next hop's `from IN (…)` (the agent-launches edge is two hops, `conv id → task id
→ launch id`). Ids are `String()`-coerced and **deduped between hops**; an **empty
hop short-circuits** the whole chain to `[]` with no further query — sound because
the runtime never calls `affectedMap` with an empty set, so an empty result can
only mean "no downstream rows".

Two ways to consume edges:

- **`queryResource({ …, edges: [rel(…)] })`** — folded into
  `serverOpts.dependsOn` for a fully-declarative resource (`tasksResource`).
- **`compileEdges([rel(…)], db?)`** — edges for a **hand-written**
  `defineResource` that keeps a bespoke loader but wants derived scoping
  (`attemptsResource`, `agentLaunchesResource`).

`opts.signature` is passed through verbatim to the `DependsOnEntry` — the
relevance gate that drops a cascade whose downstream-relevant upstream projection
is unchanged (e.g. a conversation's transient `waitingFor`/`updatedAt`, which the
tasks/attempts aggregates never read).

## The `db` seam

`spec.db` defaults to the real per-worktree drizzle `db` (a top-level static
import — the boundary system forbids inline `import()`), coerced once through a
minimal structural `QueryDb` facade; unit tests inject a fake. This works because
`@plugins/database/server` is **import-safe**: the pg pool (and its
`SINGULARITY_WORKTREE` requirement) is built lazily on the first real query, so
importing `db` never touches a worktree — no test env shim needed.

## Boundaries

- `core/` — `queryResourceDescriptor` + the `QueryResourceContract` type. Web-safe:
  **no drizzle** (bundled into the browser).
- `server/` — `queryResource`, `compileQuery`, `rel`, and the spec types. Owns all
  drizzle usage and the `identityTable`/keyField derivation.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Declarative SQL query→resource compiler: one drizzle-based declaration derives the loader, scoped loader, identityTable, and client keyOf for keyed live-state resources.
- Server:
  - Uses:
    - `database.db`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.SortKey`
  - Exports (types):
    - `CompiledQuery`
    - `Edge`
    - `EntitySource`
    - `Hop`
    - `QueryDb`
    - `QueryResourceSpec`
    - `QuerySource`
    - `SelectMap`
    - `WindowOrderKey`
    - `WindowQueryResourceSpec`
  - Exports (values):
    - `compileEdges`
    - `compileQuery`
    - `compileWindowQuery`
    - `queryResource`
    - `rel`
    - `windowQueryResource`
- Core:
  - Uses:
    - `primitives/live-state.keyedResourceDescriptor`
    - `primitives/live-state.pointResourceDescriptor`
    - `primitives/live-state.PointResourceDescriptor`
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.windowResourceDescriptor`
    - `primitives/live-state.WindowResourceDescriptor`
  - Exports (types):
    - `PointQueryResourceContract`
    - `QueryResourceContract`
    - `WindowQueryResourceContract`
  - Exports (values):
    - `pointQueryResourceDescriptor`
    - `queryResourceDescriptor`
    - `windowQueryResourceDescriptor`
- Cross-plugin:
  - Imported by:
    - `apps/browser/bookmarks`
    - `apps/deploy/health`
    - `apps/events/events-core`
    - `apps/mail/reading-pane`
    - `apps/pages/agent-origin`
    - `apps/pages/starred`
    - `apps/story/generation`
    - `build`
    - `conversations/agents`
    - `conversations/conversation-category`
    - `conversations/conversation-preprompt`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/notes`
    - `conversations/conversations-view/queue`
    - `page/prompt/link`
    - `plugin-meta/plugin-health`
    - `primitives/usage-rank`
    - `shell/notifications`
    - `tasks/auto-start`
    - `tasks/task-category`
    - `tasks/tasks-core`

<!-- AUTOGENERATED:END -->
