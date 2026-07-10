# view-order

Per-view-instance manual row order for **every** DataView — the Notion model:
manual order is the default, applying a sort overrides it, clearing the sort
restores it. No per-consumer wiring, no opt-in flag.

**A row order is a property of the view instance, not of the data.** The key is
`(dataViewId, viewId, rowKey)`: two view instances of the same surface hold two
different orders, and a `+`-created view can be arranged independently. That is
why this lives in the primitive rather than in each consumer's own rank column
(the pre-existing `DataViewProps.manualOrder` seam, which a consumer owning a
domain rank still uses and which still outranks this contributor).

**Dependency direction: this child imports the parent (`view-order → data-view`),
never the reverse.** It contributes itself into the global
`DataViewSlots.RowOrder` slot; the host names no contributor. Structurally the
twin of `custom-columns` — a data-view child owning a generic DB table + push live
resource + one endpoint, injected back through a global slot.

## Model

- `data_view_row_order(data_view_id, view_id, row_key) → rank` (PK on the triple,
  index `dvro_view_idx` on the pair). `rank` is `rank_text` (C collation), the
  repo's fractional-index column type.
- `rowOrderResource` — push-mode, keyed `{ dataViewId, viewId }`, emitting
  `{ rowKey, rank }[]` rank-ascending. The loader reads the table, so the **L4 DB
  change-feed** recomputes it on every write; no notify / `dependsOn`.
- `POST /api/data-view/row-order` — the single endpoint. Body carries the view's
  **complete** post-move ordered key set.

## The seeding rule (the crux)

A row with no persisted rank yields `getRank → null`, which makes it undraggable
and produces a *mixed* section that `orderSectionsByRank` leaves under-specified
(its comparator returns `0` for any null pair). So `seedRanks` synthesizes a
**total** order: persisted ranks verbatim, then every unpersisted key appended
after `max(persisted)` **in source order**. Display-only — a seed is never written
as-is.

### Why every write is a full replace

The naive incremental rule (persist only the moved row; re-seed the rest each
render) is **unstable**:

> Rows A, B, C, none persisted → seeds `sA < sB < sC`. The user drags C between A
> and B, and we persist only `C → r1` with `sA < r1 < sB`. On the next render A
> and B are *still* unpersisted, so they re-seed after `max(persisted) = r1` —
> and the display becomes **C, A, B**, not the **A, C, B** the user dropped.
> Seeding at the top fails symmetrically. The root cause is re-deriving an
> un-moved row's rank against an anchor the move itself displaced.

