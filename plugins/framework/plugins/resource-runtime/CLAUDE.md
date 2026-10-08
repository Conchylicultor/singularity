# resource-runtime

The single, parameterized live-state resource runtime shared by both
`@plugins/framework/plugins/server-core/core` (per-worktree) and
`@plugins/framework/plugins/central-core/core` (the shared central process).

It owns `defineResource`, the broadcast machinery (DAG cascade, keyed delta sync,
Layer-2 scoped recompute, `withNotifyBatch`), and the `/ws/notifications` +
`/api/resources/:key` handlers. `createResourceRuntime(opts)` returns a fresh,
fully-isolated instance (own registry, sockets, DAG, batch state); each facade
calls it once with its own hooks and re-presents the runtime's types/values as its
own stable public surface, so its callers and `Resource.Declare` contributors
never see this plugin directly.

Plugins do not call it to add live state: they declare with `network/live`'s
`liveValue` / `liveCollection` and serve with `serveValue` / `serveCollection`,
which compile to `defineResource` (`plugins/network/plugins/live/CLAUDE.md`). The
only direct callers left are that substrate and the tree / revision-tick
resources (Resources page items 3 / 7). `mode` has no default: a non-keyed
definition states `push` or `invalidate` (the flat `DefineResourceInput` and the
two-arg `ServerResourceOptions` require it; the keyed `KeyedServerResourceOptions`
has none), because the old implicit `invalidate` was a delivery choice nobody
made.

**Optional params have one spelling.** A contract may declare `optionalParams`
(a `liveValue`'s `"scopeId?"`, threaded through the two-arg form onto the
registry entry). The runtime canonicalizes a tuple's params where they ENTER it —
every `sub` / `sub-batch` / `unsub` / `sub-acks` frame, the HTTP read, `notify`,
and each tuple a `dependsOn` map derives — dropping an `undefined` value and a `""`
for a declared-optional name (`canonicalTuple`). So `paramsKey`, the loader and
subscriber routing only ever see one tuple for `{ path }`, `{ path, scopeId: "" }`
and `{ path, scopeId: undefined }`. Every frame sent back ECHOES the canonical
tuple, so a sender must canonicalize the same way to match them — live-state's
client does, with the very same function (`packages/canonical-params`, one copy
for both ends); a frame that arrives non-canonical is reported once per key.
`loadResourceByKey`, `measureSubscribeCycle` and the `Resource.load` handle
canonicalize too. The flat one-arg forms take no `optionalParams` (tsc): the rule
comes from the shared client descriptor. Pinned by `runtime-optional-params.test.ts`.

**Flush is level-parallel.** `flushNotifies` walks the dependsOn DAG grouped by
longest-path depth (`rebuildDag` stamps `entry.depth`; every edge strictly
increases depth, so a level has no intra-level edges). Each level's entries run
concurrently (`Promise.all(level.map(drainEntry))`) with a barrier between levels:
a cascade merged into a strictly-deeper downstream has settled before that
downstream drains, and a slow loader cannot head-of-line-block an unrelated entry
at the same or earlier depth
(`research/2026-06-19-global-parallel-flush-notifies.md`). `drainEntry` opens with
a synchronous snapshot+clear of pending and a debounce-timer cancel, and keeps its
per-pk loop sequential so versions/snapshots stay monotonic. A `flushRunning`
mutex + `flushAgain` rerun flag guarantee two flushes never overlap: a notify
landing mid-flush sets `flushAgain` and is re-drained by the live flush. Pinned by
`runtime.test.ts` §"flushNotifies — level-parallel".

**The heartbeat ping carries `flushOpenMs`** — the running flush pass's age, 0
when idle. One never-settling loader freezes every push behind the mutex while
pings keep flowing (2026-09-11: 25 min, green health dot —
`research/2026-09-11-global-live-updates-frozen-by-stray-fd-close.md`), so the
ping reports it and the health report's Connection row flags ≥ 30 s. The stamp
is **re-taken at the start of each re-drain pass**, not once per mutex hold: a
steady notify stream holds the mutex across many short delivering passes, which
is not a stall. Pinned by `runtime-heartbeat.test.ts`.

**A resource loader must never do synchronous IO** (convention — nothing enforces
it). Loaders run inside this shared flush cycle, so a synchronous syscall
(`readFileSync`, `readdirSync`, `openSync`, …) freezes the event loop for its whole
duration, blocking every other loader, every `ws.send` and every HTTP handler. Use
`node:fs/promises` (or another threadpool/async primitive); the flush cycle already
`await`s loaders returning `Promise<T>`.

Every injected hook (`ResourceRuntimeOptions`) is JSDoc'd on the type — don't
restate them here. They are the server/central split: `server-core/core/resources.ts`
binds all of them (profiler spans, wait attribution, error reporting,
`Resource.Declare` owner metadata); central calls `createResourceRuntime()` with
NONE, so every hook must degrade to identity/no-op. `console.error` always fires
inside the runtime — `reportError` is additive, never the only report. Wait
attribution: `research/2026-06-19-global-wait-attribution-instrumentation.md`.

