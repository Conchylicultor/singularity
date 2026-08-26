# resource-runtime

The single, parameterized live-state resource runtime shared by both
`@plugins/framework/plugins/server-core/core` (per-worktree) and
`@plugins/framework/plugins/central-core/core` (the shared central process).

It owns `defineResource`, the broadcast machinery (DAG cascade, keyed delta sync,
Layer-2 scoped recompute, `withNotifyBatch`), and the `/ws/notifications` +
`/api/resources/:key` handlers. `createResourceRuntime(opts)` returns a fresh,
fully-isolated instance (own registry, sockets, DAG, batch state); each facade
calls it once with its own hooks and re-presents the runtime's types/values as its
own stable public surface, so `defineResource` call sites and `Resource.Declare`
contributors never see this plugin directly.

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
`@plugins/packages/plugins/inflight/core` (a leaf), which does double duty here:
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

1. **Which RESOURCE does a change belong to?** `identityTable`, or the explicit
   `recompute: { kind: "full", reason }` opt-out.
2. **And which subscribed TUPLE of it owns the changed row?** Under
   `identityTable`, exactly one of `rowIdentity` (the tuple names ONE row) /
   `membership` / `scopedMembership` (a bounded window or point set) /
   `fanOut: { reason }` (every tuple genuinely must be woken).

Question 2 used to have no spelling, so its answer was always "wake all of them"
— see the fan-out cost under Own-row routing below. `fanOut` normalizes to
NOTHING in `createResource`: a declaration requirement only, byte-identical at
runtime, exactly as the `recompute` arm is. It is deliberately a SIBLING of
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
two-arg keyed form, which supplies the required `identityTable`; `createResource`
throws otherwise). It makes an INSERT / DELETE / where-flip on the identity table
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
  self-heal after a short-circuited resub) is **bounded by construction**: "FULL"
  means the window loader, never a whole-collection sweep. A membership change
  costs O(changed) + O(window), never O(collection).
- **`membership: { kind: "point", idsOf }`** — the params tuple names an
  **explicit id set** (`idsOf(params)` decodes it; pure, sync, cheap — it runs
  per subscribed tuple on the feed-routing path). `applyDbChange` routes a change
  to a tuple **iff the changed ids intersect its set** (empty intersection = no
  notify, no version bump); no ids query ever runs; entrants append (point sets
  are unordered); never fans out to the `{}` fallback tuple.
- **`scopedMembership: { orderOf }`** — the legacy M5 alias ≡ an **unbounded
  window** (`windowIdsOf = orderOf`, no LIMIT). Byte-identical to M5, including
  the L2 persisted-reconstruction path. Mutually exclusive with `membership`.

The window path (`drainMembershipScoped`, `drainEntry` branch 4) classifies each
flush against the prior snapshot — *entered* (a refilled id not already a member)
/ *exited* (a requested id the refill omitted, or a deleted member):

- **Bounded window**: any entered-or-exited runs `windowIdsOf` once (O(window) —
  it is both the entrant arbiter and the tail-pull source), then **backfills**
  window ids whose bytes neither the client base nor the refill holds (the new
  tail row after a leaver) with one extra scoped refill. An entrant sorting past
  the tail diffs to empty → no frame, no version bump. A DELETE of an id outside
  the snapshot is a total no-op (a window is a prefix of the total order).
- **Alias (unbounded)**: `orderOf` runs **only on an entry**; an exit-only change
  derives its order from the prior snapshot (zero queries for a pure DELETE); no
  backfill. Exactly M5.
- **Both**: a pure in-place change (all refilled ids already members, no order
  impact) never runs the ids query — one upsert, `order` omitted.
