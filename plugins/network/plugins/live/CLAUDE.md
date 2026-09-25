# live

The unified live-resource API — design in
`research/2026-09-25-global-unified-live-resource-api.md` (grouping, preload and
the base `where`: `research/2026-09-25-global-live-bell-filter-groupby-preload.md`).
**The default for a new DB-backed collection.**

## Usage

```ts
// core/ (browser-safe) — declare once
export const eventSources = liveCollection("events.sources", {
  row: EventSourceSchema,                // a zod OBJECT — its keys are the projection
  id: "id",
  filterable: { status: z.enum(SOURCE_STATUSES), enabled: z.boolean() },
  sortable: ["createdAt", "name"],
  default: { orderBy: [["createdAt", "desc"]], limit: 100 },
  maxLimit: 500,
  preload: "none",                       // or "boot" — see Declare
});

// server/ — serve it; spread all three Resource.Declare entries
export const eventSourcesServed = serveCollection(eventSources, {
  from: _eventSources,
  // where: eq(t.dismissed, false)       — optional base membership (see Serve)
});
// contributions: [...eventSourcesServed.declare]

// web/ — read it
useLive(eventSources);                                                // default window
useLive(eventSources, { where: { enabled: true }, orderBy: [["name", "asc"]], limit: 50 });
useLive(eventSources, { groupBy: "status", where: { enabled: true } }); // values + counts
useLive(eventSources, { ids: visibleIds });                           // point set
useLiveRow(eventSources, sourceId);                                   // one row
```

- **Declare.** The key is a positional string literal (the build scanners read it).
  One declaration mints three resources — `key` (window), `key:rows` (point) and
  `key:groups` (grouping) — and all three show in the docs. Bounded by
  construction: `default.limit` and `maxLimit` are required, a grouping returns
  at most `LIVE_LIST_MAX` (100) groups, and there is no unbounded spelling.
  `row` is a zod object schema: its keys are what the server projects.
- **Preload.** `preload: "boot"` marks the WINDOW descriptor `bootCritical`: the
  boot snapshot hydrates its default tuple (`defaultParams`) before first paint
  and the owning plugin is pinned to the eager tier. `:rows` and `:groups` are
  never preloaded — the server cannot know a tab's id sets or grouping queries
  at boot. Default `"none"`. The scanners read the flag through the resource
  vocabulary (`tooling/resource-vocabulary`: each factory names the field it
  spells its preload with, and each mint whether the flag reaches it).
- **Serve.** `serveCollection(c, { from, where?, columns? })` binds every ROW
  field to a column of `from` (a `PgTable`, or an Entity's wire columns) BY
  PROPERTY NAME — type-checked: a field that is not a column fails in `tsc` until
  it is given in `columns: { name: table.col }` (and throws at module eval if it
  still binds nowhere).
  - **The projection is derived from the row schema**: exactly its keys, so a
    server-only column (a dedup key, a secret) can never reach the wire.
  - **`where`** is the collection's base membership — the collection IS the rows
    of `from` matching it. It is ANDed into the window, the `:rows` point reads
    and every grouping. A mutable column is fine: a flip is a membership exit for
    a window tuple and a point tuple (the point refill omits the id), and a
    recount for the groups.
  - The window and `:rows` compile through `windowQueryResource`: the window
    decodes `where` / `order` per subscription tuple (filters through the op
    table's SQL half, over the column RENDERED as SQL, never the column object)
    with every sortable column in the order signature; the point sibling is
    `point: { by: <id column> }` with no client filter.
  - `:groups` is a plain (non-keyed) push value per grouping tuple, served by
    `defineResource(desc, { mode: "push", loader })`: `SELECT col AS value,
    count(*) … WHERE <base> AND <where> GROUP BY col ORDER BY count(*) DESC, col
    NULLS LAST LIMIT n`. It declares no scope policy: its read-set (captured
    automatically at the DB pool chokepoint) routes a table change as a FULL
    recompute of every subscribed grouping tuple, and push mode drops a
    byte-identical result. Each value is checked against its column's own
    filterable schema, so a value no filter could name fails loudly.
  - The served object exposes `window`, `rows`, `groups`, `keys` (all three
    minted keys — for anything that must know every reader of the table) and
    `declare`. `compileCollection` is the same derivation without registering
    (for tests), and also returns the derived `select`.
  - Hand-written loaders are out of scope for now — keep those on
    `windowQueryResource` / `defineResource`.
- **Read — `useLive(c, query?)`.** The query's SHAPE picks the resource; there is
  one hook for every list read, and a separate hook only where the result has
  different STATES (`useLiveRow`).
  - A window query returns `ResourceResult<Row[]>` whose settled arm adds
    `canGrow` (`rows.length === limit && limit < maxLimit`), `growing` and
    `loadMore()` (grow by one default page, clamped to `maxLimit`). While a grown
    window loads the hook stays SETTLED on the previous rows (`growing: true`) —
    the previous tuple stays subscribed only for that moment — so `if (pending)`
    never flashes over a list that already rendered. Each grow step is a new
    tuple; that is fine up to `maxLimit`.
  - A **grouping** — `{ groupBy, where?, limit? }` — returns the same
    `LiveListResult`, of `{ value: V | null; count: number }`. `groupBy` is any
    declared filterable column (typed `keyof F`), and `V` is that column's
    operand type. Groups are ordered count descending, then value (code-point
    order); NULL is its own group, selected with `{ isNull: true }`. `orderBy` is
    a type error (the order is fixed). Default limit 50, max `LIVE_LIST_MAX`;
    `canGrow` / `loadMore()` page through groups exactly like rows. `where`
    applies as given — to keep every chip visible while one is picked, leave the
    grouped column out of it.
  - An `{ ids }` query reads the point sibling: `ResourceResult<Row[]>`, no
    paging fields.
  - Every query is identified by its canonical encoding, so inline object
    literals are fine.
- **Read — `useLiveRow(c, id)`.** `{ pending: true; error; stale? } |
  { pending: false; found: true; row } | { pending: false; found: false }`.
  A point read: it ignores every client filter and window bound (the base
  `where` still applies — a row outside the collection is not found), so
  `found: false` means the row is not in the collection — never "outside the
  window". A nullable id is not supported yet (it needs an `enabled` option on
  `useResource`).
- `useLive` is on `live-state/no-pending-data-collapse`'s watched list;
  `useLiveRow` has no `data` to collapse.

## Internals

- `core/` (browser-safe): `liveCollection(key, { row, id, filterable, sortable, default, maxLimit, preload? })`
  mints three resources from one declaration — `key` (window membership),
  `` `${key}:rows` `` (point membership) and `` `${key}:groups` `` (a plain push
  value; one wire schema for every column's values — any scalar or NULL — with
  the per-column check done by the server). The window descriptor carries the
  query codec: `window.encode(query)` → wire params, `window.decode(params)` →
  `{ limit, where, orderBy }`; the groups descriptor carries `groups.encode` /
  `groups.decode` (`{ groupBy, limit, where }`). `rowKeys` is the row schema's
  keys.
- The filter language (`LiveWhere`) is AND across declared columns; each column
  takes a plain value (= `eq`) or exactly one of `eq ne in notIn gt gte lt lte isNull`.
  No OR, no time-relative ops, `in`/`notIn` capped at 100.
- The op table is split by runtime but paired by type: `core/` holds each op's
  operand kind and in-memory `test`, `server/` holds its `sql(target, operand)`
  keyed by the same `LiveOpId` (a missing or extra op is a tsc error). Null
  semantics are Postgres's: a NULL value fails every op but `isNull`.
  `server/internal/op-parity.test.ts` runs every op both ways against a real
  Postgres and asserts identical answers.
- String ordering is code-point order in memory; in SQL it is the cluster's
  collation, which is `C` (initdb `--no-locale`) — the parity suite pins it, and
  the groups' value tiebreak relies on it.

## Wire params

- Window: `{ limit: string; where?: string; order?: string }` — `where` / `order`
  are canonical JSON present only when they differ from the default, so the
  default window stays byte-identical `{ limit: "100" }`.
- Groups: `{ groupBy: string; limit: string; where?: string }` — `where` is the
  window's canonical JSON, present only when non-empty.
- Decode is STRICT for both: it re-encodes and throws unless the input was
  already canonical, so one logical query can never name two subscriptions.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, or an explicit id set) and useLiveRow (one row: pending, found, or determinately absent). Unified live-resource API, server half: serveCollection (binds a liveCollection's row fields to a table's columns — the projection is exactly the row schema — ANDs an optional base `where` into every read, and compiles its window + `:rows` point resources through windowQueryResource and its `:groups` GROUP BY push value) and the filter op table's SQL side (liveOpSql / liveClauseSql), paired with core's op ids by type.