It is **acyclic**: besides `zod` and `bun` types it imports only
`@plugins/packages/plugins/inflight/core` (a leaf) — and the leaf
`@plugins/packages/plugins/canonical-params/core`, the params rule it shares with
the browser (see *Optional params* above) — and `inflight` does double duty here:
read-path single-flight coalescing, and the correctness-bearing freshness floor
(`notBefore`) the push path uses to refuse a flight that started before the change
it is announcing — see *Flight freshness* below. It declares its own local
`WsData`/`WsHandler` interfaces
(byte-identical to the facades' `types.ts`) rather than importing them — importing
either facade would cycle; the returned `notificationsWsHandler` is structurally
assignable to each facade's `WsHandler`.

See `research/2026-06-08-global-unify-live-state-resource-runtime.md` for the
unification rationale and `plugins/primitives/plugins/live-state/CLAUDE.md` for
the client side and the keyed/scoped delta semantics.

## `ScopePolicy` — the two questions a keyed resource must answer

The two-arg keyed `defineResource` intersects `ScopePolicy`, so both are answered
at the declaration site or the resource does not compile.

1. **Which RESOURCE does a change belong to?** A compiler-minted route plan
   (`routes` — see *Scoped change routing*; every compiled collection, `all`
   included), the legacy `identityTable`, or the explicit
   `recompute: { kind: "full", reason }` opt-out.
2. **And which subscribed TUPLE of it owns the changed row?** Under `routes`,
   exactly one of `membership` (a bounded window or point set) /
   `scopedMembership` (the unbounded alias — its `orderSignatureOf` required).
   Under `identityTable`, exactly one of `membership` / `scopedMembership` /
   `fanOut: { reason }` (every tuple genuinely must be woken). A routed plan
   names its tuples, so it has no `fanOut`.

Question 2 used to have no spelling, so its answer was always "wake all of them":
every subscribed tuple re-ran its own read, found the changed row was not its
own, and diffed to empty. No frame shipped, which is what hid the cost — the read
IS the cost. A tuple that names ONE row is a lookup-only `liveCollection` read by
id (its `:rows` point membership routes a change only to the tuples holding that
id); the own-row `rowIdentity` arm that once answered it went with its last
caller.

`fanOut` normalizes to NOTHING in `createResource`: a declaration requirement
only, byte-identical at runtime, exactly as the `recompute` arm is. It is deliberately a SIBLING of
`membership` and never a `kind` inside `KeyedMembership` — a membership record is
truthy at `drainEntry`'s membership branch and at `applyDbChange`'s INSERT/DELETE
scoping decision, so a `kind: "fan-out"` member would reroute the drain, which is
the behaviour change the arm exists to avoid.

A `fanOut` `reason` must be a real sentence about that resource (a composite pk
the change feed emits no ids for; params keying a foreign column; a param-less
single tuple). A wrong reason is worse than none — the next reader believes it.

The `query-resource` compilers build their opts behind an `as … & ScopePolicy`
cast that `tsc` cannot see through, so each states its policy as an annotated
`const scopePolicy: ScopePolicy<P>` first; the `keyed-resource-scope` check is
the backstop for anything that still slips past.

## Bounded membership (`membership`) and the `scopedMembership` alias

A keyed own-identity resource may declare a **membership selector** (only on the
two-arg keyed form, whose scope policy names the identity — routed `routes` or
the legacy `identityTable`; `createResource` throws otherwise). It makes an INSERT / DELETE / where-flip on the identity table
ship an incremental delta instead of a FULL recompute — the runtime refills only
the changed rows and reconciles membership against the per-pk snapshot via
`diffKeyedScopedMembership`. Absent ⇒ byte-identical to the pre-M5
FULL-on-membership-change behavior. Three shapes, folded into one internal
record (see `research/2026-07-03-global-scoped-membership-m5.md` and
`research/2026-07-18-global-bounded-working-set-resource-contract.md`):

- **`membership: { kind: "window", windowIdsOf }`** — the params tuple names a
  **bounded ordered window** (`WHERE … ORDER BY … LIMIT n`). `windowIdsOf(params)`
  returns the bounded ordered id list; the entry's loader at the same params MUST
  be the matching windowed query — so the FULL branch (no snapshot, sticky-FULL,
  a subscribed tuple whose sub-ack load failed) is **bounded by construction**: "FULL"
  means the window loader, never a whole-collection sweep. A membership change
  costs O(changed) + O(window), never O(collection). An EMPTY scoped pending never
  reaches it: that is a skip on every entry kind (see *Scoped change routing*), so it
  no longer reloads — and incidentally heals — a tuple with no snapshot; a tuple
  whose sub-ack load failed is healed by its client's `sub-error` HTTP fallback.
- **`membership: { kind: "point", idsOf }`** — the params tuple names an
  **explicit id set** (`idsOf(params)` decodes it; pure, sync, cheap — it runs
  per subscribed tuple on the feed-routing path). `applyDbChange` routes a change
  to a tuple **iff the changed ids intersect its set** (empty intersection = no
  notify, no version bump); no ids query ever runs; entrants append (point sets
  are unordered); never fans out to the `{}` fallback tuple.
- **`scopedMembership: { orderOf, orderSignatureOf? }`** (`AliasMembership`) — the
  M5 alias ≡ an **unbounded window** (`windowIdsOf = orderOf`, no LIMIT), the
  only membership shape L2 persists. `orderSignatureOf` is the window's seam (see
  *Order signature* below), optional on the `identityTable` arm and REQUIRED on
  the routed arm (type, plus a throw for an untyped caller): a compiler always
  knows its ORDER BY, so an in-place reorder of a routed alias can never go
  stale. Mutually exclusive with `membership`.

The window path (`drainMembershipScoped`, `drainEntry` branch 4) classifies each
flush against the prior snapshot — *entered* (a refilled id not already a member)
/ *exited* (a requested id the refill omitted, or a deleted member):

- **Bounded window**: any entered-or-exited runs `windowIdsOf` once (O(window) —
  it is both the entrant arbiter and the tail-pull source), then **backfills**
  window ids whose bytes neither the client base nor the refill holds (the new
  tail row after a leaver) with one extra scoped refill. An entrant sorting past
  the tail diffs to empty → no frame, no version bump. A DELETE of an id outside
  the snapshot is a total no-op (a window is a prefix of the total order).
- **Alias (unbounded)**: `orderOf` runs **only on an entry or an order move**
  (`entered || orderMoved` — a member whose order signature moved, for an alias
  that declared one); an exit-only or in-place change derives its order from the
  prior snapshot (zero queries for a pure DELETE); no backfill.
- **Both**: a pure in-place change (all refilled ids already members, no order
  impact) never runs the ids query — one upsert, `order` omitted.
- **Order signature** (`membership.window.orderSignatureOf?(row, params)`, and
  the alias's `scopedMembership.orderSignatureOf`): a pure cheap encoding of exactly the fields THAT tuple's ORDER BY
  reads (`params` is the tuple the row belongs to — every call site passes it, so
  a stored and a fresh signature of one tuple are cut alike). The runtime
  keeps a per-member signature map beside the per-pk snapshot (window-sized,
  seeded/evicted in lockstep) and treats a refilled MEMBER whose signature moved as
  membership-affecting — one `windowIdsOf` re-derive, delta with the fresh bounded
  `order` — so an UPDATE bumping an order column reorders the wire window instead
  of going stale. A missing/failed signature is treated as moved (fail-safe: one
  extra bounded ids query, never a stale order). Per-case behavior is pinned by
  `runtime-window-membership.test.ts` §"order signature". Absent ⇒ an in-place
  UPDATE never reorders the window until the next membership delta, so the ORDER BY
  must then be update-stable; query-resource always derives one for compiled
  windows, downgrading that stability rule to a cost note (one O(window) ids query
  per order-column update).

A **membership delta always ships the full `order`** — the client rebuilds the
keyed array purely from `order`, so an incremental membership change must assert
it (this is also how a squeezed-out tail row leaves the client without a
`deletes` entry). `diffKeyedScopedMembership` rebuilds `nextSnapshot` FROM the
wire `order` (snapshot ≡ order) and sanitizes upserts/order to surviving ids, so
an `orderedIds` disagreement or concurrent delete drops out with no client
drift-resub. It **throws** if a refill id entered membership but no `orderedIds`
was supplied.

**Persistence: bounded entries are structurally excluded.** `drainEntry`'s
`persisted` gate is `!externalSource && !membershipBounded(entry) &&
shouldPersist(key)` — a bounded window or point entry is never L2-persisted
(read off the definition, never by resource name), never keeps its snapshot
across N→0, and uses the hash snapshot encoder. Only the **alias** is persisted
incrementally: a persisted (`preload`) scopedMembership entry keeps its snapshot
across N→0 (it recomputes on every change regardless of subscribers and needs
the diff base), and a scoped drain that changed it arms a **floor persist** (see
*L2 persists* below) rather than writing the row itself; branch 2/3
(`drainMembershipFull`) seeds/replaces the snapshot even with zero subs so the
next incremental diff has a base, and REPLACES the row. A DELETE
cascades downstream FULL (a vanished row has no value for an `affectedMap` to
translate); inserts/updates cascade scoped (backfilled tail ids do NOT join the
cascade set — they did not change in the DB, they only entered this window's
view).

At **boot**, the L2 layer restores each persisted alias's in-memory diff base from
its durable value BEFORE catch-up: `live-state-snapshot`'s `onReady` reads the L2
row and calls the runtime's `seedPersistedSnapshot(key, "{}", value, base)` (which
seeds `entry.snapshots` + order sigs via the same `snapshotOf` primitive the FULL
rebuild uses, and — only on the branch that actually seeds — the snapshot's base
floor, `base.position`). So the first post-boot change — and every downtime change catch-up replays —
is a scoped refill, not the FULL O(collection) rebuild it used to pay because the
diff base started empty. The seed is a no-op once a snapshot exists (a sub-ack that
arrived first is never clobbered), and it targets only unbounded-window aliases
(`unboundedWindowKeys`), the only shape whose durable value is byte-sufficient to
reconstruct the base. It answers a `SeedOutcome` — `seeded`, `skipped` (no
alias, or a snapshot already there), or **`invalid`** (A30): the value is
`safeParse`d against the entry's payload schema (`z.array(row)`, the check
every loader output passes) before anything is seeded, and one that does not
parse — a row schema moved in a way the L2 definition does not fingerprint, an
opaque transform's body — seeds nothing; the caller treats the row as missing
(live-state-snapshot clears it and recomputes the key). The snapshot-present
and alias checks run BEFORE the parse, so a late value over a fresher base is
`skipped`, never `invalid`. `validatePersistedValue(key, value)` is the same
parse on its own, seeding nothing (`valid` | `invalid` | `skipped` for a key
that is no alias): live-state-snapshot runs it over every persisted alias row
in `onReadyBlocking` and clears the rows that fail, before readiness flips —
boot-snapshot's persisted fast path is open from readiness, before the seed.