So `onMove` rebuilds the whole key sequence (`applyMove`: remove `id`, re-insert
adjacent to `targetId`) and POSTs it; the server drops every `(dvid, viewId)` row
absent from that array and regenerates dense ranks for the rest. After any move
**every row in the ordered set is persisted in the same write**, so no un-moved
row is ever re-seeded against the row that moved. `order-ops.test.ts` pins the
counterexample above (and asserts the naive rule's `C, A, B` flip, so the
regression can't creep back in silently).

`Rank.nBetween(null, null, k)` is deterministic — the k-th rank of a k-element
order is always the same key — so the upsert only *changes* the rows whose
position actually moved. Do not swap it for delete-then-reinsert-everything: that
would rewrite every rank and push a full-list change-feed diff on every drag.

### Why neighbour coordinates, not `dest.rank`

`ManualOrderConfig.onMove` carries both. `RankReorderProvider` computes
`dest.rank` against the **rendered** items, which under an active search are a
*subset* of the ordered set — a rank between two visible neighbours can land on
the wrong side of a hidden row. Re-inserting next to `dest.targetId` in the full
ordered key list is the correct global semantics and needs no client-side rank
arithmetic.

### Why the ordered set is filter-applied and search-excluded

The host hands this contributor `useFlatRows(rows, fields, { …state, sort: [],
query: "" })`. That removes the "reordering a subset" problem entirely:

- Rows the view **filters out** never receive a rank. No thousands-of-rows write;
  a row that later enters the filter has no entry and seeds to the end.
- **Search** only affects what is *rendered*, never the ordered set. A drag under
  an active search still rebuilds the full order (both `id` and `targetId` are
  members), so the moved row lands adjacent to its target globally and no hidden
  row is deleted. One write path — no `scopeComplete` flag, no fallback endpoint.
- Editing the view's filter changes the ordered set; the next drag's replace
  self-GCs the rows that left.

**Cost — and the one place it bites.** One drag writes `O(|ordered set|)` rows, and
the live resource then carries that whole set to every client with the view open.
Measured on `tasks-list`'s unfiltered "Recent" view: a single drag persisted **3666
rows**.

The old `DataViewProps.manualOrder` seam dodged this by being opt-in — a consumer
only wired it up for a list it knew was bounded. Making the order the *default* for
every `list`/`table` view removes that filter, so the write scales with whatever the
view happens to show. A view with a narrow `filter` stays cheap (only rows surviving
the filter are ever ranked); an unfiltered view over a big table does not.

This is an accepted cost of the always-on model, **not** a bug — the full replace is
exactly what makes the order stable (see above). If it ever bites, the two exits are:
refuse to contribute an order past a size threshold (the contributor returns `null`,
drag silently disabled — "manual order targets bounded lists", as `rank-reorder`
always documented), or collapse storage to one compact array row per
`(dataViewId, viewId)`. Neither changes the seeding rule.

## Row keys

`rowKey(row, 0)` is called with a **constant index**, because `FieldDef.value`
gets no index. A surface whose row keys are index-derived therefore cannot persist
an order (its keys would shift under the very reorder they encode). This is the
identical documented edge case as `custom-columns`; every DataView in the repo
passes an id-derived `rowKey`.

While the live resource is `pending` the contributor renders `render(null)` — an
empty `persisted` map is indistinguishable from "never reordered", and seeding
from it would show pure source order and let a drag persist that as if it were the
user's arrangement.

## Retention

`data_view_row_order` is keyed by an opaque `rowKey` string, not an FK, so a DB
cascade is impossible: a deleted row leaves a stale order entry. There is
**deliberately no sweep** — neither `defineRetention` nor `markFirehose` — for the
same reason `data_view_custom_values` has none: the table is bounded by rows a
user actually dragged, not by a firehose, and ours additionally **self-GCs on the
next reorder** (the full replace deletes every key absent from the new order).

The durable fix is a **generic data-view row GC**, which this primitive cannot
build alone (it cannot enumerate live `rowKey`s across arbitrary consumers — that
needs a way for a consumer to publish its live key set). Filed as a follow-up
task, not a blocker.

## Tests

- `core/internal/order-ops.test.ts` (bun:test, pure) — `seedRanks` / `applyMove`,
  including the stability counterexample. `bun test plugins/primitives/plugins/data-view/plugins/view-order/core`
- `server/internal/handle-set-row-order.test.ts` (bun:test, real DB via
  `db-test-fixture` + the real migration chain) — delete-not-in-order, dense
  deterministic re-rank, C-collation ordering, duplicate rejection, per-`viewId`
  scoping. Requires the running embedded cluster and the applied migration
  (`./singularity build` first).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Per-view-instance manual row order for any DataView: subscribes to the persisted (dataViewId, viewId) ranks, synthesizes a total order, and contributes the resulting ManualOrderConfig back through data-view's global RowOrder slot. Persists a per-view-instance manual row order keyed by (dataViewId, viewId, rowKey): a generic DB table, a push live resource, and a full-replace reorder endpoint that regenerates dense ranks and self-GCs the rows that left the view's ordered set.
- Web:
  - Contributes: `DataViewSlots.RowOrder` "view-order" → `RowOrderContribution`
  - Uses: `infra/endpoints.useEndpointMutation`, `primitives/data-view.DataViewSlots`, `primitives/latest-ref.useEventCallback`, `primitives/live-state.useResource`
  - Exports: Types: `RowOrderState`; Values: `useRowOrder`, `useSetRowOrder`
- Server:
  - Uses: `database.db`, `infra/endpoints.implement`, `primitives/rank.rankText`
  - DB schema: `plugins/primitives/plugins/data-view/plugins/view-order/server/internal/tables.ts`
  - Exports: Values: `_dataViewRowOrder`, `applyRowOrder`, `rowOrderLiveResource`
  - Routes: `POST /api/data-view/row-order`
- Core:
  - Uses: `infra/endpoints.defineEndpoint`, `primitives/live-state.resourceDescriptor`, `primitives/rank.Rank`, `primitives/rank.RankSchema`
  - Exports: Types: `RowOrderRow`, `SetRowOrderBody`; Values: `applyMove`, `rowOrderResource`, `RowOrderRowSchema`, `seedRanks`, `setRowOrder`, `SetRowOrderBodySchema`

<!-- AUTOGENERATED:END -->
