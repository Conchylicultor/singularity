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
useLiveRow(eventSources, sourceId);                                   // one row (a null id: not found)
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
  names (they spell a filter tree). None of the three descriptors has a
  placeholder (`initialData?: never`, as on a `liveValue`): a window, id set or
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
  - Hand-written loaders are out of scope for now — keep those on
    `windowQueryResource` / `defineResource`.
- **Read — `useLive(c, query?)`.** The query's SHAPE picks the resource; there is
  one hook for every list read, and a separate hook only where the result has
  different STATES (`useLiveRow`).
  - A window query returns `LiveListResult<Row>` — `ResourceResult<Row[]>`
    (`status: "loading" | "error" | "ready"`, see `live-state/CLAUDE.md`) whose
    `ready` arm adds `canGrow` (`rows.length === limit && limit < maxLimit`),
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
  - An `{ ids }` query reads the point sibling: `ResourceResult<Row[]>`, no
    paging fields.
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
  params: ["id"],                        // → P = { id: string }
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
useLive(taskDetail, { id });             // params required iff declared
useLive(taskDetail, id === null ? null : { id });  // no subject yet: skipped, pending
```

- **Declare.** The key is a positional string literal (the scanners read it).
  `params` is a const tuple of names; `P` is derived from it (no phantom
  generic to restate). There is **no `initial`**: not known yet is `loading`,
  never a stand-in — the descriptor has no `initialData` (an optimistic read of
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
  - **The params gate.** The descriptor's `validateParams` (run by the runtime
    on the canonical tuple, before a sub registers) refuses an unknown name, a
    non-string value, or a missing REQUIRED name as `contract-mismatch`; an
    absent optional param is valid.
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
    subscription), a read-side `select`, scoped `rel()` edges — see
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
`useWindowResource`, deleted (at the phase-3 Wave 3 and Wave 4 barriers), and
`windowQueryResourceDescriptor` / `pointQueryResourceDescriptor`, now internal
to `network/live` (`core/internal/window-descriptor.ts`, Wave 7) — still
listed so a stale import is told its replacement, not only tsc's "no exported
member". Its `ignores` list is the
burndown inventory: the substrate globs plus every file not migrated yet,
grouped under the wave or item that removes it
(`research/2026-09-27-global-live-resources-phase3-bulk-migration.md`).
**Never add an entry for new code** — declare it with `liveValue` /
`liveCollection`. A migration must delete its files from the list:
`lint/index.test.ts` fails on a listed file that no longer imports one.

## Internals

- `core/` (browser-safe): `liveCollection(key, { row, id, filterable, sortable, default, maxLimit, preload? })`
  (or `{ row, id }` alone — lookup-only, minting `` `${key}:rows` `` only)
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

- Description: Unified live-resource API, read half: useLive (a collection's bounded window — where/orderBy/limit with canGrow/growing/loadMore — a grouping of a filterable column's values with counts, paged the same way, or an explicit id set) and useLiveRow (one row: loading, failed, found, or determinately absent), with mapRow reducing a row read to a ResourceResult of what the row means. Unified live-resource API, server half: serveValue (a liveValue's loader, from Postgres — change-feed driven, a collection-shaped payload must declare `unbounded: { reason }` — or from an external source with notify(); pushed by default, or refetched over HTTP when the liveValue declares `load: "on-demand"`) and serveCollection (binds a liveCollection's row fields to a table's columns — the projection is exactly the row schema — ANDs an optional base `where` into every read, and compiles its window + `:rows` point resources through windowQueryResource and its `:groups` GROUP BY push value — only `:rows` for a lookup-only collection — encoding a column type's declared wire form in JS per row); every filter compiles through the filter language's filterSql. Unified live-resource API, central half: serveValue for a liveValue declared `origin: "central"` — the external arm only (central has no change feed), registered through the central plugin's `resources: [served]`; its options compile through the same code as the worktree serveValue.
- Web:
  - Uses:
    - `primitives/live-state.ResourceDescriptor`
    - `primitives/live-state.ResourceError`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
  - Exports (types):
    - `LiveIdsQuery`
    - `LiveListResult`
    - `LivePaging`
    - `LiveRowResult`
  - Exports (values):
    - `mapRow`
    - `useLive`
    - `useLiveRow`
- Server:
  - Uses:
    - `database.db`
    - `database/sql-column.ColumnWire`
    - `database/sql-column.columnWireCodec`
    - `database/sql-column.WireCodec`
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
    - `LookupCollectionSpecs`
    - `ServeCollectionOptions`
    - `ServedCollection`
    - `ServedExternalValue`
    - `ServedLookupCollection`
    - `ServedValue`
    - `ServeValueOptions`
  - Exports (values):
    - `compileCollection`
    - `compileValue`
    - `serveCollection`
    - `serveValue`
- Core:
  - Uses:
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
    - `LiveCentralValueSpec`
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
    - `LiveLookupCollection`
    - `LiveLookupSpec`
    - `LiveOrderBy`
    - `LiveParamValueSpec`
    - `LivePreload`
    - `LivePreloadedParamValue`
    - `LivePreloadedParamValueSpec`
    - `LiveQuery`
    - `LiveReservedColumn`
    - `LiveRowSchema`
    - `LiveRowsCollection`
    - `LiveSortDirection`
    - `LiveValue`
    - `LiveValueOrigin`
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
    - `active-data`
    - `active-data/prototype`
    - `apps/browser/bookmarks`
    - `apps/browser/history`
    - `apps/browser/start-page`
    - `apps/chord/curriculum`
    - `apps/chord/progress`
    - `apps/chord/song-index`
    - `apps/chord/trainer`
    - `apps/deploy/analytics/dashboard`
    - `apps/deploy/composition`
    - `apps/deploy/deployments`
    - `apps/deploy/health`
    - `apps/deploy/local-serve`
    - `apps/deploy/remote-deploy`
    - `apps/deploy/servers`
    - `apps/events/events-core`
    - `apps/events/sources/source-field`
    - `apps/mail/mail-core`
    - `apps/mail/reading-pane`
    - `apps/mail/sync`
    - `apps/mail/sync-status`
    - `apps/mail/threads`
    - `apps/pages/agent-origin`
    - `apps/pages/history`
    - `apps/pages/page-outline`
    - `apps/pages/page-tree`
    - `apps/pages/starred`
    - `apps/pages/trash`
    - `apps/prototypes/canvas`
    - `apps/prototypes/files`
    - `apps/prototypes/gallery`
    - `apps/prototypes/present`
    - `apps/prototypes/thumbnails`
    - `apps/settings/config`
    - `apps/sonata/library`
    - `apps/sonata/playback-history`
    - `apps/sonata/rich/chord-mode`
    - `apps/sonata/rich/key-mode`
    - `apps/sonata/rich/rhythm-controls`
    - `apps/sonata/sources/midi`
    - `apps/sonata/track-mixer`
    - `apps/sonata/transpose`
    - `apps/studio/compositions/release/release-artifact`
    - `apps/studio/compositions/release/release-info`
    - `apps/studio/compositions/release/release-logs`
    - `auth`
    - `auth/apple-signing/setup-wizard`
    - `auth/google/setup-wizard`
    - `build`
    - `build/build-fix`
    - `build/build-info`
    - `build/deployment`
    - `build/serve-composition`
    - `config_v2`
    - `config_v2/settings`
    - `conversations`
    - `conversations/agents`
    - `conversations/conversation-category`
    - `conversations/conversation-preprompt`
    - `conversations/conversation-progress`
    - `conversations/conversation-view/allow-monitor`
    - `conversations/conversation-view/artifacts`
    - `conversations/conversation-view/artifacts/prototype`
    - `conversations/conversation-view/code`
    - `conversations/conversation-view/commits-graph`
    - `conversations/conversation-view/drop-and-exit`
    - `conversations/conversation-view/jsonl-viewer`
    - `conversations/conversation-view/jsonl-viewer/event-counter`
    - `conversations/conversation-view/jsonl-viewer/subagents`
    - `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`
    - `conversations/conversation-view/jsonl-viewer/tool-call/workflow`
    - `conversations/conversation-view/notes`
    - `conversations/conversation-view/op-status`
    - `conversations/conversation-view/push-and-exit`
    - `conversations/conversation-view/turn-summary`
    - `conversations/conversations-view/queue`
    - `conversations/summary`
    - `database/query-deadline`
    - `debug/claude-cli-calls`
    - `debug/queue`
    - `debug/queue-health`
    - `debug/sentinel`
    - `fields/secret/config`
    - `infra/claude-cli`
    - `infra/claude-cli/availability`
    - `infra/events`
    - `infra/git/git-watcher`
    - `infra/jobs`
    - `infra/trash`
    - `page/annotations/agent-notes/authorship`
    - `page/annotations/todo/task-link`
    - `page/editor`
    - `page/editor-collab`
    - `page/links`
    - `page/prompt/link`
    - `plugin-meta/plugin-health`
    - `primitives/data-view/custom-columns`
    - `primitives/data-view/view-order`
    - `primitives/usage-rank`
    - `release`
    - `review`
    - `review/code-review`
    - `review/plugin-changes`
    - `shell/notifications`
    - `tasks/attempt-work`
    - `tasks/auto-start`
    - `tasks/auto-start/launch-option`
    - `tasks/task-description`
    - `tasks/task-effort`
    - `tasks/task-events`
    - `tasks/task-preprompt`
    - `tasks/task-title`
    - `tasks/task-track`
    - `tasks/tasks-core`
    - `ui/icons/sprites`
- Central:
  - Exports (types): `CentralServedValue`
  - Exports (values): `serveValue`
- Sub-plugins:
  - **`filter`** — The filter language's SQL half: renderOpSql renders one op's dialect-free template over a rendered target (operands as params cast to the domain's SQL type, lists as ONE array param), and filterSql compiles a whole and/or Filter tree over a column → rendered-SQL target map.

<!-- AUTOGENERATED:END -->