## L2 persists: replace and floor (`PersistMeta`)

The `persistSnapshot` hook takes `{ mode, definition, guardTables }`, and per
(key, pk) its calls are serialized (`persistChains`), never concurrent:

- **`replace`** — every FULL recompute of a persisted entry (`drainMembershipFull`,
  the legacy FULL branch): the value, floored by its flight's own watermark, with
  the run's read-set as `guardTables` (written as `tables_read`). The row's
  `position`, `position_at`, `tables_read` and definition are all replaced. A
  replace cancels an armed floor window SYNCHRONOUSLY, before it enqueues (and
  re-arms it if the write fails): the scoped changes it held committed before
  this value's read began, and the FULL drain rebuilds the snapshot only after
  the replace resolves — a window firing mid-write would chain a floor link that
  writes the pre-replace snapshot and floor over the fresh row.
- **`floor`** — a persisted alias's scoped drains. A drain whose snapshot changed
  arms ONE trailing window (`persistWindowMs`, default 2 s, unref'd, fixed — a
  steady stream still persists every window); on fire, the value is
  reconstructed from the snapshot as it stands then (`valueOfSnapshot`,
  `JSON.parse` of each retained canonical-JSON entry → byte-identical jsonb to a
  FULL persist) and floored by the snapshot's **base floor**. L2 only ever LOWERS
  the row's position to it (`LEAST`) and keeps `position_at` / `tables_read`; a
  missing row is inserted with the floor and `guardTables` (the route tables, or
  the read-set union — never empty, so A6 judges a first INSERT too).