- Web:
  - Uses:
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.usePointResource`
    - `primitives/live-state.useResource`
  - Exports (types):
    - `LiveIdsQuery`
    - `LiveListResult`
    - `LivePaging`
    - `LiveRowResult`
  - Exports (values):
    - `useLive`
    - `useLiveRow`
- Server:
  - Uses:
    - `database.db`
    - `infra/query-resource.EntitySource`
    - `infra/query-resource.QueryDb`
    - `infra/query-resource.SelectMap`
    - `infra/query-resource.WindowOrderKey`
    - `infra/query-resource.windowQueryResource`
    - `infra/query-resource.WindowQueryResourceSpec`
  - Exports (types):
    - `CollectionSource`
    - `CollectionSpecs`
    - `ServeCollectionOptions`
    - `ServedCollection`
  - Exports (values):
    - `compileCollection`
    - `liveClauseSql`
    - `liveOpSql`
    - `serveCollection`
- Core:
  - Uses:
    - `infra/query-resource.PointQueryResourceContract`
    - `infra/query-resource.pointQueryResourceDescriptor`
    - `infra/query-resource.WindowQueryResourceContract`
    - `infra/query-resource.windowQueryResourceDescriptor`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/live-state.ResourceDescriptor`
  - Exports (types):
    - `LiveClause`
    - `LiveCollection`
    - `LiveCollectionSpec`
    - `LiveColumnFilter`
    - `LiveDecodedGroupQuery`
    - `LiveDecodedQuery`
    - `LiveFilterable`
    - `LiveGroup`
    - `LiveGroupCodec`
    - `LiveGroupParams`
    - `LiveGroupQuery`
    - `LiveGroupsDescriptor`
    - `LiveGroupValue`
    - `LiveOperands`
    - `LiveOpId`
    - `LiveOrderBy`
    - `LivePreload`
    - `LiveQuery`
    - `LiveRowSchema`
    - `LiveScalar`
    - `LiveSortDirection`
    - `LiveWhere`
    - `LiveWindowCodec`
    - `LiveWindowDescriptor`
    - `LiveWindowParams`
  - Exports (values):
    - `compareScalars`
    - `LIVE_LIST_MAX`
    - `liveCollection`
    - `liveOps`
    - `matchesLiveWhere`
    - `testLiveClause`
- Cross-plugin:
  - Imported by:
    - `apps/events/events-core`
    - `apps/events/sources/source-field`
    - `shell/notifications`

<!-- AUTOGENERATED:END -->