- **Order signature** (`membership.window.orderSignatureOf?`, optional): a pure
  cheap encoding of exactly the fields the window's ORDER BY reads. The runtime
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
across N→0, and uses the hash snapshot encoder. Only the **alias** keeps the M5
persisted behavior: persisted (`bootCritical`) scopedMembership entries
reconstruct the FULL value from the post-diff snapshot (`JSON.parse` of each
stored canonical-JSON entry → byte-identical jsonb to a FULL persist), persist it
with a watermark captured **before** the refill/`orderOf` reads, and keep their
snapshot across N→0 (they recompute on every change regardless of subscribers
and need the diff base); branch 2/3 (`drainMembershipFull`) seeds/replaces the
snapshot even with zero subs so the next incremental diff has a base. A DELETE
cascades downstream FULL (a vanished row has no value for an `affectedMap` to
translate); inserts/updates cascade scoped (backfilled tail ids do NOT join the
cascade set — they did not change in the DB, they only entered this window's
view).

At **boot**, the L2 layer restores each persisted alias's in-memory diff base from
its durable value BEFORE catch-up: `live-state-snapshot`'s `onReady` reads the L2
row and calls the runtime's `seedPersistedSnapshot(key, "{}", value)` (which seeds
`entry.snapshots` + order sigs via the same `snapshotOf` primitive the FULL rebuild
uses). So the first post-boot change — and every downtime change catch-up replays —
is a scoped refill, not the FULL O(collection) rebuild it used to pay because the
diff base started empty. The seed is a no-op once a snapshot exists (a sub-ack that
arrived first is never clobbered), and it targets only unbounded-window aliases
(`unboundedWindowKeys`), the only shape whose durable value is byte-sufficient to
reconstruct the base.

## Own-row routing (`rowIdentity`) — narrows *who* is woken, never *what* they get

A keyed own-identity resource whose params tuple names EXACTLY ONE row of its
identity table may declare `rowIdentity: (params) => rowId` (again only on the
two-arg keyed form, which supplies the required `identityTable`). It is read by
`applyDbChange` and by nothing else: a change whose ids are known and do not
include that row is not scheduled for that tuple at all — no read, no version
bump, no frame. The owning tuple falls through with its `affected` / `deleted`
exactly as computed, so it stays on the legacy scoped/FULL drain and its frames
are byte-identical to the no-`rowIdentity` behavior. That equivalence is pinned
as a test (`runtime-row-identity.test.ts` §"the owning tuple's frame stream is
IDENTICAL with and without rowIdentity"), not asserted as a comment.

What it deletes is the fan-out: without it the feed schedules a recompute on
EVERY subscribed tuple, each of which re-runs its own one-row read, finds the
changed row is not its own, and diffs to empty. Those tuples ship no frame —
which is exactly what hides the cost. The read IS the cost. (`page-block-doc`
flushes a `doc-update` roughly every 300 ms while someone types, so it was one
read per open block editor per flush: `research/2026-08-25-global-own-row-resource-scoping.md`.)

Three rules make it safe, and each is a test:

- **The filter runs only in the identity-origin arm**, gated on
  `identityOrigin && routeIds !== null` — never on `affected !== null`. It must
  filter op-`I`/`D`, where `affected` is deliberately `null` for a
  non-membership entry; and a `null` `affected` ALSO arises from the
  uncovered-dependency arm, whose `change.ids` live in a FOREIGN table's key
  space, where intersecting would silently drop every delivery. This is the
  whole correctness argument and it is invisible in the code.
- **`ids: null`** (a bulk statement, or one over the ~7000-byte NOTIFY cap) has
  nothing to intersect, so it still reaches every tuple, FULL — today's
  behavior.
- **The declaration must be pure, total, synchronous and cheap** (it runs per
  subscribed tuple on the routing path) and nothing enforces that, so the call
  site fails OPEN: a throwing `rowIdentity` is reported and treated as MATCHING.
  Fail-closed would be a silent drop; worse, letting it throw would land in
  `applyDbChange`'s swallowing catch and drop every delivery for that change
  across every resource.

**It is deliberately not `membership: { kind: "point", idsOf: () => [oneId] }`**,
which routes identically and then changes everything else. Point membership
turns INSERT/DELETE on the identity table from a FULL recompute into an
incremental membership diff and reroutes the drain to branch 4; a membership
delta must always ship the full `order`, which the client rebuilds the array
from — a drift/`forceFullResub` surface bought for nothing on a 0-or-1-row value
that has neither membership nor order. It is also a persistence decision
(`membershipBounded` excludes the entry from L2). **The drain difference is the
entire reason both declarations exist.** Accordingly `rowIdentity` is mutually
exclusive with `membership` / `scopedMembership`, requires `mode: "keyed"` +
`identityTable`, and is incompatible with `bootCritical` (the L2 boot init and
`recomputeResource` schedule the `{}` tuple, for which `rowIdentity({})` names
no row) — all four are loud registration throws.

There is deliberately **no reverse `rowId → tuple` index**: the per-tuple work
on the routing path is one closure call and a Set lookup, and an index would be
a second source of truth for subscription state that must stay in lockstep with
sub / unsub / socket close / `sub-batch` replay. Revisit above ~10⁴ subscribed
tuples for one key, or if `applyDbChange` shows up in a CPU profile once the
fan-out is gone.

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
stamp: the FULL drains hand `flightWatermark` straight to `persistSnapshot` rather
than taking a second `captureWatermark()` of their own. *A floor may only describe
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
empty-intersection) broadcasts a standalone version-less
`{ kind: "ack", key, params, ackTx }` frame instead — gated on the per-resource
`ackChannel: true` opt-in, never bumping the version counter, snapshot, or cascade.
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
  the per-pk version counter is its complete change signal* — every state change
  routes through `flushNotifies`, which bumps it. The epoch restriction exists
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
  eviction), while a closed pane's stale subs are reconciled away. Already-current
  entries collapse into ONE `up-to-date-batch` frame; the rest serve as individual
  sub-acks. `op:"unsub-tab"` is the best-effort tab departure (client `pagehide`).
  A keyed sub that short-circuits does NOT re-seed an evicted snapshot; the next
  notify finds no snapshot and ships a FULL update — self-healing by construction.

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