**The base floor** (`RegistryEntry.baseFloors`, per pk, unbounded-window aliases
only) is the watermark of the FULL read the snapshot was last rebuilt from: set by
`drainMembershipFull` (the flight watermark), the sub-ack seed (the `gatedRead`
watermark) and `seedPersistedSnapshot` (the row's position) — and forgotten when
that read's watermark is unknown, which skips floor persists until the next
rebuild. A scoped drain that finds the snapshot re-seeded under it (a sub-ack
landed while it read) writes `prev` + its refill and restores `prev`'s floor, never
the sub-ack's newer one. A scoped drain never captures one: its refill reads only the requested
ids, so a drain-time capture could pass over a commit at a lower xid that this
tuple has not been routed yet, and catch-up would skip it forever.

**The definition** (`RoutePlanInput.definition`, a compiler's fingerprint of its
SQL, read off the entry's plan by `definitionOf` — never copied onto the entry,
so a deferred entry bound later carries it too) rides every persist, and `persistedDefinitions()`
— `persistedKeys()`'s twin — is the expected map every L2 read matches rows
against (live-state-snapshot's usable-row predicate). A non-keyed `ReachPlan`
carries none (`definition?: never`).

`keptSnapshotValue(key)` hands the boot snapshot a persisted alias's current value
from its kept snapshot (fresher than the trailing row); `dropPendingPersists()`
drops the armed windows at shutdown (catch-up replays what they held). `_debug`
shows a persisted key's `definition`, `lastReplaceAt`, `lastFloorAt` and
`l2PositionAt`. Pinned by `runtime-scoped-membership.test.ts` §"L2 persisted floor
persist", `runtime-catchup.test.ts` and `runtime-table-routing.test.ts` §"the
plan's definition".

## Scoped change routing (`routes` + `routeTableChange`)

The legacy router (`applyDbChange`) knows one thing per resource: its
`identityTable`. A write to any OTHER table its loader reads is FULL for every
subscribed tuple of that key — even tuples whose SQL never reads that table, since
the read-set is one union per key. A **routed** resource instead declares, as data
its compiler emits, a `RoutePlan` (`core/routing.ts`, SQL-free, names no
contributor): every table occurrence the query may read (`Route` — its `HostMap`
from changed rows to host ids: `identity`, `alias`, `reverse`, `full`, where an
`identity` or `alias` map with no `column` reads the table's single-column PK off
the change's ids — an extension keyed by its host's id; the columns
the SQL references; an optional static key filter) and a pure per-tuple
`usesOf(params)` naming the occurrences THAT tuple reads, in the `membership` or
`value` role. `routeTableChange(TableChange)` serves routed entries; the legacy path
serves everything else (`tableToResources` skips routed keys), so each change
reaches each entry exactly once and resources move over one at a time. Design:
`research/2026-09-29-global-scoped-change-routing.md`.

- **Declared on a membership arm only** (`ScopePolicy`): `routes` replaces
  `identityTable` (derived from the unencoded identity route) and has no `fanOut` /
  `recompute` spelling — a scoped refill never deletes, so only a membership drain
  turns a routed change into an exit. Route ids are unique (A9: an unknown id from
  `usesOf` is reported and FULLs that tuple). A `dependsOn` edge whose upstream is a
  routed entry throws (A5, "route the table, not the resource") in either
  registration order, and so do routes on an external resource (its truth is not
  in Postgres). A routed entry takes no `dependsOn` of its own either (type +
  throw): it routes the tables it reads, and a cascade would serve it a second
  time, a FULL overriding a scoped routed refill.
- **`recomputeOn` — a routed entry's non-table input.** A routed entry may name
  upstream TUPLES of EXTERNAL resources (`{ resource, params }`; typed on the
  routed `ScopePolicy` arms only, `never` elsewhere) whose change moved the
  compiled SQL itself — a DataView surface's custom column definitions. Each such
  change FULL-recomputes every subscribed tuple and drops their memoized
  `usesOf` answers. The upstream must be registered first and external (a
  DB-backed upstream's writes are the entry's own routes to name) — both throw in
  `createResource`. It is an edge on the upstream (`routedRecompute`), filtered to
  the one upstream tuple, so another tuple's notify reaches nothing.
- **The trigger layout is derived from the routes.** `routedTableRequirements()`
  folds every bound routed entry's routes into one `TableLayoutRequirement` per
  table (`tableLayoutRequirements` in `core/routing.ts`, pure): the CARRY columns
  (every map's `column`, every `rows` key, every `Route.match` column — a route
  declares the columns a tuple's `match` may name, and a use matching on an
  undeclared one is reported and FULLs the tuple) and `reads` (each route's
  `columns`, distinct — the feed compares only the columns of the sets narrower
  than the table, since only such a route can be skipped). The change feed
  installs the richer trigger on exactly those tables from it (see
  `database/change-feed/CLAUDE.md`), so `TableChange.keys` / `unchanged` arrive
  for routed tables and the key filter and the gate below act on them.
- **Minted, never written.** A route's `columns` decide which updates reach the
  resource, so a plan is compiler-made: `RoutePlan` / `ReachPlan` carry a
  module-private brand only `mintRoutePlan` / `mintReachPlan` put on them (a plan
  literal is a `tsc` error), `createResource` throws on an unminted plan an `as`
  cast let through, and the `resource-runtime:compiled-routes` check (`check/`)
  allows the minters only in `infra/query-resource`'s `routes.ts` and test code.
- **A non-keyed entry routes through `reach`** (`ReachPlan`, on
  `ServerResourceOptions`, exclusive with `identityTable`): the same per-tuple
  `usesOf`, but every route is `full` — a push value has no host ids to refill, so
  a change to a table the tuple reads recomputes it and a change to any other
  reaches nothing (at most an ack). A collection's `:groups` is the caller. A keyed
  entry, a non-`full` route, an `identityTable` beside it or an external resource
  throws in `createResource`.
- **Every `serveCollection` resource is routed** (window, `:rows` and `:groups`,
  compiled by `infra/query-resource`), so none of them depends on the loader
  read-set to be reached.
- **The read-set debug pane** (`/api/resources/_debug`) carries each routed
  entry's routes (`routes`: id, table, map kind, a `full` route's reason; `null`
  for a legacy entry). `debug/read-set` lists every `full` route beside the
  `recompute: full` opt-outs, and checks a routed entry's captured read-set
  against its route tables (A7).
- **The drift guard (A8).** A routed entry is reached ONLY through its routes, so
  after each loader run the key's per-run capture (`lastReadSet`) must be a subset
  of its route tables — a table outside them is one whose writes it never sees —
  or of its plan's `derivedReads` (A22): a rollup no route may name (A1), every
  source of which `mintRoutePlan` asserts is a route table of the plan.
  A miss is reported once per table (`route drift for <key>`), or fails the load
  under `strictRoutes` (server-core sets it under a test runner). With no capture
  wired (central, the DB-free harness) the guard is off; routing never depends on
  it.
- **Targets** are the subscribed tuples (`entry.tracked`, pk → params, maintained
  with `subCounts` — no socket scan), plus `{}` for a persisted entry; a param'd
  window or point set with no subscriber gets nothing.
- **Per tuple**, each route it reads goes through the gate (a `U` whose
  `unchanged` set lists every one of the route's `columns` skips it —
  `unchanged` names only columns KNOWN equal in every row, so a column its
  producer did not compare is never listed and the gate needs no agreement on
  which columns were compared), the key filter (`route.rows` ∧ `use.match`),
  then its map: an identity `D` is `deleted`;
  every other op on every other map is "these host rows may have changed" (a
  side-table I / U / D is a host U, never a host I / D), which the membership drain
  already turns into an exit, an entrant or a reorder. Unknown values or a `full`
  map FULL the tuple; so does a throwing `usesOf` / `encode` (reported), or a
  failure to schedule the outcome — isolated per tuple and per entry, so one
  failure never takes the change from the rest. A point tuple keeps only its own
  ids. **`TupleUse.moves`** (compiler-emitted, on a `membership` use): the
  columns of the route's table whose change can move THAT tuple — what its
  where / order read, and the conditions of the joins it reads as membership. A
  `U` whose `unchanged` set lists them all is delivered in the `value` role
  whatever the use says: an identity U to a host outside the window, or a lookup
  row's projected-only column, loads nothing (an `I`, a `D` and an unknown
  `unchanged` stay membership). A window / alias tuple drops a host reached only
  in the `value` role when it is no member — but only while the tuple is QUIESCENT (snapshot, no
  pending, not `draining`): a drain admitting that host may have read the side
  table before the write committed. The snapshot it reads is never regressed by a
  sub-ack whose load predates a push (see H5c below).
- **Reverse routes resolve in the drain** (`resolveReverseRoutes`), once per
  (entry, route, flush) over the union of the pendings' changed values, capped at
  500 (over-cap or a throw FULLs the readers). A `value`-role or point reader is
  bounded to its members / point set; a membership reader is unbounded. The two
  resolve as groups: one unbounded probe serves every reader when it fits the
  cap (each bounded reader cuts it to its own ids); over the cap only the
  unbounded readers go FULL, and the bounded ones probe again within the union
  of their own ids. The compiler supplies `resolve`
  (a lookup's probe over the host-side referencing column — see
  `infra/query-resource/CLAUDE.md`, *Reverse routes*). They ride the SAME pending as the
  change's other routes (`PendingNotify.unresolved`), so its ack leaves only after
  every route landed.
- **A skip is never a pending.** A tuple a change skips owes at most an ack
  (`entry.pendingAcks`): the drain folds it into that tuple's real pending, or
  broadcasts it standalone before any persisted or membership branch — so a skip
  can no longer be spelled as a reload (a persisted entry forces FULL). The legacy
  point empty-intersection uses the same channel, and an empty scoped pending (an
  empty `notify`, an `affectedMap` mapping to nothing) is a skip on every entry kind.
  An owed ack counts as a feed delivery (hand-vs-feed counters, read-set-gap
  match); a skip that owes none records nothing — the change never reached the
  tuple.
- **An ack covers the changes routed before its drain.** A transaction writing
  several tables arrives as several changes; the ack is true only if they all
  reached the tuple's pending before it drained. The runtime cannot know a
  transaction's last change, so the producer delivers them together: the change
  feed routes one socket burst of NOTIFYs from one macrotask
  (`change-feed/server/internal/burst.ts`).

Pinned by `runtime-table-routing.test.ts` (with the `recomputeOn` edge, a match
on an undeclared column, and a key-changing identity UPDATE) and
`routing-layout.test.ts` (the derived layout).

## Deferred resources (`defineDeferredResource` / `bindDeferredResources`)

