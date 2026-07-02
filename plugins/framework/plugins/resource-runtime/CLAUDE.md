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

Seam boundary: the xmin/changelog-floor arithmetic in
`live-state-snapshot/catch-up.ts`, `persist.ts` SQL, and `change-feed/listener.ts`
reconnect logic import the `db` singleton directly and are OUT of reach here — they
need an embedded-Postgres fixture or a `db`-parametrization refactor (a separate
follow-up), deliberately not in this harness.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Core:
  - Uses: `packages/inflight.createInflight`, `packages/semaphore.createSemaphore`
  - Exports: Types: `DefineResourceInput`, `DependsOnEntry`, `ExternalResource`, `KeyedDiff`, `KeyedResourceContract`, `KeyedSnapshot`, `RecomputeIntent`, `Resource`, `ResourceContract`, `ResourceDefinition`, `ResourceMode`, `ResourceParams`, `ResourceRuntime`, `ResourceRuntimeOptions`, `ScopePolicy`, `ServerResourceOptions`; Values: `buildSnapshot`, `createResourceRuntime`, `diffKeyedFull`, `diffKeyedScoped`
- Cross-plugin:
  - Imported by: `framework/central-core`, `framework/server-core`

<!-- AUTOGENERATED:END -->
