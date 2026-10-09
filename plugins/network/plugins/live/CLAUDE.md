# live

The unified live-resource API — design in
`research/2026-09-25-global-unified-live-resource-api.md` (grouping, preload and
the base `where`: `research/2026-09-25-global-live-bell-filter-groupby-preload.md`;
the filter language: `research/2026-09-25-global-unified-filter-language.md`).
**The default for a new DB-backed collection, and for a new value.**

## Usage

```ts
// core/ (browser-safe) — declare once
export const eventSources = liveCollection("events.sources", {
  row: EventSourceSchema,                // a zod OBJECT — its keys are the projection
  id: "id",
  filterable: { status: liveText(SourceStatusSchema), enabled: liveBoolean() },  // domain constructors
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
useLive(eventSources, { where: or({ column: "status", op: "eq", operand: "error" },
                                  { column: "enabled", op: "eq", operand: false }) }); // a Filter tree
useLive(eventSources, { groupBy: "status", where: { enabled: true } }); // values + counts
useLive(eventSources, { count: true, where: { enabled: true } });     // a total (declared `count: true`)
useLive(eventSources, { ids: visibleIds });                           // point set
useLiveRow(eventSources, sourceId);                                   // one row (a null id: not found)

// the whole ordered set, for a set its readers need entire (see `all` below)
export const graphNodes = liveCollection("graph.nodes", {
  row: GraphNodeSchema,
  id: "id",
  all: { orderBy: [["createdAt", "asc"]], unbounded: { reason: "the graph view lays out every node" } },
  preload: "boot",
});
useLive(graphNodes);                                                  // every row, in order
useLive(graphNodes, { select: countNodes });                          // a slice of it (a stable selector)
```

- **Totals (`count: true`).** A window collection may declare `count: true`
  — its author's statement that a COUNT over it is cheap enough to keep live
  (recomputed on every write to a table it reads; leave it off a large or
  write-hot table). It mints `key:count`, read with `useLive(c, { count:
  true, where? })`. A DataView listing the collection as a live `source` reads
  it over the source's scope (never under a view filter or search) and shows
  exact section counts instead of "N+" before every page is loaded. Not on a
  union collection yet (a declaration error beside `arms`).
- **Declare.** The key is a positional string literal (the build scanners read it).
  One declaration mints three resources — `key` (window), `key:rows` (point) and
  `key:groups` (grouping) — and all three show in the docs; declared
  `count: true`, a fourth, `key:count` (see *Totals* below). Bounded by
  construction: `default.limit` and `maxLimit` are required, and a grouping returns
  at most the filter language's `LIST_MAX` (100) groups. The one unbounded
  spelling is a separate form, `all` (below), which must state its
  `unbounded: { reason }`. `row` is a zod object schema: its keys are what the server
  projects. `filterable` maps row fields to the filter language's DOMAIN
  constructors (`liveText(Schema)`, `liveNumber()`, `liveBoolean()`,
  `liveInstant()`, `liveStringArray()`); the domain must fit the row field's
  type (tsc), and `and` / `or` / `column` / `op` / `operand` cannot be column
  names (they spell a filter tree). As for a `liveValue`, a window, id set or
  grouping not loaded yet is `pending`, never `[]`.
- **Lookup-only.** Declared WITHOUT `default` — `liveCollection(key, { row, id })`
  — a collection mints `key:rows` alone: a table whose rows are only ever read by
  id (one row per mounted block: `todo-block-task`, `page-block-doc`). Every
  window field (`filterable`, `sortable`, `maxLimit`) and `preload` is `never`
  there (an id set has no default tuple), and a stray one from an untyped caller
  throws. It is `LiveLookupCollection<Row>`; `useLiveRow` and `useLive(c, { ids })`
  take it (they take `LiveRowsCollection<Row>`, the part every collection has),
  while a list read — `useLive(c)`, `{ where }`, `{ groupBy }` — is a tsc error.
  `serveCollection` compiles and registers only the point resource and returns
  `ServedLookupCollection` (`rows`, `keys: [key:rows]`, a one-entry `declare`).
  Its `:rows` point routing is what "subscribe to one row of a table" means: a
  change to row R reaches only the tuples whose id set holds R. Prefer it to a
  param'd value over a one-row table (`oneRow` routing was rejected — see
  `research/2026-09-26-global-live-values-migration-contract.md` §10).
