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
useLive(eventSources, { ids: visibleIds });                           // point set
useLiveRow(eventSources, sourceId);                                   // one row
```

- **Declare.** The key is a positional string literal (the build scanners read it).
  One declaration mints three resources — `key` (window), `key:rows` (point) and
  `key:groups` (grouping) — and all three show in the docs. Bounded by
  construction: `default.limit` and `maxLimit` are required, a grouping returns
  at most the filter language's `LIST_MAX` (100) groups, and there is no
  unbounded spelling. `row` is a zod object schema: its keys are what the server
  projects. `filterable` maps row fields to the filter language's DOMAIN
  constructors (`liveText(Schema)`, `liveNumber()`, `liveBoolean()`,
  `liveInstant()`, `liveStringArray()`); the domain must fit the row field's
  type (tsc), and `and` / `or` / `column` / `op` / `operand` cannot be column
  names (they spell a filter tree).
- **Preload.** `preload: "boot"` (or `"boot-and-keep"`) is forwarded as is to
  the WINDOW descriptor: the boot snapshot hydrates its default tuple
  (`defaultParams`) before first paint and the owning plugin is pinned to the
  eager tier; `"boot-and-keep"` also keeps the window's cache resident. `:rows`
  and `:groups` are never preloaded — the server cannot know a tab's id sets or
  grouping queries at boot. Default `"none"`. The scanners read the flag through the resource
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
    decodes `where` / `order` per subscription tuple (the filter compiles
    through the filter language's `filterSql`, over each column RENDERED as SQL,
    never the column object) with every sortable column in the order signature;
    the point sibling is
    `point: { by: <id column> }` with no client filter.
  - `:groups` is a plain (non-keyed) push value per grouping tuple, served by
    `defineResource(desc, { mode: "push", loader })`: `SELECT col AS value,
    count(*) … WHERE <base> AND <where> GROUP BY col ORDER BY count(*) DESC, col
    NULLS LAST LIMIT n`. It declares no scope policy: its read-set (captured
    automatically at the DB pool chokepoint) routes a table change as a FULL
    recompute of every subscribed grouping tuple, and push mode drops a
    byte-identical result. Each value is checked against the ROW schema's field
    (a group value is a stored value; an operand narrowing like
    `liveText(Enum)` is tsc-only), so a value the row type cannot hold fails
    loudly.
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
    declared filterable column of a `text` / `number` / `boolean` domain, and
    `V` is the ROW field's type. Groups are ordered count descending, then value
    (code-point order); NULL is its own group, selected with
    `{ isEmpty: true }`. `orderBy` is a type error (the order is fixed). Default
    limit 50, max `LIST_MAX`;
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
export const taskDetail = liveValue("task-detail", {
  schema: TaskDetailSchema,
  params: ["id"],                        // → P = { id: string }; preload is `never` here
});

// server/ — serve
export const unreadServed = serveValue(notificationsUnread, {
  source: "db",                          // or "external" (then .notify(params?))
  loader: countUnread,                   // (params: P) => Promise<T> | T
  // load: "on-demand",                  — opt out of push (slow loader; tabs refetch over HTTP)
});
// contributions: [...unreadServed.declare]

// web/ — read
useLive(notificationsUnread);            // ResourceResult<T>
useLive(taskDetail, { id });             // params required iff declared
```

- **Declare.** The key is a positional string literal (the scanners read it).
  `params` is a const tuple of names; `P` is derived from it (no phantom
  generic to restate). There is **no `initial`**: not known yet is `pending`,
  never a stand-in — the descriptor has no `initialData`, so a `liveValue` can
  not be an `useOptimisticResource` base (tsc error). `preload` is typed `never`
  beside `params`: only a param-less value has a default tuple the server can
  load before a tab names one. A preloaded value sets `defaultParams: {}`, the
  tuple both the boot snapshot and `useLive(v)` use. `live: "value"` is the
  discriminant `useLive` dispatches on.
- **Preload.** `"boot"`: hydrated by the boot snapshot before first paint
  (settled on the first render), the owning plugin pinned eager, and a
  DB-backed one L2-persisted. `"boot-and-keep"`: the same, plus the client
  cache is never garbage-collected (`gcTime: Infinity`) — for small values read
  by surfaces that mount late.
