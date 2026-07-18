# resource-runtime

The single, parameterized live-state resource runtime shared by both
`@plugins/framework/plugins/server-core/core` (per-worktree) and
`@plugins/framework/plugins/central-core/core` (the shared central process).

It owns `defineResource`, the broadcast machinery (DAG cascade, keyed delta sync,
Layer-2 scoped recompute, `withNotifyBatch`), and the `/ws/notifications` +
`/api/resources/:key` handlers. `createResourceRuntime(opts)` returns a fresh,
fully-isolated runtime instance (its own registry, sockets, DAG, batch state);
each facade calls it once with its runtime-specific hooks and re-presents the
runtime's types/values as its own stable public surface, so the ~42
`defineResource` call sites and ~37 `Resource.Declare` contributors never see
this plugin directly.

**Flush is level-parallel.** `flushNotifies` walks the dependsOn DAG grouped by
longest-path depth (`rebuildDag` stamps `entry.depth`; every edge strictly
increases depth, so a level has no intra-level edges). Each level's entries run
concurrently (`Promise.all(level.map(drainEntry))`) with a barrier between
levels, so a cascade merged into a strictly-deeper downstream has settled before
that downstream drains — and a slow loader can no longer head-of-line-block an
unrelated entry at the same or earlier depth (the original serial loop's bug; see
`research/2026-06-19-global-parallel-flush-notifies.md`). `drainEntry` opens with
a synchronous snapshot+clear of pending and a debounce-timer cancel, and keeps its
per-pk loop sequential so versions/snapshots stay monotonic. A `flushRunning`
mutex + `flushAgain` rerun flag guarantee two flushes never overlap: a notify that
lands mid-flush sets `flushAgain` and is re-drained by the live flush.

**A resource loader must never do synchronous IO.** The loader runs inside this
shared flush cycle, and JS is single-threaded — a synchronous syscall
(`readFileSync`, `readdirSync`, `openSync`, …) freezes the whole event loop for
its entire duration, head-of-line-blocking every other resource's loader, every
`ws.send`, and every HTTP handler until it returns (under host IO contention this
was seconds, not milliseconds). Always use `node:fs/promises` (or another
threadpool/async primitive) so a slow read yields the loop instead of blocking it;
the flush cycle already `await`s loaders returning `Promise<T>`.

The three injected hooks (`ResourceRuntimeOptions`):

- `wrapLoad(key, fn)` — wrap each loader call. server: `recordEntrySpan("loader",
  key, fn)` (profiler spans + ambient context); central: omitted (identity).
- `wrapOrigin(kind, key, fn)` — wrap an origin-triggered load (`sub` = sub-ack,
  `push` = cascade flush) so the nested loader span gets a non-null `parent`
  naming the request class (and gate waits attribute to it). server:
  `recordEntrySpan(kind, key, fn)`; central: omitted (identity). See
  `research/2026-06-19-global-wait-attribution-instrumentation.md`.
- `reportError(context, err)` — additive failure report. `console.error` ALWAYS
  fires inside the runtime; this hook is extra. server:
  `reportServerError(errorReport(...))`; central: omitted.
- `debugOwners()` — per-key owner metadata for the `_debug` endpoint. server:
  derived from `Resource.Declare` contributions; central: omitted.