- **The whole ordered set — `all`.** Declared with `all: { orderBy,
  unbounded: { reason } }` and no window field —
  `liveCollection(key, { row, id, all, preload? })` — a collection holds EVERY
  row, in `orderBy` (row fields; the id breaks ties), for a set small enough to
  hold whole whose readers need all of it (the task tree, a graph). It mints
  `key` — one param-less keyed resource (`AllQueryResourceContract`, minted by
  the internal `allResourceDescriptor`: no window codec, no `defaultParams`, no
  placeholder; any param is `contract-mismatch`; self-registered under `key`, so
  boot hydration resolves it) — and `key:rows`; no `:groups`. **The params gate
  is no skew signal for a param-less predecessor:** an older bundle that
  subscribed the same key with `{}` (the legacy `tasks`, `task-categories`) passes
  it, gets the new rows and parses them with ITS schema — a parse error, not a
  `skew` verdict, unless the two wire rows are identical. Each step converting
  such a key (P8 v3 steps 18–22) must prove the rows byte-compatible or give the
  runtime a contract signal it compares on a `{}` subscription (see the plan's
  *As landed → 16b.3*, C39 open item). `preload` reaches
  `key`. Every window and union field is `never` beside it (T13; `all?: never`
  on the other forms), and a stray one, an empty reason or order, an order field
  that is not a row field (or is named twice) throws. It is
  `LiveAllCollection<Row>` — with the lookup-only collection, one
  `LiveNoWindowCollection<Row, Al>` whose `all` is `undefined` for a lookup — so
  `useLiveRow` / `useLive(c, { ids })` take it and `serveCollection`'s
  lookup arm does not (tsc, and a throw against a cast). It is served by
  `serveCollection`'s `all` arm (*Serve* below) and read by `useLive(all[, {
  select }])` (*Read* below); the join kinds it reads are query-resource's
  `AllJoinSpec`.
  - **C39 — the old-bundle check.** `server/testing`'s
    `subscribeAsOldDescriptor({ key, schema }, { params?, build? })` answers
    what a tab still running a bundle that declared a key with a param-less
    legacy descriptor gets from the entry serving it now: `refused` (the
    sub-error's `reason` and resource-protocol `verdict`), `parsed` (the
    sub-ack's value under the OLD schema) or `parse-failed`. A key converted
    to `all` under the same name passes the gate with `{}` and is parsed with
    the old schema — so a converting step proves `parsed` with its old row
    schema, or renames the key (`unknown-key`, `skew`). Its synthetic cases are
    in `server/internal/serve-collection-all-oracle.test.ts`.
- **Preload.** `preload: "boot"` (or `"boot-and-keep"`) pins the owning plugin
  to the eager tier and hydrates one tuple before first paint. A window
  collection forwards it as is to the WINDOW descriptor, and the boot snapshot
  hydrates the default window (`defaultParams`). An `all` collection forwards it
  to `key`, which has no `defaultParams`: the boot snapshot hydrates its one
  param-less tuple `{}`. `"boot-and-keep"` also keeps that preloaded tuple's
  cache resident. `:rows` and `:groups` are never preloaded — the server cannot know a tab's id sets or
  grouping queries at boot. A declared `:count` preloads with the window, at
  its param-less `{}` tuple (the whole collection's total). Default `"none"`. The scanners read the flag through the resource
  vocabulary (`tooling/resource-vocabulary`: each factory names the field it
  spells its preload with, and each mint whether the flag reaches it).
- **Serve.** `serveCollection(c, { from, joins?, where?, columns? })` binds every ROW
  field to a column of `from` (a `PgTable`, or an Entity's wire columns) BY
  PROPERTY NAME — type-checked: a field that is not a column fails in `tsc` until
  it is given in `columns: { name: (j) => j.base.col }` (and throws at module eval
  if it still binds nowhere).
  - **Joins.** `joins: [songPlayback.join("playback"), lookup, keyedSide]`
    reads other tables beside `from` (the vocabulary, its routes and checks:
    `plugins/infra/plugins/query-resource/CLAUDE.md`, *Joins*). A joined column
    binds through an override, `columns: { lastPlayedAt: (j) => j.playback.lastPlayedAt }`
    — `j` offers only the base's and each declared join's WIRE columns, and an
    override returns one of them, so another relation, another table's column
    or a server-only column cannot be spelled (tsc); a `ColumnRef` naming a
    column of the wrong relation, or one `j` did not offer, throws. A joined
    field filters, sorts (in the order signature like any sortable field),
    groups and is wire-encoded (`withWire`) like a base one; the id binds to the
    base. A field read through a LEFT join is NULL for a host with no joined
    row, so its row schema field must accept null — module eval throws
    otherwise.
    Routing: a write to a joined table refills only the host rows it keys, and
    only in the tuples whose SQL reads the join — as `value` (projected only: a
    write to a row the tuple does not hold loads nothing) or `membership` (its
    where / order reads it, or a required lookup). A grouping joins only what its
    column and `where` read.
  - **Expression fields.** A field computed by SQL binds in `columns` too, over
    the same `j`: `label: (j) => expr(sql\`${j.base.title} || ' by ' ||
    ${j.artist.name}\`, { decoder: String, sqlType: "text", notNull: true })`
    (query-resource's `ExprField`: `j`'s refs render as their relation's
    defaulted wire columns). It projects, filters, sorts, cuts and groups like a
    column; its provenance (route columns, the joins it reads) is read off its
    SQL. Its value type must be the field's (tsc: the decoder's result,
    `| null` unless `notNull`), and it is never the id.
  - **The projection is derived from the row schema**: exactly its keys, so a
    server-only column (a dedup key, a secret) can never reach the wire.
  - **`where`** is the collection's base membership — the collection IS the rows
    of `from` matching it. It is ANDed into the window, the `:rows` point reads
    and every grouping. A mutable column is fine: a flip is a membership exit for
    a window tuple and a point tuple (the point refill omits the id), and a
    recount for the groups. A predicate over the joins is `(j) => …` over their
    rendered columns (`(j) => gt(j.playback.plays, 0)`), and makes each join it
    reads membership for every tuple. A table the predicate reads that is not the
    base or a declared join throws at module eval.
  - **`defaults`** — DEFAULT scopes: `[{ unless: "sourceId", where: (j) =>
    eq(j.source.enabled, true) }]`. Each predicate is ANDed into a window or
    grouping tuple UNLESS that tuple's filter names its `unless` column (any op) —
    a default the user overrides by asking about the column, not base membership
    (the events list hides a disabled source's events and soft-deleted ones, and
    a filter on `sourceId` / `disappearedAt` shows them). Written like `where`,
    checked like it (an `unless` that is not filterable throws), routed like it
    (its columns are route columns, and a join it reads is membership for the
    tuples it applies to); never ANDed into the `:rows` point read.
  - The window and `:rows` compile through `windowQueryResource`: the window
    decodes `where` / `order` per subscription tuple (the filter compiles
    through the filter language's `filterSql`, over each column RENDERED as SQL,
    never the column object) with every sortable column as the universe each
    tuple's order signature is cut from (a tuple signs only what it sorts by);
    the point sibling is
    `point: { by: <id column> }` with no client filter.
  - `:groups` is a plain (non-keyed) push value per grouping tuple, compiled by
    query-resource's `compileGroupsQuery`: `SELECT col AS value, count(*) …
    WHERE <base> AND <where> GROUP BY col ORDER BY count(*) DESC, col NULLS LAST
    LIMIT n`. A write to the table recomputes every subscribed grouping tuple
    (its `reach` plan: one `full` route on the table), a write to any other
    table reaches none, and push mode drops a byte-identical result. Each value
    is checked against the ROW schema's field (a group value is a stored value;
    an operand narrowing like `liveText(Enum)` is tsc-only), so a value the row
    type cannot hold fails loudly.
  - `:count` (declared `count: true`) is a plain push value per `where`,
    compiled by query-resource's `compileCountQuery`: the grouping's plan —
    the same `full` routes and per-tuple joins — rendered as `SELECT count(*)
    … WHERE <base> AND <defaults> AND <where>`, so it counts exactly the rows
    the window lists.
  - **All three are ROUTED** (research/2026-09-29-global-scoped-change-routing.md):
    each compiler emits the routes its SQL reads, and the runtime's
    `routeTableChange` serves them — never the loader read-set — so a change
    reaches exactly the tuples whose query reads the changed table. `from` is
    therefore a base table or an Entity, never a view (`CollectionSource`), and
    every table a collection reads must be triggered (the change-feed's boot
    assertion). Each route's columns are exact: the window declares the
    filterable columns and the base predicate as its `whereReads`, the grouping
    as its `reads`. The joined read-sets are pinned by
    `server/internal/serve-collection-joins.test.ts` (routes, roles, the
    provenance property over random params) and, on a real database through the
    real feed, `serve-collection-oracle.test.ts` (the differential oracle).
  - **A column type's wire form.** A column built through sql-column's
    `withWire` (collab-doc's `bytea` → unfolded base64) is encoded IN JS on every
    row a loader returns (`encodeRow` on the window / point spec) — never in SQL,
    whose `encode(…, 'base64')` folds lines at 76 chars. The row schema's field
    must BE the codec's wire type (plus `| null` for a NULL-able column): a
    mismatch on a by-name binding is a tsc error naming the field. A
    wire-encoded column cannot be filterable or the id (an operand, a group value
    and an id are compared as stored); that throws at module eval.
  - The served object exposes `window`, `rows`, `groups`, `keys` (all three
    minted keys — for anything that must know every reader of the table) and
    `declare`. `compileCollection` is the same derivation without registering
    (for tests), and also returns the derived `select`.
  - **The `all` arm** (`server/internal/serve-all.ts`; P8 v3 step 16b.6, C4).
    `serveCollection(c, { from, joins?, columns?, where?, throttleMs? })` over a
    collection declared `all` is checked FIRST — before the lookup-only branch,
    which would otherwise serve it as `:rows` alone — and compiled by
    query-resource's `compileAllCollection`: it registers the whole ordered set
    (`key`, a routed `scopedMembership` alias: an insert is one refill and one
    `orderOf`, a delete or where-flip an exit, an order-field move one
    `orderOf`, any other write a one-row refill, and a persisted one keeps its
    `{}` snapshot current with nobody subscribed) and `:rows`, returning
    `ServedAllCollection` (`all`, `rows`, `keys: [key, key:rows]`, a two-entry
    `declare`). Bound eagerly, never deferred. Fields bind like a window's —
    by property name, or in `columns` over `j` (`AllJoinRefs`): a column ref,
    an AGGREGATE of a children / closure join (`(j) => j.att.done`, its value
    type the field's, `| null` unless declared not-null — tsc) or an `expr`
    over either. A `jsonAgg` aggregate (its ref's form phantom is `json`) may
    instead hold the field's JSON FORM (a `Date` as its ISO string,
    recursively): it hands its elements back as the JSON the driver parsed,
    never decoded — byte for byte what the wire makes of the decoded value —
    and the client parses the field with the row schema either way
    (`attempts`' `conversations`, P8 v3 step 20). A scalar `aggregate` (form
    `decoded`) must hold exactly the field's type — its text form of a
    `timestamptz` is Postgres's, not ISO (tsc). `joins` takes `AllJoinSpec` (the window kinds, rollups,
    `childrenJoin`, `closureJoin`); `where` is static, over the base's and the
    row-wise joins' raw columns (`AllWhereColumns`), never an aggregate;
    `throttleMs` is the set's flush throttle (the runtime's `debounceMs`, C18).
    Refused at module eval: a cast that makes it `contributed`, `columnScope`d
    or a union (and contributed / scoped sets handed to `compileCollection`),
    a field that may read NULL on a non-null field, a ref `j` never offered,
    and a wire-encoded value (sql-column `withWire`, an `expr`'s `wire`) — an
    `all` set is L2-persisted and its definition cannot read an encoder's
    code. `compileCollection` takes it too (`AllCollectionSpecs`, nothing
    registered). Tests: `serve-collection-all.test.ts` (both keys registered,
    A28's runtime half — what each form registers is exactly what it minted —,
    every refusal, the types) and `serve-collection-all-oracle.test.ts` (the
    real feed, L2 hooks on: entrant, exit, where-flip, order move, value-only
    and child writes, each with its exact loads and `orderOf` calls; the idle
    `{}` snapshot and its floor persist; the C39 harness).
  - Hand-written loaders are out of scope for now — keep those on
    `windowQueryResource` / `defineResource`.
- **Read — `useLive(c, query?)`.** The query's SHAPE picks the resource; there is
  one hook for every list read, and a separate hook only where the result has
  different STATES (`useLiveRow`).
  - A window query returns `LiveListResult<Row>` — live-state's
    `PagedResourceResult<Row>`: `ResourceResult<Row[]>`
    (`status: "loading" | "error" | "ready"`, see `live-state/CLAUDE.md`) whose
    `ready` arm adds live-state's `ResourcePaging`: `canGrow` (`rows.length === limit && limit < maxLimit`),
    `growing` and `loadMore()` (grow by one default page, clamped to
    `maxLimit`). While a grown window loads the hook stays `ready` on the
    previous rows (`growing: true`) — the previous tuple stays subscribed only
    until the grown one has a value — so a list that already rendered never
    flashes a spinner. A grow that FAILS before its first value is the `error`
    arm with the previous window as `stale`. Each grow step is a new tuple;
    that is fine up to `maxLimit`.
  - A **grouping** — `{ groupBy, where?, limit? }` — returns the same
    `LiveListResult`, of `{ value: V | null; count: number }`. `groupBy` is any
    declared filterable column of a `text` / `number` / `boolean` domain, and
    `V` is the ROW field's type. Groups are ordered count descending, then value
    (code-point order); NULL is its own group, selected with
    `{ isEmpty: true }`. `orderBy` is a type error (the order is fixed). Default
    limit 50, max `LIST_MAX`;
    `canGrow` / `loadMore()` page through groups exactly like rows. `where`
    applies as given — to keep every chip visible while one is picked, leave the
    grouped column out of it.
  - A **total** — `{ count: true, where? }` — on a collection declared
    `count: true`: `ResourceResult<number>`, how many rows match `where`
    (see *Totals*). A `null` query (and collection) reads nothing (pending):
    a surface whose count is not cheap right now.
  - An `{ ids }` query reads the point sibling: `ResourceResult<Row[]>`, no
    paging fields.
  - **A collection declared `all`** — `useLive(all)` → `ResourceResult<Row[]>`,
    every row in the declared order; `useLive(all, { select })` →
    `ResourceResult<S>` (`LiveAllSelect`). Both read straight through
    `useResource` on the param-less tuple (the one boot hydrates) with no row
    map. A plain read hands React Query no selector, so its `data` IS the
    cached array: every observer shares it and its row objects (a per-snapshot
    memo such as a `WeakMap` keyed on the array hits across observers), it
    keeps its identity until a push changes the set, and a delta keeps every
    row it does not change — a row an `order` delta moves included (live-state's
    structural sharing keeps a reference the previous array held). Both are
    one gated read (`gate: true`, with or without a `select`), so a push that
    changes nothing they read re-renders nothing: the first value renders
    whatever the slice, a `select` re-renders only when its slice changes, and
    the derived latch makes a boot-hydrated read, plain or selected, render
    once (live-state CLAUDE.md, *Slice selectors*). Pass a stable selector. The
    overloads sit after the window and group ones; an id read of the set is
    `useLive(all, { ids })` / `useLiveRow(all, id)` on `:rows`. Pinned by
    `web/__tests__/use-live-all.test.tsx`.
  - Every query is identified by its canonical encoding, so inline object
    literals are fine. A list result (and its `loadMore`) keeps its identity
    until its rows, state or limit change, so a consumer may memoize on it.
- **Read — `useLiveRow(c, id: string | null)`.** `{ status: "loading" } |
  { status: "error"; error; stale? } | { status: "ready"; found: true; row } |
  { status: "ready"; found: false }`, every arm with `refetch`. A point read: it ignores every client filter and window bound (the
  base `where` still applies — a row outside the collection is not found), so
  `found: false` means the row is not in the collection — never "outside the
  window".
  - **A `null` id** (nothing to look up yet) is `{ status: "ready", found:
    false }` from the FIRST render, and reads nothing: the substrate's skip
    (`useResource(desc, null)` — no subscription, no HTTP read or cold-start
    prime, not a pending mount), the same one a value's `useLive(v, null)` uses
    (which, having no row to be absent, reads `loading`).
  - **An id the point codec cannot carry** — `""`, or one holding a `,` (the
    wire id set is comma-joined; `isPointId`) — is answered the same way:
    `found: false` from the first render, nothing read. No row is addressable
    by it, so it is a determinate miss, never the render error `encode` would
    throw. A reader handed an id from outside (a URL, a `[[page:…]]` token, an
    agent's tool input) renders its not-found state. `useLive(c, { ids })`
    still throws on one: an explicit set is the caller's to build.
- **Optimistic reads** are `optimistic-mutation`'s, over the same argument
  shapes: `useOptimisticResource(value, params?, options)` and
  `useOptimisticResource(c, { ids }, options)` (the `:rows` read — the queue's
  ranks). `loading` until a real value lands, never on a placeholder, and
  `dispatch` only on the `ready` arm — named by `status` like every read, with
  live-state's one named exemption: once a value has landed, a failing read
  stays `ready` and carries the failure as `error` (see live-state CLAUDE.md). The hook asks the server for standalone
  ack frames on its tuple (client-requested, per subscription), so a write
  that changes nothing in the tuple still confirms — nothing is declared here.
- `useLive` is on `live-state/no-pending-data-collapse`'s watched list
  (`useLiveRow` has no `data` to collapse), and both on `no-ready-negation`'s:
  never `status !== "ready"` — name `"loading"` and `"error"`.

## Scroll collections — `scroll: true` / `useLiveScroll`

A list that scrolls past `maxLimit` (a live DataView source) reads a collection
declared `scroll: true` as a **segmented scroll**: several windows, each ≤
`maxLimit`, that tile the order by cuts — and every loaded segment stays live.
Design: research/2026-09-29-global-scoped-change-routing.md, "P2 — DataView
live-window adapter".

- **Declare.** `scroll: true` needs `maxLimit ≥ 3 · default.limit` (a
  declaration throw): a full segment splits at `maxLimit − default.limit` and two
  merge below `maxLimit − 2 · default.limit`. The collection is typed
  `LiveScrollCollection` (`scroll: true`), which is what `useLiveScroll` and
  `liveDataSource` take.
- **`$key` — the server-minted row key.** Every full and scoped row of a scroll
  window carries `$key`: the canonical JSON array of the tuple's order keys as
  exact Postgres text (`col::text` — a µs `timestamptz`, a long `numeric`, a
  `float8` cross exactly), then the id (omitted when the order already names it).
  Over `LIVE_ROW_KEY_MAX_BYTES` (1 KiB, a long text sort key) it is `null`: the
  scroll cannot cut there. It is declared on the window's wire schema only (never
  a row field, never on `:rows`), and every read hands rows out WITHOUT it
  (`useLive` and `useLiveScroll` split it off, one copy per row object).
- **Cuts.** A window tuple may carry `after` (exclusive) and `until` (inclusive)
  — each a `$key` verbatim, never derived on the client (a decoded row lost the
  exact text). The codec refuses them on a collection not declared `scroll`, and
  decodes them strictly (exactly the order's arity, a non-NULL id, canonical
  JSON). The compiler renders them on the ORDER side over the tuple's own keys
  (keyset's `seekPredicate` / `atOrBeforePredicate`, each operand cast back to its
  column's type) — never through `where`, so a sortable-but-not-filterable order
  column takes cuts, and the routes and roles are those of the tuple without them.
- **`useLiveScroll(c, query | null, { resetKey? })`** → `{ status: "loading" }
  | { status: "error"; error; refetch }` (the first segment failed with no rows;
  `error` is that read's `ResourceError`, unwidened — the plan is generic over
  its reader's error type — so a consumer renders it like any read's error arm)
  `| { status: "ready"; rows; exhausted; canGrow; growing; loadMore; truncated;
  segmentErrors }`. The plan is pure data (`shared/scroll-plan.ts`,
  shared by the hook and the DB oracle); the hook reads one window tuple per
  segment through live-state's `useResources` (subscribed by diff).
  - Grow by `default.limit` up to `maxLimit`; a full segment at `maxLimit` splits
    at row `maxLimit − default.limit` (`S1 = (a, cut]` at `maxLimit`, `S2 = (cut, b]`
    at `2·default.limit`); neighbours holding ≤ `maxLimit − 2·default.limit` rows
    merge; an empty segment folds into its neighbour at once.
  - **The rows counted are a gap-free prefix of the order** — the segments up to
    and including the first full BOUNDED one (it may hide rows). `exhausted`,
    `canGrow` and the empty state read that prefix only.
  - **Cap and collapse.** At most `MAX_SCROLL_SEGMENTS` (16). A segment that must
    split and cannot (the cap, a `null` key) drops every segment after it and
    becomes the tail at `maxLimit` (one `clientLog` line); only a tail that cannot
    split says `truncated` — a `ScrollTruncation` KIND (`"segment-cap"` |
    `"long-sort-key"`, exported for the surface to word for its user), logged
    once in the plan's own terms (`TRUNCATION_DETAIL`).
  - **Handoff.** Every structural change mints new tuples; the replaced segments
    stay subscribed and rendered until every replacement settles, so the result
    never flips back from `ready`. A replacement that fails keeps the old rows and
    adds a `segmentErrors` entry (`key`, `afterRowId`, `error`, `blocksPaging`,
    `retry` — which re-reads that tuple, never `loadMore`). The failed change is
    SET ASIDE (`ScrollState.stalled`), not held open: its replacements stay read
    (a retry, or the server answering again, commits it), the scroll is idle
    again, and it is not re-minted while it is still the step to take — so a
    failed merge never stops the tail from paging. `blocksPaging` marks the
    failure paging stopped on: the tail's own read, a failed page past the tail,
    or — when the scroll can neither grow nor is exhausted — every failure
    (`growing` is false once a page's read failed).
  - **Keys.** A plan is one collection's: its key is the collection's key and
    the query's encoding, so a surface switching collection starts over even
    when the two queries encode alike. A query changed and then changed back
    before the new head settled restores the plan still on screen.
  - **`resetKey`**: a query change under the same key keeps the previous rows until
    the new head settles (a search typed into a list); any other change starts over,
    loading. A `null` collection and query read nothing (a surface whose origin is
    not live still calls the hook, so its hook order is fixed).

## Contributed columns — `contributed: true` / `liveColumns` / `serveColumns`

A collection declared `contributed: true` can be sorted and filtered by columns
OTHER plugins own (Sonata's library by a song's play count). The set is open, so
the collection names none of them.

```ts
// the contributor's core — a handle, nothing registered
export const playbackColumns = liveColumns(songLibrary, "playback", {
  row: z.object({ playCount: z.number(), lastPlayedAt: z.coerce.date().nullable() }),
  filterable: { playCount: liveNumber() },
  sortable: ["playCount", "lastPlayedAt"],
});
// the contributor's server — a contribution, not a registry
contributions: [LiveColumns.Serve(serveColumns(playbackColumns, { join: songPlayback.join("playback") }))]
// web
{ id: "plays", value: (s) => playbackColumns.read(s).playCount, column: playbackColumns.column("playCount") }
```

- **Rows.** The row type is `Row & { $columns }`: the row schema declares
  `$columns` (a zod `extend`, so its keys stay readable); each contributed column
  is projected flat under its wire name (`<contributor>.<field>`), wire-encoded
  like any column (`withWire`), and folded into `$columns[contributor][field]`;
  `:rows` points carry it too (one row shape per collection). `handle.read(row)`
  parses a contributor's slice with its own schema, once per row object. A row
  always carries every contributor's slice.
- **Queries.** A query names a contributed column by wire name and hands the codec
  the handles it names (`LiveQuery.columns`); the server decodes against every
  handle it serves — its params gate too (the window spec's
  `window.validateParams`, replacing the descriptor's, whose decode knows no
  contributed or scoped column). There is no registry. A collection's own column cannot contain
  `.`. Groupings stay over the collection's own columns.
- **Serving.** `serveColumns(handle, { join, columns? })` — `join` is an
  EXTENSION join (`ext.join(alias)`: LEFT, 1:1 on the host's id — typed, and
  thrown on at compile for a cast), so a contributor can neither drop host rows
  (a required lookup's INNER join) nor change routing roles; a field binds to its
  join's wire column of the same name, or through `columns` (typed like
  `serveCollection`'s overrides). A `contributed` collection's `serveCollection`
  registers its three resources DEFERRED (`defineDeferredResource`: key, preload
  and `Resource.Declare` at module eval) and compiles them at
  `bindDeferredResources` — the boot step right after contributions are
  collected — folding every `LiveColumns.Serve` naming it. Boot fails on two
  contributions of one name and on a `Serve` for a collection nothing serves here;
  `liveColumns` itself refuses a collection not declared `contributed`.
- **The `live:contributed-columns-served` check**: every `const x =
  liveColumns(` handle has a `serveColumns(x` in its own plugin's `server/` —
  an unserved handle's columns reach no row. It reads whole files with comments
  and strings masked (a call wrapped over lines still reads), resolves a serve
  through the file's import aliases, ignores test code on both sides, and
  reports a `liveColumns(` call no `const` binds.
- **Defaults.** An extension column with a literal default reads it where the side
  row is missing (query-resource's `ReadColumn`: `COALESCE`), so a never-played
  song has `playCount = 0` in SQL — in a filter, a sort and the projection.
- **Custom columns** (data-view's user-defined columns) are the open-vocabulary
  twin of this seam: a *scoped* column set, below.

## Scoped column sets — `columnScope` / `LiveColumns.Scoped` / `scopedLiveColumns`

A collection declared with `columnScope: "<DataView id>"` sorts and filters by
columns whose SET is data, not code — the custom columns defined on that one
DataView surface (research/2026-09-29-global-scoped-change-routing.md P3).

- **Server** (the column set's owner — data-view's custom-columns):
  `LiveColumns.Scoped(serveScopedColumns({ name, table, scope, hostKey, member,
  value, members, recomputeOn }))` — one composite-keyed side table (scope, host
  key, member, value), `members(scope)` the members a scope has NOW (each's filter
  domain and, for a typed value, its cast and the SQL type it produces), and
  `recomputeOn(scope)` the external value tuple notified when they change.
  Collected at boot; every `columnScope` collection's `serveCollection` (deferred,
  like a `contributed` one) folds every contribution as a query-resource join
  FAMILY bound to its scope (`query-resource/CLAUDE.md`, *Join families*). The
  fold is the set's `bind(scope)`, which records the scope: `scopes()` is exactly
  the scopes served, which the owner watches to notify `recomputeOn(scope)`.
- **Wire names** are `<name>.<member>` (`custom.cc-1`). The server decodes a tuple
  against the members it has at decode time (a declaration rebuilt when they
  change); a member's value is read through its cast at LOAD time, so a retyped
  column reads its new type on the next load, and a member the scope lost fails the
  load loudly.
- **One route per set**, whatever its members: an alias on the host key, kept to
  the scope's rows, matched per tuple on the members its `where` / order names (as
  membership). A write to a member a tuple does not read, or to another surface's
  rows, reaches no tuple; the values table's routed trigger carries the key
  columns, so a write reaches only the hosts it names.
- **A member a tuple ORDERS BY** rides the window row under `$scoped`
  (`LIVE_SCOPED_KEY`, by join alias) — declared on the window's wire schema like
  `$key`, read by the order signature, split off by every read (`useLive`,
  `useLiveScroll`). Values a list DISPLAYS still come from the custom-columns value
  (`customColumnValues`): only a sort / filter joins a member, so an unused column
  costs nothing.
- **`recomputeOn`**: the window's routed entry recomputes on each set's
  `recomputeOn(scope)` — a column added, dropped or retyped FULLs every subscribed
  tuple once (the runtime's routed `recomputeOn`).
- **Browser**: `scopedLiveColumns(scope, name, members)` declares the members as
  the browser knows them (built from the definitions each render) and mints their
  refs (`.column(member)`, whose owner is `{ kind: "scoped", scope }` rather than a collection). The codec
  takes a scoped set only on a collection whose `columnScope` is its scope. A
  DataView listing a scoped collection must BE its scope (its `storageKey` —
  asserted at mount), and hands the scope to its field extensions
  (`FieldExtensionProps.liveColumnScope`).

## Union collections — `arms` / `liveArmColumns`

A collection declared with `arms: { discriminator }` lists rows of several
KINDS — each served from its own table — in one window (the runs of every run
kind): `liveCollection(key, { row, id, arms: { discriminator: "kind" }, scroll:
true, filterable, sortable, default, maxLimit })`. Its id is the union row key
`kind:raw` (query-resource's `armKeyCodec`).

- **The overload (T12).** `scroll: true` is required (a union is listed as a
  live DataView); `contributed` and `columnScope` are `never` — a union's
  column vocabulary is its arms' static handles. The discriminator is a row
  field (tsc) other than the id. An untyped caller's stray field throws. The
  collection is `LiveArmsCollection` (`arms` set); every single-table
  collection is `arms: null`, which is what `serveCollection` takes (a union
  is a tsc error there, and throws against a cast).
- **Rows** carry `$columns` like a contributed collection's: each arm's OWN
  columns under `$columns[<arm>]`.
- **`liveArmColumns(collection, arm, { row, filterable, sortable })`** declares
  one arm's own columns in the arm's core: wire names `<arm>.<field>`;
  `read(row)` is `null` for another arm's row, parses its own slice once per
  row object, and THROWS on its own arm's row with no slice (A16 — a server
  that did not fold the arm is a bug, never "no values").
- **Owners (T11).** Every column set's declaration carries an `owner` —
  `contributed` (`liveColumns`), `scoped` (`scopedLiveColumns`) or `arm`
  (`liveArmColumns`) — and a column ref's owner adds `own`. The codec, data-view's
  field resolution and the server switch on it exhaustively, so a codec takes
  an arm set only on its own union, a contributed set only on its
  `contributed` collection, a scoped set only in its scope.
- **Serve — `serveUnionCollection(c, { arms: () => UnionArmBinding[] })`**
  (P6 of `research/2026-10-01-global-scoped-change-routing-p5-p8-v2.md`). Each
  binding is one arm: its column set (`columns`, a `liveArmColumns` handle —
  its arm IS the kind), its table and single-column primary key (`from`, `id`),
  its `joins`, `base(j)` (every base field but the id and the discriminator →
  a column ref, an `ExprField`, or `null` for "no such notion"), `extra(j)`
  (exactly its column set's fields) and an always-on `where(j)`. A domain
  types this through its own facade (`runs`' `defineRunKind`, T9).
  - **Deferred.** `arms` is read once at `bindDeferredResources` (arms register
    in the register phase), and the three resources compile there — before
    anything serves and before the change feed rebuilds triggers from routes.
  - **The compile** is query-resource's `compileUnionCollection` (its CLAUDE.md,
    *Union collections*): per-arm positional SQL, static nullability over every
    arm, the row key `kind:raw` as the total order's tiebreaker, each arm routed
    as a single-table compile is and re-keyed by `compiledUnionRoutePlan`.
  - **Filter targets.** In an arm a field's target is its read; on another
    arm's rows a typed `NULL`; the discriminator is the arm's kind as a literal.
    The decode is strict over the static set of the arms' column sets.
  - **Arm pruning** (`armsOf`): a clause reachable from the root through AND
    groups only, over an arm CONSTANT (a typed NULL, or the discriminator), is
    answered once by the op's own `testClause`; `false` prunes the arm — no SQL,
    no routes in `usesOf`. A negative op or `isEmpty` keeps it (NULL satisfies
    it). Groupings prune the same way.
  - **Rows on the wire.** The compiler names the row back (the key field and
    the discriminator are its own projections), and `encodeRow` folds the row's
    own arm columns into `$columns[<kind>]` (wire codecs applied per arm); the
    order signature reads an arm column off `$columns`.
  - Bind-time throws: a binding naming a field that is not a base field (or
    missing one), an arm column with no binding, a read that may be NULL on a
    non-nullable field, two arms of one kind, a set owned by another
    collection. The DB oracle is `server/internal/serve-union-oracle.test.ts`
    (real triggers: arm-`where` flips, `pid` writes loading nothing, a lookup
    rename under and over the reverse cap, retention and cascade deletes,
    raw ids containing `:`). The byte pin is
    `server/internal/compile-union-golden.test.ts`. It checks every shape's
    SQL, routes and folded rows for a fixed four-arm union against
    `server/testing/compile-union-golden.json`. Regenerate the fixture from
    the code before a refactor, with
    `./singularity run plugins/network/plugins/live/server/testing/gen-compile-union-golden.ts`
    (query-resource's CLAUDE.md, *Bounded membership*).

## Values — `liveValue` / `serveValue` / `useLive(value)`

Design: `research/2026-09-25-global-live-values.md`. A value is ONE payload per
params tuple, pushed whole whenever it changes (a count, a status, a detail
object). Anything row-shaped that grows is a collection.

```ts
// core/ — declare
export const notificationsUnread = liveValue("notifications.unread", {
  schema: NotificationsUnreadSchema,     // z.object({ errors, warnings })
  preload: "boot",                       // "none" (default) | "boot" | "boot-and-keep"
});
export const pluginChanges = liveValue("review.plugin-changes", {
  schema: PluginChangesSchema,
  params: ["conversationId"],            // → P = { conversationId: string }
  // load: "on-demand",                  — opt out of push (slow loader; tabs refetch over HTTP)
});
export const configValues = liveValue("config-v2.values", {
  schema: ConfigValuesSchema,
  params: ["path", "scopeId?"],          // → P = { path: string; scopeId?: string }
  preload: "boot-and-keep",              // a param'd preload: the server names the tuples
});

// server/ — serve
export const unreadServed = serveValue(notificationsUnread, {
  source: "db",                          // or "external" (then .notify(params?))
  loader: countUnread,                   // (params: P) => Promise<T> | T
});
// contributions: [...unreadServed.declare]

// server/ — a param'd preload names its boot tuples
export const configValuesServed = serveValue(configValues, {
  source: "external",
  loader: ({ path, scopeId }) => resolve(path, scopeId),
  preloadParams: () => [{ path: "a" }, { path: "a", scopeId: "app:x" }],
});

// web/ — read
useLive(notificationsUnread);            // ResourceResult<T>
useLive(pluginChanges, { conversationId });  // params required iff declared
useLive(pluginChanges, id === null ? null : { conversationId: id });  // no subject yet: skipped, pending
```

- **Declare.** The key is a positional string literal (the scanners read it).
  `params` is a const tuple of names; `P` is derived from it (no phantom
  generic to restate). There is **no `initial`**: not known yet is `loading`,
  never a stand-in — no descriptor carries a placeholder (an optimistic read of
  a value is `useOptimisticResource(value, params?, options)`, loading until the
  first value — see below). `live: "value"` is the discriminant `useLive`
  dispatches on.
  - **An optional param** is declared with a trailing `?` (`"scopeId?"` →
    `scopeId?: string`); the descriptor records the bare names in `params` and
    the optional ones in `optionalParams`. An optional param is present iff it
    is a non-empty string: `canonicalParams` (`packages/canonical-params`, one
    copy for the browser and the resource runtime) drops an `undefined`
    or `""` one wherever params enter the substrate — `useResource`'s entry (the
    subscription, the HTTP fallback URL, the prime, the query key),
    `hydrateResource`, `useOptimisticResource` — and the resource runtime does
    the same on the server (every incoming frame, the HTTP read, `notify`,
    each mapped `recomputeOn` tuple), as does `preloadParams` — so
    `{ path }`, `{ path, scopeId: undefined }` and `{ path, scopeId: "" }` are
    ONE tuple, and a notify can never miss the tuple a read holds.
  - **Typed params.** `params` may instead be a record of string parsers —
    `params: { window: z.enum(LATENCY_WINDOWS) }` → `P = { window: "1h" | … }`,
    so `useLive(v, { window: "2h" })` and the loader's argument are typed by
    each parser's OUTPUT. Every typed name is required. A parser may only
    NARROW the wire string: its output must be a `string` (tsc — `z.number()`
    is an error), and the declaration throws on a `ZodEffects` (transform,
    preprocess, refine), `ZodDefault` or `ZodCatch` anywhere inside it, on a
    string check that rewrites the value (`.trim()`, `.toLowerCase()`,
    `.toUpperCase()`), and on a parser that accepts `undefined`. The names
    must be literal keys (tsc — a record typed `Record<string, …>` is an
    error, since `useLive` would read it as param-less). So the loader
    receives the wire tuple itself, unchanged.
  - **The params gate.** The descriptor's `validateParams` (run by the runtime
    on the canonical tuple, before a sub registers) refuses an unknown name, a
    non-string value, or a missing REQUIRED name as `contract-mismatch`; an
    absent optional param is valid. A typed param is also parsed: a refusal is
    `contract-mismatch` too, and a parser whose result is not the wire string
    (one that slipped past the declaration walk) throws a plain Error — the
    backstop. The gate stays `void`: the runtime keys and loads the tuple as
    sent.
  - **The default tuple.** A param-less preloaded value sets
    `defaultParams: {}`, the tuple both the boot snapshot and `useLive(v)` use.
    A PARAMETERIZED value has none, so it is branded
    (`preloadsParams: true`, `LivePreloadedParamValue`) and its `serveValue`
    must pass `preloadParams: () => P[] | Promise<P[]>` (tsc, and a throw at
    serve time for an untyped caller; any other value may not pass it) — see
    Preload below.
- **Load (delivery mode).** `load` defaults to `"push"` (the value is
  recomputed and pushed); `"on-demand"` is the runtime's `invalidate` — the
  server never ships the value over the socket, and each tab reads it over
  HTTP (on mount, and again after every `invalidate`). It is declared on the
  `liveValue`, never on `serveValue`, because BOTH halves act on it: the
  server picks its mode from it and `useResource` enables the HTTP read from
  it. Declared once, they cannot disagree (when `load` was a serve option the
  client waited forever for a sub-ack value the server never sent).
- **Preload.** `"boot"`: hydrated by the boot snapshot before first paint
  (settled on the first render), the owning plugin pinned eager, and a
  DB-backed param-less one L2-persisted. A parameterized one is an ENUMERATED
  preload: the boot snapshot loads every tuple its `preloadParams` names — the
  loader alone per tuple, through the resource's own `load` (no flight, no
  commit watermark, no profiler span: nothing compares these values
  causally) — ships them under `tuples[key]`, and the client hydrates each; it
  is never L2-persisted (an L2 row is one param-less tuple per key). Enumerate
  exactly what first paint reads: every tuple is loaded on every page load.
  A central value is never preloaded. `"boot-and-keep"`: the same, plus the
  client cache is never garbage-collected (`gcTime: Infinity`, for every tuple
  of the key, hydrated or observed) — for small values read
  by surfaces that mount late.
- **Serve.** `source` is required and says where the truth lives:
  - `"db"`: the loader's read-set is captured at the DB pool chokepoint; a change
    to any table it read recomputes every subscribed tuple (full recompute, no
    scope policy — a keyed payload is a collection). No `notify`, at runtime
    too.
  - `"external"`: truth outside Postgres; the served value has `notify(params?)`.
  - **The bound rule is a type:** a `"db"` value whose type is an array or a
    string-indexed record must pass `unbounded: { reason }` (recorded on the
    served value and shown in the docs), and nothing else may. An external
    array is bounded by the process holding it.
  - Returns `ServedValue` = the runtime `Resource` + `source` + `unbounded?` +
    `keys` (`[key]`) + `declare` (a 1-tuple — spread it like a collection's);
    the external arm adds `notify`. `compileValue` is the same derivation
    without registering, and `shared/compile-value.ts`'s `registerValue`
    registers it on any runtime (tests use their own).
  - **`throttleMs`** (both arms): at most one flush per window — the first
    change arms a trailing timer later changes do not re-arm (the runtime's
    `debounceMs`, which was always a throttle). A flush already happening
    drains it early.
  - **`recomputeOn: [served, { value: served, params: (up) => P }]`** (both
    arms): upstream served values whose change recomputes this one. A bare
    served value recomputes **every currently-subscribed tuple** of this value
    (the runtime's `toSubscribed` edge — it tracks them, so the hand-kept
    "active set" filled by `onFirstSubscribe` is gone); a param-less value
    always recomputes its `{}` tuple, so its version moves even with no tab
    subscribed. The mapped form is one per-tuple edge; `params` is typed
    against that upstream's params (the array is a const tuple, inferred per
    element). It compiles to the runtime's value-aware `map`, so every notify
    of the upstream computes the upstream's value even with nobody subscribed
    to it — prefer one notify fan-out over a mapped edge for values that move
    together (config's documents, conflicts and tiers).
  - **`whileSubscribed(params, notify?) → stop | Promise<stop>`**: start
    something for as long as a tuple has a subscriber, return what stops it —
    one function, so a start without its stop cannot be written. The external
    arm is handed `notify` for that tuple; the db arm gets `params` only (tsc).
    Paired in `shared/compile-value.ts` over the runtime's 0→1 / N→0 hooks: an
    async start is awaited on the subscribe path, and a last unsubscribe that
    arrives first runs the stop after the start resolves. A failed start has
    nothing to stop (the runtime reports it). Nothing watches the source between
    a stop and the next start, and nothing needs to: the runtime opens every
    subscription span with a fresh version, so a tab reconnecting after the gap
    never gets `up-to-date` for a value it read before it (`resource-runtime/CLAUDE.md`).
  - **`revalidate`** (both arms): the ETag signature, passed through
    (read path only; co-produce it with the loader, e.g. `createSignedMemo`).
  - Not spelled: `ackChannel` (an optimistic reader asks for acks on its own
    subscription), a read-side `select`, row-scoped `recomputeOn` edges (an
    upstream's change recomputes whole tuples) — see
    `research/2026-09-26-global-live-values-migration-contract.md`.
- **Central.** `liveValue(key, { …, origin: "central" })` declares a value the
  machine-wide central runtime serves (`LiveValue<T, P, "central">`; the browser
  subscribes over the central socket; never preloaded). It is served by
  `network/live/central`'s `serveValue` — external arm only (central has no
  change feed), registered by the central plugin's `resources: [served]`, so no
  `declare`. Each `serveValue` rejects the other origin's value (tsc). Both
  compile options through `shared/compile-value.ts`, so they cannot drift.
- **Read.** `useLive(value, params?)` → `ResourceResult<T>` (it delegates to
  `useResource`, which canonicalizes the params). A value with no
  placeholder makes no HTTP fetch on mount — the WS sub-ack fills it (the
  query stays disabled until a value lands; `refetch()` still works).
  - **No subject yet — `useLive(value, null)`** (a param'd value only — tsc):
    the read is `{ pending: true, error: null }` for as long as the params are
    `null`, and NOTHING is read — no subscription, no HTTP read or prime, and
    it is not a pending mount (the page is not waiting on the server for it).
    A value whose subject has not arrived is not known yet. A subject that
    will NEVER arrive (a missing registration, a legacy record with no id) is
    a settled answer: the caller renders it or throws — it never leaves a
    `null` read spinning. The old workaround, a `""` stand-in
    (`{ id: x ?? "" }`), subscribed a real tuple the server loaded for nothing;
    the `live/no-sentinel-param` lint rejects it at a `useLive` /
    `useLiveRow` call.

## Old spellings — lint `no-legacy-resource-spelling`

Contributed by `lint/` (repo-wide), beside `live/no-sentinel-param` (a `""`
stand-in for a param that has not arrived — see Values → Read). It flags every
import of an old spelling
from the barrel that exports it — named or aliased, `export { … } from`, or a
read off the barrel's module object (a namespace import or an awaited
`import()`, by member or by destructuring, resolved through scope):
`resourceDescriptor`,
`keyedResourceDescriptor`, `queryResourceDescriptor`,
`windowQueryResourceDescriptor`, `pointQueryResourceDescriptor`,
`defineResource`, `defineExternalResource`, `queryResource`,
`windowQueryResource`, `useResource` — and `usePointResource(s)` and
`useWindowResource`. Several no longer exist: `resourceDescriptor`,
`usePointResource(s)`, `useWindowResource`, `keyedResourceDescriptor`,
`queryResourceDescriptor` and `queryResource` are deleted, and
`windowQueryResourceDescriptor` /
`pointQueryResourceDescriptor` are internal to `network/live`
(`core/internal/window-descriptor.ts`) — all still listed so a stale import is
told its replacement, not only tsc's "no exported member". Its exemptions
(`exempt/index.ts` of the plugins that hold them) are the substrate only —
the plugins that define the old spellings or are compiled onto them
(`./singularity exempt list --rule live/no-legacy-resource-spelling`); no
debt entry remains. **Never add an entry for new code** — declare it with
`liveValue` / `liveCollection`. A file-level entry whose file no longer
imports an old spelling is reported `(unused-exemption)` by the type-check
worker (`framework/tooling/exempt`), so a stale one cannot linger.

## Internals

- `core/` (browser-safe): `liveCollection(key, { row, id, filterable, sortable, default, maxLimit, preload? })`
  (or `{ row, id }` alone — lookup-only, minting `` `${key}:rows` `` only; or
  `{ row, id, all, preload? }` — the whole ordered set, minting `key` through
  the internal `allResourceDescriptor` (`core/internal/window-descriptor.ts`) and
  `` `${key}:rows` ``, no `:groups`)
  mints three resources from one declaration — `key` (window membership),
  `` `${key}:rows` `` (point membership) and `` `${key}:groups` `` (a plain push
  value; one wire schema for every column's values — any scalar or NULL — with
  the per-column check done by the server). `row` / `rowKeys` are the row
  schema and its keys. The window descriptor carries the
  query codec: `window.encode(query)` → wire params, `window.decode(params)` →
  `{ limit, where, orderBy }` (`where` a canonical `Filter` or `undefined`); the
  groups descriptor carries `groups.encode` / `groups.decode`
  (`{ groupBy, limit, where }`).
- **Filtering is the filter sub-plugin** (`plugins/filter`, see its CLAUDE.md):
  domains, the one op table (in-memory test + SQL template side by side), the
  `Filter` tree, its canonical form, strict codec, `matchesFilter` and the
  server's `filterSql`. Negative ops (`ne notIn neCi notContains hasNone
  isNotEmpty`) are complements — they KEEP NULL rows. Operands are checked
  against the DOMAIN, so a stale enum operand decodes and matches nothing. No
  clock ops. Its parity suite runs every op both ways against a real Postgres.
- `LiveWhere` is either the per-column object sugar — an AND of clauses, each a
  plain value (= `eq`) or exactly one `{ op: operand }`, a no-operand op spelled
  `{ isEmpty: true }` — or a `Filter` tree (`and(...)` / `or(...)` of
  `{ column, op, operand }` clauses). Both canonicalize through
  `canonicalizeFilter` / `encodeFilter` to the same tree and bytes; the sugar is
  reshaped in `core/internal/query-codec.ts`, every check is the language's.
  `useLive`'s query param is `NoInfer`, so a tree is checked against the
  collection's own declaration.
- String ordering is code-point order in memory; in SQL it is the cluster's
  collation, which is `C` (initdb `--no-locale`) — the language's parity suite
  pins it, and the groups' value tiebreak relies on it.

## Wire params

- Window: `{ limit: string; where?: string; order?: string; after?: string;
  until?: string }` — `where` is the filter language's `encodeFilter` output
  (e.g. `{"column":"enabled","op":"eq","operand":true}`), `order` canonical
  JSON, `after` / `until` a scroll segment's cuts (server-minted `$key`s,
  verbatim); each present only when it differs from the default, so the default
  window stays byte-identical `{ limit: "100" }`.
- Groups: `{ groupBy: string; limit: string; where?: string }` — `where` is the
  same encoding, present only when not the absent filter.
- `all`: `{}` — the set has no query, so it has one tuple; any param is a
  `contract-mismatch` (`ResourceContractError`). An `all` collection's `:rows`
  takes the point params like any other.
- Decode is STRICT for both: the filter through `decodeFilter` (throws unless
  exactly canonical), the rest by re-encoding — so one logical query can never
  name two subscriptions.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, a collection declared `all` whole — every row in its declared order, or a select-scoped slice of it — or an explicit id set), useLiveRow (one row: loading, failed, found, or determinately absent), with mapRow reducing a row read to a ResourceResult of what the row means, and useLiveScroll (a scroll collection read as live segments — bounded windows tiling the order by server-minted row-key cuts, grown, split, merged and collapsed so the rendered rows stay a gap-free prefix). Unified live-resource API, server half: serveValue (a liveValue's loader, from Postgres — change-feed driven, a collection-shaped payload must declare `unbounded: { reason }` — or from an external source with notify(); pushed by default, or refetched over HTTP when the liveValue declares `load: "on-demand"`) and serveCollection (binds a liveCollection's row fields to a table's columns — the projection is exactly the row schema — ANDs an optional base `where` into every read, and compiles its window + `:rows` point resources through windowQueryResource and its `:groups` GROUP BY push value — only `:rows` for a lookup-only collection, and the whole ordered set (`key`, a routed scopedMembership alias compiled by compileAllCollection) + `:rows` for one declared `all` — encoding a column type's declared wire form in JS per row; a `contributed` collection compiles at boot, folding every LiveColumns.Serve contribution naming it — serveColumns(handle, { join }) — into its rows' `$columns`); every filter compiles through the filter language's filterSql. Unified live-resource API, central half: serveValue for a liveValue declared `origin: "central"` — the external arm only (central has no change feed), registered through the central plugin's `resources: [served]`; its options compile through the same code as the worktree serveValue.
- Web:
  - Uses:
    - `primitives/live-state.PagedResourceResult`
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.ResourceError`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
    - `primitives/live-state.useResources`
    - `primitives/log-channels.clientLog`
  - Exports (types):
    - `LiveAllSelect`
    - `LiveIdsQuery`
    - `LiveListResult`
    - `LiveRowResult`
    - `LiveScrollOptions`
    - `LiveScrollResult`
    - `LiveSegmentError`
    - `ScrollTruncation`
  - Exports (values):
    - `mapRow`
    - `useLive`
    - `useLiveRow`
    - `useLiveScroll`
- Server:
  - Uses: 25 symbols — full list in [REFERENCE.md](./REFERENCE.md)
    - `infra/query-resource` ×22
    - `database/sql-column` ×2
    - `network/live/filter.filterSql`
  - Exports (types):
    - `AllCollectionSpecs`
    - `AllWhereColumns`
    - `CollectionSource`
    - `CollectionSpecs`
    - `ColumnOverride`
    - `CompiledValue`
    - `DefaultScope`
    - `LiveValueSource`
    - `LookupCollectionSpecs`
    - `ScopedMemberRead`
    - `ServeAllCollectionOptions`
    - `ServeCollectionOptions`
    - `ServedAllCollection`
    - `ServedCollection`
    - `ServedColumns`
    - `ServedExternalValue`
    - `ServedLookupCollection`
    - `ServedScopedColumns`
    - `ServedValue`
    - `ServeUnionOptions`
    - `ServeValueOptions`
    - `UnionArmBinding`
    - `UnionArmColumns`
    - `UnionArmRefs`
    - `UnionFieldBinding`
  - Exports (values):
    - `compileCollection`
    - `compileValue`
    - `LiveColumns`
    - `serveCollection`
    - `serveColumns`
    - `serveScopedColumns`
    - `serveUnionCollection`
    - `serveValue`
- Core:
  - Uses:
    - `infra/query-resource.KIND_RE`
    - `network/live/filter.decodeFilter`
    - `network/live/filter.encodeFilter`
    - `network/live/filter.Filter`
    - `network/live/filter.Filterable`
    - `network/live/filter.FilterScalar`
    - `network/live/filter.LIST_MAX`
    - `packages/resource-protocol.ResourceContractError`
    - `primitives/live-state.PointParams`
    - `primitives/live-state.registerResourceDescriptor`
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.ResourcePreload`
    - `primitives/live-state.WindowParams`
    - `primitives/live-state.WindowSelector`
  - Exports (types):
    - `ContributedColumns`
    - `LiveAllCollection`
    - `LiveAllOrder`
    - `LiveAllSpec`
    - `LiveArmColumnsHandle`
    - `LiveArms`
    - `LiveArmsCollection`
    - `LiveArmsSpec`
    - `LiveCentralValueSpec`
    - `LiveCollection`
    - `LiveCollectionOf`
    - `LiveCollectionSpec`
    - `LiveColumnFilter`
    - `LiveColumnRef`
    - `LiveColumnRefOwner`
    - `LiveColumnsDeclaration`
    - `LiveColumnsHandle`
    - `LiveColumnsOwner`
    - `LiveContributedCollection`
    - `LiveCountCodec`
    - `LiveCountDescriptor`
    - `LiveCountedCollection`
    - `LiveCountParams`
    - `LiveCountQuery`
    - `LiveCutKey`
    - `LiveDecodedCountQuery`
    - `LiveDecodedGroupQuery`
    - `LiveDecodedQuery`
    - `LiveFilterable`
    - `LiveFilterableOf`
    - `LiveGroup`
    - `LiveGroupableColumn`
    - `LiveGroupableDomain`
    - `LiveGroupCodec`
    - `LiveGroupParams`
    - `LiveGroupQuery`
    - `LiveGroupsDescriptor`
    - `LiveGroupValue`
    - `LiveLookupCollection`
    - `LiveLookupSpec`
    - `LiveNoWindowCollection`
    - `LiveNoWindowSpec`
    - `LiveOrderBy`
    - `LiveParamValueSpec`
    - `LivePreload`
    - `LivePreloadedParamValue`
    - `LivePreloadedParamValueSpec`
    - `LiveQuery`
    - `LiveReservedColumn`
    - `LiveRowSchema`
    - `LiveRowsCollection`
    - `LiveScopedColumns`
    - `LiveScrollCollection`
    - `LiveSortDirection`
    - `LiveTypedParamValueSpec`
    - `LiveTypedValueParams`
    - `LiveValue`
    - `LiveValueOrigin`
    - `LiveValueParamParsers`
    - `LiveValueParams`
    - `LiveValueSpec`
    - `LiveWhere`
    - `LiveWhereObject`
    - `LiveWindowBounds`
    - `LiveWindowCodec`
    - `LiveWindowDescriptor`
    - `LiveWindowParams`
    - `ScopedColumnMember`
    - `WithContributedColumns`
  - Exports (values):
    - `isPointId`
    - `LIVE_COLUMNS_KEY`
    - `LIVE_ROW_KEY`
    - `LIVE_ROW_KEY_MAX_BYTES`
    - `LIVE_SCOPED_KEY`
    - `liveArmColumns`
    - `liveCollection`
    - `liveColumns`
    - `liveValue`
    - `scopedLiveColumns`
- Cross-plugin:
  - Imported by: 178 plugins — full list in [REFERENCE.md](./REFERENCE.md)
    - `apps` ×51
    - `conversations` ×35
    - `tasks` ×21
    - `active-data` ×11
    - `infra` ×10
    - `page` ×10
    - `debug` ×8
    - `build` ×6
    - `primitives` ×5
    - `auth` ×3
    - `review` ×3
    - `config_v2` ×2
    - `release` ×2
    - `apps-core/app-usage`
    - `backup/runs-arm`
    - `database/query-deadline`
    - `fields/secret/config`
    - `integrations/google-maps`
    - `plugin-meta/plugin-health`
    - `reports`
    - `runs`
    - `shell/notifications`
    - `stats/responsiveness`
    - `ui/icons/sprites`
- Exemptions:
  - Exempts itself from: `live/no-legacy-resource-spelling` — `.` (sanctioned)
  - Exempted by:
    - `framework/central-core` (0 debt)
    - `framework/resource-runtime` (0 debt)
    - `framework/server-core` (0 debt)
    - `infra/query-resource` (0 debt)
    - `network/live` (0 debt)
    - `primitives/live-state` (0 debt)
    - `primitives/optimistic-mutation` (0 debt)
- Central:
  - Exports (types): `CentralServedValue`
  - Exports (values): `serveValue`
- Test helpers:
  - Server: `@plugins/network/plugins/live/server/testing`
    - `compileCollection` — Derive the specs for a collection — three, or just `rows` for a lookup-only one.
    - `compileUnion` — Derive a union collection's three server halves.
    - `subscribeAsOldDescriptor` — Subscribe `old.key` on the server runtime as an old bundle's tab would — its own socket, `params` (default `{}`: a legacy param-less descriptor sent nothing), its `build` graph when given — and answer what that tab gets: the first `sub-ack` or `sub-error` for the tuple, the ack's value parsed with the OLD schema.
    - Types: `OldDescriptor`, `OldSubscription`
- Sub-plugins:
  - **`filter`** — The filter language's SQL half: renderOpSql renders one op's dialect-free template over a rendered target (operands as params cast to the domain's SQL type, lists as ONE array param), and filterSql…

<!-- AUTOGENERATED:END -->