**`sub-error` frames carry `params`.** All four send sites include `params`
alongside `key`: the shared-socket client broadcasts every frame to every tab, so
it must gate `sub-error` on the local sub entry exactly like `update`/`delta`,
which requires matching params. A params-less legacy frame matches no live sub and
is safely dropped. On a match the client runs `applyInvalidate(key, params)` — see
`live-state/CLAUDE.md`.

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
  `runtime-stale-flight.test.ts` (a drain refusing a pre-commit flight).
  Note `controllable()` resolves at RELEASE time, so it structurally cannot model
  a SELECT that already ran; any test about stale-flight joins must use
  `snapshotControllable()`, which captures at INVOCATION time.

Two results worth knowing without opening a file: H5c (keyed snapshot-seed vs a
concurrent push) is GREEN — **no `handleSub` guard is needed** — but *not* because
the two coalesce into one load; a drain refuses a flight older than its notify, so
the sub-ack's seed may well come from a different, older read. The argument is that
a read-path re-seed can only regress the diff base to an OLDER one, and an older
base ships EXTRA rows, never fewer: the client converges either way and the only
cost is a fatter delta. And `runtime-revalidate`'s load-bearing case pins
etag-BEFORE-value ordering: a change landing mid-load must
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
    - `packages/inflight.createInflight`
    - `packages/semaphore.createSemaphore`
  - Exports (types):
    - `DefineResourceInput`
    - `DependsOnEntry`
    - `ExternalResource`
    - `KeyedDiff`
    - `KeyedMembership`
    - `KeyedMembershipInput`
    - `KeyedResourceContract`
    - `KeyedSnapshot`
    - `RecomputeIntent`
    - `Resource`
    - `ResourceContract`
    - `ResourceDefinition`
    - `ResourceMode`
    - `ResourceParams`
    - `ResourceRuntime`
    - `ResourceRuntimeOptions`
    - `ScopePolicy`
    - `ServerResourceOptions`
    - `SnapEncoder`
    - `SnapEntry`
  - Exports (values):
    - `buildSnapshot`
    - `createResourceRuntime`
    - `diffKeyedFull`
    - `diffKeyedScoped`
    - `diffKeyedScopedMembership`
    - `hashSnapEncoder`
    - `retainSnapEncoder`
- Cross-plugin:
  - Imported by:
    - `framework/central-core`
    - `framework/server-core`

<!-- AUTOGENERATED:END -->