It is **acyclic**: besides `zod` (`ZodType`) and `bun` (`ServerWebSocket` type) it
imports only `@plugins/packages/plugins/inflight/core` (itself a leaf, so the new
edge introduces no cycle — used for read-path single-flight coalescing). It
declares its own local `WsData`/`WsHandler` interfaces (byte-identical to the
facades' `types.ts`) rather than importing them — importing either facade would
create a cycle. The returned `notificationsWsHandler` is structurally assignable
to each facade's `WsHandler`.

See `research/2026-06-08-global-unify-live-state-resource-runtime.md` for the
unification rationale and `plugins/primitives/plugins/live-state/CLAUDE.md` for
the client side and the keyed/scoped delta semantics.

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
  is the ids-only bounded ordered id list; the entry's loader at the same params
  MUST be the matching windowed query — so the FULL branch (no snapshot,
  sticky-FULL, self-heal after a short-circuited resub) is **bounded by
  construction**: "FULL" means the window loader, never a whole-collection sweep.
  A membership change costs O(changed) + O(window), never O(collection).
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
  cheap encoding of exactly the fields the window's ORDER BY reads. When
  declared, the runtime keeps a per-member signature map beside the per-pk
  snapshot (window-sized; seeded/evicted in lockstep with it) and treats a
  refilled MEMBER row whose signature moved as membership-affecting: one
  `windowIdsOf` re-derive, delta with the fresh bounded `order` — so an UPDATE
  that bumps an order column (a `createdAt` resurface) reorders the wire window
  instead of going stale. Unchanged-signature refills keep the in-place path
  (no ids query — the M5 cost model for content-only bumps). A re-derive whose
  window comes back in the same sequence ships in-place (`order` omitted — the
  diff mirrors `diffKeyedFull`'s unchanged-order omission), and `order`
  presence alone marks a frame as changed (a member moved past the tail leaves
  purely via `order`, with no upsert and no `deletes` entry). A missing/failed
  signature is treated as moved (fail-safe: one extra bounded ids query, never
  a stale order). Absent ⇒ an in-place UPDATE never reorders the window until
  the next membership delta, so the ORDER BY must then be update-stable; the
  compiler layer (query-resource) always derives one for compiled windows,
  downgrading that stability rule to a cost note (each order-column update
  costs one O(window) ids query).

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

## Keyed snapshot representation (`SnapEntry` / `SnapEncoder`)

A keyed entry's per-pk snapshot stores one `SnapEntry` per row — the row's
content identity, compared only for equality by every diff path. The
representation is per-resource, decided statically by `snapEncoderFor`
(`runtime.ts`):

- **Default (`hashSnapEncoder`)**: a 64-bit wyhash of the row's canonical JSON
  (+ a length fold) — ~16 B/row instead of a value-sized UTF-16 string Map
  rebuilt on every recompute (the delivery-path churn/RSS fix from
  `research/perfs/2026-07-16-main-paging-victim-investigation-PLAN.md` §B1).
  The accepted trade — a 64-bit collision silently masks one row update, at
  ~n²/2⁶⁵ per pk — is documented on the encoder and pinned by a
  collision-injection test in `keyed-diff.test.ts`.
- **`scopedMembership` (unbounded-window alias) entries (`retainSnapEncoder`)**:
  keep the full canonical JSON string — their persisted-incremental path (above)
  `JSON.parse`s the stored entries to reconstruct the FULL value, so the bytes
  must be there. The choice keys off the *definition* (not `shouldPersist`) so it
  can never flip between seeding and consumption; the reconstruction site throws
  loudly if it ever meets a hashed entry. Bounded `membership` entries (window /
  point) are never persisted, so they stay on the hash encoder.

`keyed-diff.ts` stays pure: every diff function takes the encoder as a
parameter, and a resource's prior snapshots must have been built with the same
encoder the diff receives (the runtime guarantees this by deriving both from
the definition). The whole diff suite runs under BOTH encoders.

## A push ETag rides the `update` frame — and nothing else

`pushEtag` (the ungated, `push`-origin signature recompute) has exactly ONE
caller: `sendUpdate`, which builds AND broadcasts a value-carrying `update` frame.
**An ETag may accompany a frame only if that frame CARRIES the value the ETag
describes** — so the etag is computed only where its value is actually shipped. The
`invalidate` frame carries no value and every `delta` frame carries only a diff, so
both *structurally cannot* obtain one: not by convention, but because there is no
other call site. (An `invalidate` frame stamped with an etag would hand the client
a signature newer than the value it still holds — the permanent stale pin the
`2026-07-09` co-production doc exists to kill.) Etag-AFTER-value is deliberate and
safe here because the frame carries the value and self-heals via
`flushAgain` — see the comment on `sendUpdate` and
`research/2026-07-10-global-push-etag-rides-the-update-frame.md`.

`sendUpdate` sends the frame ITSELF rather than returning it, so the no-`revalidate`
path (almost every resource) builds and broadcasts with **NO await before the
`ws.send`** — a returned-and-awaited frame would defer every push-mode send by a
microtask, and `runtime-h5.test.ts` H5a pins that a push beats a racing parked
sub-ack (one extra tick flips that order). Only the etag path awaits.

The two `delta` kinds look alike and are NOT interchangeable for a future etag:

- A **keyed FULL delta** (`upserts` + `deletes` + `order`) and the **M5 membership
  deltas** fully reconcile the client to server truth (it rebuilds its array purely
  from `order`), so a co-produced etag there WOULD be safe — a possible future
  optimization. It is not wired today: the client's `ServerMsg` union doesn't even
  declare `etag` on a `delta`, so a server-stamped delta etag is discarded on
  arrival. Enabling it needs a co-producing builder plus that client field.
- A **keyed SCOPED delta** ships `deletes: []`, `order: undefined` and deliberately
  does NOT assert membership, so the client's array is not guaranteed to equal
  server truth. An etag there would be a permanent partial-stale pin — it must
  **NEVER** carry one. This change excludes it by construction.

The **commit watermark** follows the twin rule
(`research/2026-07-11-global-never-revert-optimistic-edits.md`): a snapshot
watermark — `opts.captureWatermark`, bound in `server-core/core/resources.ts`
(central has no hook, so it degrades to watermark-less) — rides only frames that
**fully reconcile** the client to server truth as of the capture: `sub-ack`,
`update`, FULL keyed/membership deltas, and the HTTP body. A **scoped delta
never carries one** — it re-reads only affected rows, so stamping it would hand
the client a causal floor for a value it does not actually hold: the deny-side
version of the etag stale pin (the optimistic-mutation primitive would wrongly
drop a pending op as superseded). Two deliberate asymmetries with the etag:
the watermark is captured **before** the loader read (a pre-read xmin is a valid
Rule-B floor: `xmin > commitXid` ⇒ the read saw that commit; a post-read capture
would over-claim), and it is captured inside the single-flight by the
**starter** — joiners adopt the starter's value+watermark pair, so
watermark-newer-than-value is structurally excluded. A throwing capture reports
via `reportLoaderError` and the frame ships watermark-less (never blocked).
`runtime-watermark.test.ts` pins all of this.

**The mutation-ack channel (`ackTx`) rides feed-driven frames.** A change-feed
NOTIFY carries its source transaction id (`x`, `pg_current_xact_id()::text`);
the pending coalesces those into `sourceTx` (unioned on every merge branch,
INCLUDING the FULL absorb/degrade — a FULL recompute reads post-commit, so the
claim survives; contrast `deleted`, which FULL drops; capped at 64 with
overflow suppressing the whole cycle), threads them through the cascade
(`SKIP_EDGE` drops them), and the drain stamps `ackTx` on the `update`/`delta`
frames the recompute produces. The claim is deliberately NARROW: *"for each
W ∈ ackTx, every row of this tuple's view that W wrote has been re-read
post-commit and is reflected in this frame's base"* — nothing about
membership/order completeness, nothing about other transactions. So a SCOPED
delta may carry `ackTx` while still never carrying a watermark (Rule B′
coexists unchanged): the ack can CONFIRM exactly the optimistic op whose token
equals W, and can never deny. FULL paths stamp the FLIGHT-resolved set (the
pending's ids seed `getResourceValue`; a drain that joins an in-flight read —
whose SELECT may predate the commit — adopts the starter's absent seed and
ships un-acked, the same co-production idiom as the etag/watermark); scoped and
membership paths stamp the pending's set directly (ctx loads never coalesce).
Hand-`notify()`/synthetic pushes and `invalidate`/`sub-ack`/HTTP frames never
carry one. A recompute producing NO value change (empty scoped diff, membership
net-zero / window-boundary skip, point empty-intersection) broadcasts a
standalone version-less `{ kind: "ack", key, params, ackTx }` frame instead —
gated on the per-resource `ackChannel: true` opt-in, never bumping the version
counter, snapshot, or cascade. Loader failure drops the frame and the acks
together (no false ack). The client half (registry + confirmation rule) is
`optimistic-mutation/CLAUDE.md`; `runtime-ack-channel.test.ts` pins all of
this. Design: `research/2026-07-18-global-bounded-working-set-phase2.md` Part C.

**The HTTP body's ETag is paired with `Cache-Control: no-store`.**
`handleResourceHttp` emits an `ETag` on both the 200 and the 304 branch, and MUST
set `cache-control: no-store` alongside it on both. The invariant: *the handler
that emits an ETag — the header that invites caching — owns forbidding
shared/browser cache storage.* Without it, the browser HTTP cache stored an
old-boot body and transparently revalidated it with its stored ETag; a
**restart-stable** ETag (`edited-files` is content-addressed for 304
herd-collapse) then let the server 304 after a backend restart and hand the
client the *old-boot* body — cross-boot version-incomparable, dropped as stale,
pane wedged on "Close (state unknown)". The client mirrors this with
`cache: "no-store"` on its fetches, and server-core applies a `no-store` default
to any API response that sets no `cache-control` — three layers, each a
standalone fix. See
`research/2026-07-15-global-live-state-http-cache-poisoning-class-fix.md`.

## Read path: version short-circuit (bootEpoch), gate-after-dedup, per-tab subs

Three structural changes born from the 2026-07-11 replay-storm forensics
(`research/perfs/2026-07-11-compressor-thrash-subscription-replay-storm.md`
Findings 2–4): clients chronically replay their FULL sub set, and each replayed
push-mode sub used to run the full loader behind the 6-slot read-admission gate.

- **Version short-circuit.** Every `sub-ack`/`up-to-date` frame carries `epoch`
  — a `bootEpoch` UUID minted per `createResourceRuntime` instance. A `sub` (or
  `sub-batch` entry) may echo `{version, epoch}`; when the epoch is THIS boot,
  the version equals the current per-pk counter, and the resource does not
  declare `revalidate`, the server answers `up-to-date` from memory — **zero
  loader runs, zero gate slots**. The invariant this leans on: *for a
  non-`revalidate` resource, the per-pk version counter is its complete change
  signal* — every state change routes through `flushNotifies`, which bumps it.
  The epoch restriction exists because `entry.versions` is per-boot in-memory
  state (nothing restores it across restarts), so a cross-boot version echo is
  incomparable; a post-restart replay takes the full path and re-baselines.
  `revalidate` resources are exempt — their freshness authority is the ETag
  signature (truth may live outside the notify stream, e.g. git). The HTTP path
  has NO version short-circuit: the invalidate-mode refetch must return a body
  at an equal version (client strict-`<` guard). Short-circuits are counted
  per key (`subShortCircuits` in `_debug`, next to notifyStats) and surfaced
  via the optional `onSubShortCircuit` hook.
- **Gate-after-dedup.** The read-admission slot is acquired INSIDE the read
  path's single-flight (`getResourceValue`'s gated factory), so only the flight
  STARTER occupies a slot — N concurrent reads of one (key, params) consume 1
  slot, not N. Joiners ride the existing `read-coalesce` wait, which now
  subsumes the flight's gate wait. Corollary pinned by H5a/H5c: the starter no
  longer pays post-flight slot-release hops, so `serveSub` yields one explicit
  microtask after the flight resolves — a push continuation parked on the same
  coalesced flight (which sends synchronously) reaches the wire first, and its
  keyed FULL diff runs before the sub-ack's idempotent snapshot re-seed.
- **Per-tab sub sets + batch replay.** A socket's sub set is the union of its
  tabs' (the shared-WebSocket client is one socket for N tabs), so each
  per-socket pk record tags its holding tabs (`SocketSubRecord`; legacy
  untagged frames land in the `""` bucket, released on socket close).
  `op:"sub-batch"` replays ONE tab's whole set in one frame: entries are
  registered synchronously FIRST, then `complete:true` releases everything that
  tab held and did not restate — so an identical replay never transits 1→0→1
  (no lifecycle-hook churn, no keyed-snapshot eviction), while a closed pane's
  stale subs are reconciled away. Already-current entries collapse into ONE
  `up-to-date-batch` frame; the rest serve as individual sub-acks.
  `op:"unsub-tab"` is the best-effort tab departure (client `pagehide`).
  A keyed sub that short-circuits does NOT re-seed an evicted snapshot; the
  next notify finds no snapshot and ships a FULL update — self-healing by
  construction.

**The HTTP body carries `epoch`.** The `/api/resources/:key` body is now
`{ value, version, epoch }`, where `epoch` is this boot's `bootEpoch` — the same
UUID the `sub-ack`/`up-to-date` frames echo, minted per `createResourceRuntime`.
It is the twin of the WS ack epoch: `entry.versions` is per-boot in-memory state
(nothing restores it across restarts), so a bare HTTP version compare across a
boot is meaningless. The client needs the epoch to distinguish a same-boot stale
read (drop) from a stale-boot cache entry it should adopt the fresh body over —
the 4-case guard matrix in `live-state/CLAUDE.md`. (The HTTP path still has no
version short-circuit; the epoch is for the client guard, not a server-side
skip.)

**`sub-error` frames carry `params`.** All four `sub-error` send sites now include
`params` alongside `key`. The shared-socket client broadcasts every frame to
every tab, so it must gate `sub-error` on the local sub entry exactly like
`update`/`delta` — which requires the params to match the held subscription. A
params-less legacy frame won't match a live sub and is safely dropped. On a match
the client runs `applyInvalidate(key, params)`, so the fallback refetch's own
outcome surfaces (`ResourceHttpError`) or heals — see `live-state/CLAUDE.md`.

## Invariant harness (`core/*.test.ts` + `core/test-support.ts`)

The runtime's hardest correctness invariants are pinned by co-located `bun:test`
suites, all DB-free and socket-free via the `createResourceRuntime` fake-injection
seam (see `research/2026-07-03-global-live-state-server-invariant-harness.md`):

- `test-support.ts` — the shared, suite-free (`.ts`, no `bun:test`) support module:
  `createHarness(opts?)` (a runtime + N fake sockets recording full parsed frames;
  folds in `readSet`/`shouldPersist`/… options), `controllable()` (a block/release
  loader), `makeClientView()` (a faithful client simulator applying frames through
  the REAL WS version guard + a local mirror of `mergeKeyedDelta`, so tests assert
  "converges to server truth"), and the `rng` mulberry32 PRNG. `runtime.test.ts`
  and `keyed-diff.test.ts` import their harness/PRNG from here.
- `runtime-h5.test.ts` — the notify-vs-fresh-sub race (v3 §9 H5): a stale sub-ack
  never overwrites a newer push (push + keyed + multi-socket). H5c (the keyed
  snapshot-seed vs a concurrent push) is GREEN — full loads coalesce, so the
  sub-ack re-seeds the snapshot idempotently; no `handleSub` guard is needed.
- `runtime-scoped-routing.test.ts` — same-flush coalescing: sticky-FULL absorption
  (both orders), scoped∪scoped union, empty-scoped-set no-op (no bump/frame/cascade).
- `runtime-catchup.test.ts` — over-replay idempotence (a replayed change → empty
  diff → no frame) and the L2 persist-hook calling contract
  (`captureWatermark`-before-load, persist-on-success-only, persisted-FULL forcing,
  hook-failure never blocks delivery).
- `runtime-version-shortcircuit.test.ts` — the bootEpoch version short-circuit:
  same-boot + same-version → `up-to-date` with zero loader runs / gate slots;
  wrong/absent epoch or version mismatch → full path; `revalidate` resources
  exempt; the keyed evicted-snapshot self-heal; epoch on acks; the `_debug`
  counter; no HTTP short-circuit.
- `runtime-gate-dedup.test.ts` — gate-after-dedup: N same-pk subs on a parked
  loader hold ONE slot and run ONE loader; distinct pks still cap at the gate
  size; the etag co-production contract holds through the moved gate.
- `runtime-sub-batch.test.ts` — the sub-batch/tab model: one `up-to-date-batch`
  for current entries + individual sub-acks; register-before-reconcile (an
  identical replay fires no lifecycle hooks, a dropped sub releases); two tabs
  on one socket isolated; legacy `""`-bucket release on socket close.
- `runtime-revalidate.test.ts` — conditional revalidation (ETag / 304) read path:
  WS up-to-date hit / etag miss / fresh stamp, the HTTP 304 vs 200+ETag paths, the
  `revalidate`-throws fail-safe (value delivered, no etag, never short-circuited),
  and the client version-adoption guard after an `up-to-date`. Its load-bearing
  case pins the etag-BEFORE-value ordering: a change landing mid-load must never
  ship a stale value under an already-current etag (would pin it forever via a
  later `up-to-date`/`304`) — the resub must converge to current server truth.

Seam boundary: the xmin/changelog-floor arithmetic in
`live-state-snapshot/catch-up.ts`, `persist.ts` SQL, and `change-feed/listener.ts`
reconnect logic import the `db` singleton directly and are OUT of reach at THIS
seam. They are now covered by a **separate DB-backed harness** (the follow-up this
doc filed): `live-state-snapshot/server/internal/{persist,catch-up}.test.ts` and
`change-feed/server/internal/listener.test.ts` run the real SQL against a
throwaway Postgres via a `db`-parametrization refactor + a running-cluster
fixture. See `research/2026-07-03-database-live-state-db-backed-invariant-harness.md`
and those plugins' `CLAUDE.md`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses: `packages/inflight.createInflight`, `packages/semaphore.createSemaphore`
  - Exports: Types: `DefineResourceInput`, `DependsOnEntry`, `ExternalResource`, `KeyedDiff`, `KeyedMembership`, `KeyedMembershipInput`, `KeyedResourceContract`, `KeyedSnapshot`, `RecomputeIntent`, `Resource`, `ResourceContract`, `ResourceDefinition`, `ResourceMode`, `ResourceParams`, `ResourceRuntime`, `ResourceRuntimeOptions`, `ScopePolicy`, `ServerResourceOptions`, `SnapEncoder`, `SnapEntry`; Values: `buildSnapshot`, `createResourceRuntime`, `diffKeyedFull`, `diffKeyedScoped`, `diffKeyedScopedMembership`, `hashSnapEncoder`, `retainSnapEncoder`
- Cross-plugin:
  - Imported by: `framework/central-core`, `framework/server-core`

<!-- AUTOGENERATED:END -->