A resource whose server half can only be compiled once the plugin graph's
contributions are known — a `network/live` collection whose columns other
plugins contribute (`LiveColumns.Serve`). `defineDeferredResource(contract,
bind)` registers the entry NOW, from the contract alone: key, mode (a keyed
contract is keyed; a non-keyed deferred resource is a push value), schema,
`keyOf`, preload — so `Resource.Declare`, `preloadedKeys()` and the boot
snapshot's key set see it — with a loader that throws ("deferred and not bound
yet"). `bindDeferredResources()` calls each `bind()` and runs its options through
`buildEntry` — the SAME validation and normalization `createResource` applies
(scope policy, membership, routes, A5, the minted-plan check) — then gives the
registered entry its loader, scope policy, membership and routes and indexes
them for `routeTableChange`. The facade's boot sequence runs it right after
contributions are collected, before anything serves and before the ready
barrier's change feed rebuilds triggers from the route layout. A bind that
throws fails that call (boot); a deferred resource defined later stays unbound
(serving it throws) until the next call. `createResource` itself is
`buildEntry` + `registerEntry` + `handleOf`, and a handle's `load` reads the
entry's loader at call time.

## Keyed snapshot representation (`SnapEntry` / `SnapEncoder`)

A keyed entry's per-pk snapshot stores one `SnapEntry` per row — the row's
content identity, compared only for equality by every diff path. The
representation is per-resource, decided statically by `snapEncoderFor`
(`runtime.ts`):

- **Default (`hashSnapEncoder`)**: a 64-bit wyhash of the row's canonical JSON
  (+ a length fold) — ~16 B/row instead of a value-sized UTF-16 string Map rebuilt
  on every recompute (`research/perfs/2026-07-16-main-paging-victim-investigation-PLAN.md`
  §B1). The accepted trade — a 64-bit collision silently masks one row update, at
  ~n²/2⁶⁵ per pk — is pinned by a collision-injection test in `keyed-diff.test.ts`.
- **`scopedMembership` (unbounded-window alias) entries (`retainSnapEncoder`)**:
  keep the full canonical JSON string — their persisted-incremental path (above)
  `JSON.parse`s the stored entries to reconstruct the FULL value, so the bytes
  must be there. The choice keys off the *definition* (not `shouldPersist`) so it
  can never flip between seeding and consumption; the reconstruction site throws
  loudly if it ever meets a hashed entry. Bounded `membership` entries (window /
  point) are never persisted, so they stay on the hash encoder.

`keyed-diff.ts` stays pure: every diff function takes the encoder as a parameter,
and a resource's prior snapshots must have been built with the same encoder the
diff receives (the runtime guarantees this by deriving both from the definition).
The whole diff suite runs under BOTH encoders.

## A push ETag rides the `update` frame — and nothing else

`pushEtag` (the ungated, `push`-origin signature recompute) has exactly ONE
caller: `sendUpdate`, which builds AND broadcasts a value-carrying `update` frame.
**An ETag may accompany a frame only if that frame CARRIES the value the ETag
describes.** The `invalidate` frame carries no value and every `delta` frame
carries only a diff, so both *structurally cannot* obtain one — there is no other
call site. (An etag-stamped `invalidate` would hand the client a signature newer
than the value it still holds: the permanent stale pin the `2026-07-09`
co-production doc exists to kill.) Etag-AFTER-value is safe here because the frame
carries the value and self-heals via `flushAgain` — see the comment on `sendUpdate`
and `research/2026-07-10-global-push-etag-rides-the-update-frame.md`.

`sendUpdate` sends the frame ITSELF rather than returning it, so the no-`revalidate`
path (almost every resource) builds and broadcasts with **NO await before the
`ws.send`** — a returned-and-awaited frame would defer every push-mode send by a
microtask. Only the etag path awaits. Pin that property **directly**, never by
racing a push against a parked sub-ack: their relative frame order is a
microtask-count accident with no invariant behind it, and it moved once a drain
stopped joining a pre-commit read flight (*Flight freshness* below).

The two `delta` kinds are NOT interchangeable for a future etag. A **keyed FULL
delta** (and the M5 membership deltas) fully reconciles the client to server truth,
so an etag there WOULD be safe — a possible future optimization, needing a
co-producing builder plus an `etag` field the client's `ServerMsg` delta does not
declare today (a server-stamped one is discarded on arrival). A **keyed SCOPED
delta** (`deletes: []`, `order: undefined`) deliberately does NOT assert
membership, so an etag there would be a permanent partial-stale pin — it must
**NEVER** carry one, and is excluded by construction.

The **commit watermark** follows the twin rule
(`research/2026-07-11-global-never-revert-optimistic-edits.md`): a snapshot
watermark — `opts.captureWatermark`, bound in `server-core/core/resources.ts`
(central has no hook, so it degrades to watermark-less) — rides only frames that
**fully reconcile** the client to server truth as of the capture: `sub-ack`,
`update`, FULL keyed/membership deltas, and the HTTP body. A **scoped delta never
carries one** — it re-reads only affected rows, so stamping it would hand the
client a causal floor for a value it does not hold: the deny-side version of the
etag stale pin (optimistic-mutation would wrongly drop a pending op as superseded).
Two deliberate asymmetries with the etag: the watermark is captured **before** the
loader read (a pre-read xmin is a valid Rule-B floor: `xmin > commitXid` ⇒ the read
saw that commit; a post-read capture would over-claim), and it is captured inside
the single-flight by the **starter** — joiners adopt the starter's value+watermark
pair, so watermark-newer-than-value is structurally excluded. A throwing capture
reports via `reportLoaderError` and the frame ships watermark-less (never blocked).
`runtime-watermark.test.ts` pins all of this.