- **Serve.** `source` is required and says where the truth lives:
  - `"db"`: the loader's read-set is captured at the DB pool chokepoint; a change
    to any table it read recomputes every subscribed tuple (full recompute, no
    scope policy — a keyed payload is a collection). No `notify`, at runtime
    too.
  - `"external"`: truth outside Postgres; the served value has `notify(params?)`.
  - `load` defaults to `"push"` (the value is recomputed and pushed);
    `"on-demand"` is the runtime's `invalidate` (each tab refetches over HTTP).
  - **The bound rule is a type:** a `"db"` value whose type is an array or a
    string-indexed record must pass `unbounded: { reason }` (recorded on the
    served value and shown in the docs), and nothing else may. An external
    array is bounded by the process holding it.
  - Returns `ServedValue` = the runtime `Resource` + `source` + `unbounded?` +
    `keys` (`[key]`) + `declare` (a 1-tuple — spread it like a collection's);
    the external arm adds `notify`. `compileValue` is the same derivation
    without registering (tests register it on their own runtime).
  - Deliberately not yet: `debounceMs`, `dependsOn`, `revalidate`,
    `ackChannel`, a read-side `select` — each arrives with the first migrated
    call site that needs it.
- **Read.** `useLive(value, params?)` → `ResourceResult<T>` (it delegates to
  `useResource`; the params object is the canonical tuple). A value with no
  placeholder makes no HTTP fetch on mount — the WS sub-ack fills it (the
  query stays disabled until a value lands; `refetch()` still works).

## Internals

- `core/` (browser-safe): `liveCollection(key, { row, id, filterable, sortable, default, maxLimit, preload? })`
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

- Window: `{ limit: string; where?: string; order?: string }` — `where` is the
  filter language's `encodeFilter` output (e.g.
  `{"column":"enabled","op":"eq","operand":true}`), `order` canonical JSON; each
  present only when it differs from the default, so the default window stays
  byte-identical `{ limit: "100" }`.
- Groups: `{ groupBy: string; limit: string; where?: string }` — `where` is the
  same encoding, present only when not the absent filter.
- Decode is STRICT for both: the filter through `decodeFilter` (throws unless
  exactly canonical), the rest by re-encoding — so one logical query can never
  name two subscriptions.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, or an explicit id set) and useLiveRow (one row: pending, found, or determinately absent). Unified live-resource API, server half: serveValue (a liveValue's loader, from Postgres — change-feed driven, a collection-shaped payload must declare `unbounded: { reason }` — or from an external source with notify(); pushed by default, `load: "on-demand"` to refetch over HTTP instead) and serveCollection (binds a liveCollection's row fields to a table's columns — the projection is exactly the row schema — ANDs an optional base `where` into every read, and compiles its window + `:rows` point resources through windowQueryResource and its `:groups` GROUP BY push value); every filter compiles through the filter language's filterSql.
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
    - `network/live/filter.filterSql`
  - Exports (types):
    - `CollectionSource`
    - `CollectionSpecs`
    - `CompiledValue`
    - `LiveValueSource`
    - `ServeCollectionOptions`
    - `ServedCollection`
    - `ServedExternalValue`
    - `ServedValue`
    - `ServeValueOptions`
  - Exports (values):
    - `compileCollection`
    - `compileValue`
    - `serveCollection`
    - `serveValue`
- Core:
  - Uses:
    - `infra/query-resource.PointQueryResourceContract`
    - `infra/query-resource.pointQueryResourceDescriptor`
    - `infra/query-resource.WindowQueryResourceContract`
    - `infra/query-resource.windowQueryResourceDescriptor`
    - `network/live/filter.decodeFilter`
    - `network/live/filter.encodeFilter`
    - `network/live/filter.Filter`
    - `network/live/filter.Filterable`
    - `network/live/filter.FilterScalar`
    - `network/live/filter.LIST_MAX`
    - `primitives/live-state.registerResourceDescriptor`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.ResourcePreload`
  - Exports (types):
    - `LiveCollection`
    - `LiveCollectionSpec`
    - `LiveColumnFilter`
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
    - `LiveOrderBy`
    - `LiveParamValueSpec`
    - `LivePreload`
    - `LiveQuery`
    - `LiveReservedColumn`
    - `LiveRowSchema`
    - `LiveSortDirection`
    - `LiveValue`
    - `LiveValueParams`
    - `LiveValueSpec`
    - `LiveWhere`
    - `LiveWhereObject`
    - `LiveWindowCodec`
    - `LiveWindowDescriptor`
    - `LiveWindowParams`
  - Exports (values):
    - `liveCollection`
    - `liveValue`
- Cross-plugin:
  - Imported by:
    - `apps/events/events-core`
    - `apps/events/sources/source-field`
    - `shell/notifications`
- Sub-plugins:
  - **`filter`** — The filter language's SQL half: renderOpSql renders one op's dialect-free template over a rendered target (operands as params cast to the domain's SQL type, lists as ONE array param), and filterSql compiles a whole and/or Filter tree over a column → rendered-SQL target map.

<!-- AUTOGENERATED:END -->
