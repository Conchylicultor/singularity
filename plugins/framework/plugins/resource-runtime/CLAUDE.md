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

## Opt-in scoped membership (`scopedMembership`, M5)

A keyed resource may pass `scopedMembership: { orderOf }` (only on the two-arg
keyed form, which supplies the required `identityTable`; `createResource` throws
otherwise). It makes an INSERT / DELETE / where-flip on the identity table ship an
incremental delta instead of a FULL recompute — the runtime refills only the
changed rows and reconciles membership against the per-pk snapshot via
`diffKeyedScopedMembership`. Absent ⇒ byte-identical to the pre-M5
FULL-on-membership-change behavior (every legacy path untouched). See
`research/2026-07-03-global-scoped-membership-m5.md`.

The membership path (`drainMembershipScoped`, `drainEntry` branch 4):

- **DELETE** → delete + full `order` with **zero DB queries**: no loader (a
  deleted row can't be refilled) and no `orderOf` (the order is the prior snapshot
  minus the id). Carried via `PendingNotify.deleted`, the op-D channel that rides
  alongside a scoped `affected` (FULL absorbs it exactly like `affected`).
- **INSERT / where-flip entry** (a refilled id absent from the snapshot) → upsert
  + `order`; `orderOf` runs **exactly once** to place the entrant.
- **where-flip exit** (the refill omits a requested id) → delete + `order`, one
  scoped refill, no `orderOf`.
- **in-place flip** → one upsert, `order` omitted.

A **membership delta always ships the full `order`** — the client rebuilds the
keyed array purely from `order`, so an incremental membership change must assert
it. `diffKeyedScopedMembership` rebuilds `nextSnapshot` FROM the wire `order`
(snapshot ≡ order) and sanitizes upserts/order to surviving ids, so an
`orderedIds` disagreement or concurrent delete drops out with no client
drift-resub. It **throws** if a refill id entered membership but no `orderedIds`
was supplied (the caller must run `orderOf` on any entry).

Persisted (`bootCritical`) scopedMembership entries reconstruct the FULL value
from the post-diff snapshot (`JSON.parse` of each stored canonical-JSON hash →
byte-identical jsonb to a FULL persist) and persist it with a watermark captured
**before** the refill/`orderOf` reads. Their snapshot is **kept across N→0 subs**
(they recompute on every change regardless of subscribers and need the diff base);
branch 2/3 (`drainMembershipFull`) seeds/replaces the snapshot even with zero subs
so the next incremental diff has a base. A DELETE cascades downstream FULL (a
vanished row has no value for an `affectedMap` to translate); inserts/updates
cascade scoped.

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
  - Exports: Types: `DefineResourceInput`, `DependsOnEntry`, `ExternalResource`, `KeyedDiff`, `KeyedMembershipInput`, `KeyedResourceContract`, `KeyedSnapshot`, `RecomputeIntent`, `Resource`, `ResourceContract`, `ResourceDefinition`, `ResourceMode`, `ResourceParams`, `ResourceRuntime`, `ResourceRuntimeOptions`, `ScopePolicy`, `ServerResourceOptions`; Values: `buildSnapshot`, `createResourceRuntime`, `diffKeyedFull`, `diffKeyedScoped`, `diffKeyedScopedMembership`
- Cross-plugin:
  - Imported by: `framework/central-core`, `framework/server-core`

<!-- AUTOGENERATED:END -->