**That same capture is also the L2 persist floor** — one per flight, not one per
stamp: the FULL drains hand `flightWatermark` straight to a `replace` persist (and
to the snapshot's base floor) rather than taking a second `captureWatermark()` of
their own. *A floor may only describe
the read it accompanies.* A floor captured at the drain can be NEWER than the value
it floors (a joined flight read earlier), and catch-up replays only
`xid >= watermark` — so it would skip the very commit the value is missing, and
cold boot would serve the stale value across restarts. The flight's own floor is at
worst older, which only over-replays (harmless by `captureWatermark`'s contract).
Persisted entries are forced FULL so it is always present; a throwing capture leaves
it undefined and that cycle's persist is skipped (the row keeps its prior floor)
while subscribers are still served.

**The mutation-ack channel (`ackTx`) rides feed-driven frames.** A change-feed
NOTIFY carries its source transaction id (`x`, `pg_current_xact_id()::text`);
the pending coalesces those into `sourceTx` (unioned on every merge branch,
INCLUDING the FULL absorb/degrade — a FULL recompute reads post-commit, so the
claim survives; contrast `deleted`, which FULL drops; capped at 64 with
overflow suppressing the whole cycle), threads them through the cascade
(`SKIP_EDGE` drops them), and the drain stamps `ackTx` on the `update`/`delta`
frames the recompute produces. The claim is
deliberately NARROW: *"for each W ∈ ackTx, every row of this tuple's view that W
wrote has been re-read post-commit and is reflected in this frame's base"* —
nothing about membership/order completeness, nothing about other transactions. So
a SCOPED delta may carry `ackTx` while still never carrying a watermark (Rule B′
coexists unchanged): the ack can CONFIRM exactly the optimistic op whose token
equals W, and can never deny. FULL paths stamp the FLIGHT-resolved set — which is
now always their OWN seed, because a FULL drain passes a freshness floor and so
cannot be served by a flight that started before the change it is draining ("ships
un-acked, degrades to the watermark backstop" no longer happens on a FULL path).
The flight-resolved rule stays the rule, not a formality: the read path still joins
freely, and a joiner must adopt the starter's (typically absent) seed — stamping
its own on someone else's value would be a false ack, the one soundness hazard the
co-production closes. Scoped and membership paths stamp the pending's set directly
(ctx loads never coalesce). Hand-`notify()`/synthetic pushes and
`invalidate`/`sub-ack`/HTTP frames never carry one. A recompute producing NO value
change (empty scoped diff, membership net-zero / window-boundary skip, point
empty-intersection) sends a standalone version-less
`{ kind: "ack", key, params, ackTx }` frame instead — never bumping the version
counter, snapshot, or cascade — **only to the sockets holding that tuple for a
tab that asked**. Acks are client-requested, not declared: each
`SocketSubRecord` keeps `ackTabs`, the holding tabs that want them. A `sub`
frame (and each `sub-batch` entry) restates its tab's flag (`acks: true`, absent
= off), `op: "sub-acks"` flips it on a held sub without re-subscribing (no
sub-ack, no loader run; dropped for a tuple the tab does not hold), and it
leaves with the tab (unsub / unsub-tab / a `complete` batch that did not
restate it / socket close). A tuple a change missed (a point empty-intersection, a
routed tuple the change skipped) is owed an ack only when someone asked
(`tupleWantsAcks`) — through `pendingAcks`, never a pending (see *Scoped change
routing*). The client half (`requestAcks`,
`useResourceAcks`) is live-state's; the optimistic hook is its caller.
Loader failure drops the frame and the acks together (no false ack). Client half:
`optimistic-mutation/CLAUDE.md`; pinned by `runtime-ack-channel.test.ts`. Design:
`research/2026-07-18-global-bounded-working-set-phase2.md` Part C.

**The HTTP body's ETag is paired with `Cache-Control: no-store`.**
`handleResourceHttp` emits an `ETag` on both the 200 and the 304 branch and MUST
set `cache-control: no-store` alongside it on both (pinned by `runtime.test.ts`).
The invariant: *the handler that emits an ETag — the header that invites caching —
owns forbidding shared/browser cache storage.* Without it a **restart-stable** ETag
(`edited-files` is content-addressed for 304 herd-collapse) lets the browser cache
revalidate a stored old-boot body into a 304 after a restart — cross-boot
version-incomparable, dropped as stale, pane wedged. The client mirrors this with
`cache: "no-store"` on its fetches, and server-core defaults any `cache-control`-less
API response to `no-store` — three layers, each a standalone fix. See
`research/2026-07-15-global-live-state-http-cache-poisoning-class-fix.md`.

## Flight freshness: a stamp describes the flight that produced its value

> A flight may only serve a caller whose freshness floor it satisfies, and every
> stamp a frame carries — etag, watermark, `ackTx`, **version**, persisted floor —
> must describe the flight that produced its value.

Four of the five are **co-produced**: the starter captures them and a joiner adopts
the starter's rather than over-claiming. The **version** cannot be, which is why
`notBefore` exists. A push drain assigns `version = current + 1` *before* it asks
for the value, and that number is an assertion — "this is the state as of the change
I am draining". No adoption rule makes an older SELECT satisfy it, so the defence is
**refusal**, not adoption. The two stamps need opposite guarantees:

- A **read** frame (`sub-ack`, HTTP body) *reports* an existing version, so it must
  observe it **before** the load; then a joined older value can only report an older
  version, which the client drops. This is why the read path passes NO floor and its
  coalescing (and the gate-after-dedup replay-storm fix) is untouched.
- A **push** frame *mints* one, so the three FULL drain sites
  (`drainMembershipFull`, the legacy `drainEntry` branch, the keyed FULL reload)
  pass `notBefore: pendingEntry.lastNotifyAt`. A flight that started earlier is
  superseded, not joined, and the drain runs its own.

**The floor is passed explicitly by those three sites and must NEVER be derived
from `gated`.** That flag looks like a proxy for "this is a push" and is not one —
the boot-snapshot fan-out and the multi-tab sub herd are *gated read* callers, the
exact traffic single-flighting exists to collapse. Keying the floor off it would
give each of them its own flight and reinstate the replay storm gate-after-dedup
cures, buying no correctness. `loadResourceByKey` / `measureSubscribeCycle` stay
floor-less for the same reason.

`lastNotifyAt` is the **most recent** notify merged into the pending — never
`enqueuedAt` (the first notify, owned by the delivery-latency metric), and refreshed
**before** `mergePending`'s FULL-absorb and degrade-to-FULL early returns, since an
`ids: null` change absorbing into a live FULL pending is the commonest shape of all.
It is a sound floor because `pg_notify` arrives only after its transaction commits
and the stamp is taken after the listener routed the change, so
`startedAt >= lastNotifyAt` ⇒ the flight's first SELECT began after every commit
folded into this pending. It assumes loaders issue autocommit statements rather than
inheriting an earlier-opened snapshot (true today), and errs safe: a gated flight
stamps `startedAt` before its admission wait, costing false refusals (one extra
load) and never a false join. Supersessions are counted per key as
`staleFlightSupersedes` in `_debug` (hook `onStaleFlightSupersede`) — non-zero means
the pre-commit join is still reachable under load and is being refused rather than
broadcast. Design and the production incident behind it:
`research/2026-08-08-global-live-state-flight-freshness.md`.

## Read path: version short-circuit (bootEpoch), gate-after-dedup, per-tab subs

Three structural changes from the replay-storm forensics
(`research/perfs/2026-07-11-compressor-thrash-subscription-replay-storm.md`
Findings 2–4): clients chronically replay their FULL sub set, and each replayed
push-mode sub used to run the full loader behind the 6-slot read-admission gate.

- **Version short-circuit.** Every `sub-ack`/`up-to-date` frame carries `epoch` —
  a `bootEpoch` UUID minted per `createResourceRuntime` instance. A `sub` (or
  `sub-batch` entry) may echo `{version, epoch}`; when the epoch is THIS boot, the
  version equals the current per-pk counter, and the resource does not declare
  `revalidate`, the server answers `up-to-date` from memory — **zero loader runs,
  zero gate slots**. The invariant this leans on: *for a non-`revalidate` resource,
  the per-pk version counter is its complete change signal WITHIN A TRACKING SPAN*
  — while the tuple has a subscriber, every state change routes through
  `flushNotifies`, which bumps it. Outside one nothing does: the change feed routes
  to subscribed tuples only (a param'd tuple with none admits nothing), and a
  `whileSubscribed` watcher stops at the last unsubscribe. So **every span opens
  with a fresh version** — `registerSubOnSocket` bumps it on the global 0→1 — and a
  version minted before (acked to a tab whose socket then dropped, or read over
  HTTP while nobody subscribed) can never match again. A first sub-ack therefore
  reports ≥ 1. A reconnect replay on a NEW socket, after the old one's `close`
  released its tuples, takes the full path exactly like a post-restart one; a
  replay on the same socket (the missed-update probe) registers before it
  reconciles, keeps its span, and still short-circuits. Pinned by
  `runtime-tracking-span.test.ts`; design:
  `research/2026-09-27-global-live-substrate-gaps.md`. The epoch restriction exists
  because `entry.versions` is per-boot in-memory state (nothing restores it across
  restarts), so a cross-boot version echo is incomparable; a post-restart replay
  takes the full path and re-baselines. `revalidate` resources are exempt — their
  freshness authority is the ETag signature (truth may live outside the notify
  stream, e.g. git). The HTTP path has NO version short-circuit: the
  invalidate-mode refetch must return a body at an equal version (client strict-`<`
  guard). Counted per key as `subShortCircuits` in `_debug`.
- **Gate-after-dedup.** The read-admission slot is acquired INSIDE the read path's
  single-flight (`getResourceValue`'s gated factory), so only the flight STARTER
  occupies a slot — N concurrent reads of one (key, params) consume 1 slot, not N.
  Joiners ride the existing `read-coalesce` wait, which now subsumes the flight's
  gate wait. Read↔read sharing is unconditional; a push drain shares only a flight
  that started after the notify it is draining (*Flight freshness* above).
- **Per-tab sub sets + batch replay.** A socket's sub set is the union of its tabs'
  (the shared-WebSocket client is one socket for N tabs), so each per-socket pk
  record tags its holding tabs (`SocketSubRecord`; legacy untagged frames land in
  the `""` bucket, released on socket close). `op:"sub-batch"` replays ONE tab's
  whole set in one frame: entries are registered synchronously FIRST, then
  `complete:true` releases everything that tab held and did not restate — so an
  identical replay never transits 1→0→1 (no lifecycle-hook churn, no keyed-snapshot
  eviction, no new tracking span), while a closed pane's stale subs are reconciled
  away. Already-current entries collapse into ONE `up-to-date-batch` frame; the
  rest serve as individual sub-acks. `op:"unsub-tab"` is the best-effort tab
  departure (client `pagehide`). A short-circuit never lands on an evicted keyed
  snapshot: eviction happens only at N→0, and the resub after it opens a new span,
  so it takes the full path and re-seeds.

**A read frame reports a version observed BEFORE the load.** `serveSub` has always
read the per-pk counter ahead of its flight; `handleResourceHttp` does the same (the
read is hoisted above `gatedRead`). After the load, a body could pair a value the
flight SELECTed at T0 with a version that pushes bumped since — and the client's
same-boot HTTP guard is strict `<`, so an equal-or-greater version is applied and
the stale value pins. Before, a joined older value can only report an older version:
dropped, then refetched by RQ's `retry: 1`. That ordering is exactly what lets the
read path stay floor-less and keep coalescing (*Flight freshness* above).

**The HTTP body carries `epoch`.** `/api/resources/:key` returns
`{ value, version, epoch }` — the same `bootEpoch` the WS acks echo, feeding the
client's cross-boot 4-case guard matrix (`live-state/CLAUDE.md`). For that guard
only; the HTTP path still has no version short-circuit.

**`sub-error` frames carry `params`.** Every send site includes `params`
alongside `key`: the shared-socket client broadcasts every frame to every tab, so
it must gate `sub-error` on the local sub entry exactly like `update`/`delta`,
which requires matching params. A params-less legacy frame matches no live sub and
is safely dropped. On a match the client runs its HTTP fallback read on that
query (`fetchAfterSubError`) — see `live-state/CLAUDE.md`.

## The params gate: a contract mismatch is version skew, not a crash

Every resource carries `validateParams(params)` — required on `ResourceContract`,
so every descriptor factory decides (`liveValue`: exact declared names;
`liveCollection`'s window / `:rows` / `:groups`: their strict decoders; the
legacy factories: `acceptAnyParams` by name). It throws `ResourceContractError`
(`packages/resource-protocol`) when a tuple does not match the declaration —
after a deploy, a tab still running the previous bundle. Only the flat
`defineResource({...})` form may omit it (it declares no params; absent ⇒ any).

- **Gate first.** `handleSub` / `handleSubBatch` run it BEFORE `authorize` and
  `registerSubOnSocket`; a refusal sends `sub-error reason:"contract-mismatch"`
  with a `verdict` and never registers, so no push, revalidate or scoped path
  reruns it. A refused batch entry is not `retained`. HTTP answers 409 (and 404
  for an unknown key, 500 `loader-failed` for any other throw) with a
  `ResourceHttpErrorBody` JSON body, `no-store`.
- **The verdict decides reporting** (`rejectContract`): the client's `build`
  (frame field / `BUILD_GRAPH_HEADER`) against `serverBuildGraph()` — absent ⇒
  `skew`, `"dev"` or unknown server graph ⇒ `unknown`, different ⇒ `skew`, equal
  ⇒ `same-build`. `skew` is only `console.warn`ed; `same-build` / `unknown` go
  through `reportLoaderError` (a current bundle failing decode is a real bug).
  The server binds `serverBuildGraph` to the graph memoized at boot
  (`setClientBuildIdentity`, registered by `build/server-build-id`); central
  binds none, so its verdicts are `unknown`.
- **Backstop.** A `ResourceContractError` out of a REGISTERED tuple's loader /
  membership read (read path, push paths, HTTP) is a gate gap:
  `evictOnContractError` drops the tuple from every socket
  (`unregisterTupleEverywhere`), tells each holder `contract-mismatch` /
  `unknown`, and always reports.
- Declaration-time and encode failures stay plain `Error`s — they are
  programmer errors and must crash loudly. Pinned by
  `runtime-contract-mismatch.test.ts`.

## Profiling seams (all optional; central binds none)

The server binds each of these to a profiler span in `server-core/core/resources.ts`:

- `wrapLoad(key, info, fn)` wraps every loader run (`timedLoad`). `info.variant` is
  the canonical params (`paramsKey`), absent for `{}`. `info.scopedIds` is the id count
  of a scoped refill, absent on a FULL load.
- `wrapOrigin(kind, key, fn)` wraps the `sub` / `push` / `cascade` origins.
  `wrapFlush(fn)` wraps the flush cycle.
- `wrapHttp(key, fn)` wraps one `GET /api/resources/:key` request, starting right after
  the key resolves. The revalidate signature and the 304 are included, so a conditional
  GET is measured even when no loader runs.
- `wrapMembership(key, fn)` wraps a window's `windowIdsOf` (`runWindowIds`, the one call
  site). It keeps the ids query apart from the value query.
- `onDelivered(key, latencyMs, subscribers, frameChars)` fires per delivered notify.
  `frameChars` is the length of the one serialized frame: `broadcastJson` returns it,
  and `sendUpdate` / `broadcastAckOnly` pass it on.

## Invariant harness (`core/*.test.ts` + `core/test-support.ts`)

The runtime's hardest correctness invariants are pinned by co-located `bun:test`
suites, all DB-free and socket-free via the `createResourceRuntime` fake-injection
seam (see `research/2026-07-03-global-live-state-server-invariant-harness.md`).
Each suite's `describe`/`test` names state what it pins; read them there.

- `test-support.ts` — shared support (`.ts`, no `bun:test`): `createHarness(opts?)`
  (a runtime + N fake sockets recording parsed frames; folds in
  `readSet`/`shouldPersist`/… options), `controllable()` (a block/release loader),
  `makeClientView()` (a client simulator applying frames through the REAL WS
  version guard + a mirror of `mergeKeyedDelta`, so tests assert "converges to
  server truth"), and the `rng` mulberry32 PRNG.
- `runtime.test.ts` (level-parallel flush, `applyDbChange` routing, revalidate,
  `authorize`), `keyed-diff.test.ts` (all three diffs, scenario + property, under
  BOTH encoders), `runtime-h5.test.ts` (notify-vs-fresh-sub race),
  `runtime-scoped-routing.test.ts`, `runtime-scoped-membership.test.ts` (M5 alias),
  `runtime-window-membership.test.ts` (bounded window / point / order signature),
  `runtime-cascade-attribution.test.ts`, `runtime-catchup.test.ts` (over-replay
  idempotence + the L2 persist-hook calling contract),
  `runtime-version-shortcircuit.test.ts`, `runtime-gate-dedup.test.ts`,
  `runtime-sub-batch.test.ts`, `runtime-watermark.test.ts`,
  `runtime-ack-channel.test.ts`, `runtime-revalidate.test.ts`,
  `runtime-stale-flight.test.ts` (a drain refusing a pre-commit flight),
  `runtime-to-subscribed.test.ts` (a `toSubscribed` edge reaches exactly the
  subscribed downstream tuples), `runtime-tracking-span.test.ts` (a replay after
  a tracking gap is never `up-to-date`), `runtime-snapshot-base.test.ts` (neither
  a joined sub-ack nor a drain outliving its span sets an older snapshot), `runtime-optional-params.test.ts` (one
  tuple per spelling of an absent optional param), `runtime-table-routing.test.ts`
  (the routed-entry matrix, the named routing scenarios, the `reach` arm and the
  A5 / A8 / A22 guards). `runtime-window-membership.test.ts` runs every window / point
  case under both routers — declared `identityTable` and the identity route
  `compileWindowQuery` emits.
  Note `controllable()` resolves at RELEASE time, so it structurally cannot model
  a SELECT that already ran; any test about stale-flight joins must use
  `snapshotControllable()`, which captures at INVOCATION time.

Two results worth knowing without opening a file: H5c (keyed snapshot-seed vs a
concurrent push) is GREEN, and *not* because the two coalesce into one load; a
drain refuses a flight older than its notify, so the sub-ack's value may well come
from a different, older read. For the DIFF that would be harmless — an older base
ships EXTRA rows, never fewer — but the routed router reads membership off the same
snapshot (a value-role change to a non-member is dropped), so a regressed base
would drop a real change for good. So `serveSub` re-seeds only when no snapshot
exists or the version is still the flight's `baseVersion` — the tuple's version
when the read STARTED, co-produced by the flight like its etag, so a subscriber
that joined a read begun before a push cannot re-seed from it: a push that
advanced the snapshot meanwhile keeps its base (pinned by
`runtime-table-routing.test.ts` §freshness and `runtime-snapshot-base.test.ts`).
The other writer is a drain: a tuple's snapshot belongs to its **tracking span**
(`entry.spans`, a fresh number at the global 0→1, gone at N→0), and every keyed
drain writes the snapshot — and ships its frames — only if the span it started
in is still the tuple's (`snapshotOwner`; a persisted alias's kept snapshot is
always its own). A drain that outlived the last unsubscribe would otherwise
resurrect a base nothing routes to, which a later subscriber's routing would read
membership off. And `runtime-revalidate`'s
load-bearing case pins etag-BEFORE-value ordering: a change landing mid-load must
never ship a stale value under an already-current etag (a later `up-to-date`/`304`
would pin it forever).

Seam boundary: the xmin/changelog-floor arithmetic in
`live-state-snapshot/catch-up.ts`, `persist.ts` SQL, and `change-feed/listener.ts`
reconnect logic import the `db` singleton directly and are OUT of reach at THIS
seam. They are covered by a **separate DB-backed harness**:
`live-state-snapshot/server/internal/{persist,catch-up}.test.ts` and
`change-feed/server/internal/listener.test.ts` run the real SQL against a throwaway
Postgres. See `research/2026-07-03-database-live-state-db-backed-invariant-harness.md`
and those plugins' `CLAUDE.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses:
    - `packages/canonical-params.canonicalParams`
    - `packages/inflight.createInflight`
    - `packages/resource-protocol.BUILD_GRAPH_HEADER`
    - `packages/resource-protocol.contractVerdict`
    - `packages/resource-protocol.ContractVerdict`
    - `packages/resource-protocol.ResourceContractError`
    - `packages/resource-protocol.ResourceHttpErrorBody`
    - `packages/resource-protocol.SubErrorFrame`
    - `packages/semaphore.createSemaphore`
  - Exports (types):
    - `AliasMembership`
    - `ChangeSource`
    - `DefineResourceInput`
    - `DependsOnEntry`
    - `DerivedRead`
    - `ExternalResource`
    - `FullRoute`
    - `HostMap`
    - `KeyedDiff`
    - `KeyedMembership`
    - `KeyedMembershipInput`
    - `KeyedServerResourceOptions`
    - `NotifyCounts`
    - `PersistedBase`
    - `PersistedValueCheck`
    - `PersistMeta`
    - `ReachPlan`
    - `Resource`
    - `ResourceContract`
    - `ResourceDefinition`
    - `ResourceMode`
    - `ResourceParams`
    - `ResourceRuntime`
    - `ResourceRuntimeOptions`
    - `Route`
    - `RoutedRecomputeOn`
    - `RoutePlan`
    - `ScopedResourceTable`
    - `ScopePolicy`
    - `SeedOutcome`
    - `ServerResourceOptions`
    - `SnapEncoder`
    - `SnapEntry`
    - `TableChange`
    - `TableLayoutRequirement`
    - `TupleUse`
    - `WsData`
    - `WsHandler`
  - Exports (values):
    - `createResourceRuntime`
    - `diffKeyedScopedMembership`
    - `mintReachPlan`
    - `mintRoutePlan`
    - `retainSnapEncoder`
    - `tableLayoutRequirements`
- Cross-plugin:
  - Imported by:
    - `framework/central-core`
    - `framework/server-core`
- Exemptions:
  - Exempts itself from:
    - `resource-runtime:compiled-routes` — `core/routing.ts`, `core/index.ts` (sanctioned)
    - `live/no-legacy-resource-spelling` — `.` (sanctioned)
- Test helpers:
  - Core: `@plugins/framework/plugins/resource-runtime/core/testing`
    - `buildSnapshot` — Build the id→entry map for a keyed resource's array `value`, in array order.
    - `diffKeyedFull` — Full diff: compare the new array `value` against `prev` (the prior snapshot, or `undefined` on first notify).
    - `diffKeyedScoped` — Scoped diff (Layer 2): `scopedRows` is a PARTIAL array — only the recomputed affected rows.
    - `hashSnapEncoder`
    - `makeClientView`
    - Types: `ClientView`, `KeyedSnapshot`, `RecordedFrame`

<!-- AUTOGENERATED:END -->
