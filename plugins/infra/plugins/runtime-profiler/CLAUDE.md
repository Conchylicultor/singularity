# runtime-profiler

In-memory, per-worktree runtime span recorder (`http` / `db` / `loader`, plus the `sub` /
`push` *origin* entries that trigger loaders). Zero-dependency and **isomorphic** (`core`
only, no Node APIs) so `core` can sit low in the DAG and be imported by `endpoints/core` and
`database/server`. The store is bounded and lost on restart.

> **Do not import this plugin from `server-core/core`** — this plugin's `server/index.ts`
> imports `ServerPluginDefinition`, so the reverse edge closes a cross-plugin cycle
> (rejected by `./singularity check plugin-boundaries`). server-core's resource runtime
> instead calls the no-op profiler seam it owns (`server-core/core/profiler-hooks.ts`), and
> this plugin **injects** the real recorder into it at boot from `server/internal/install.ts`
> (`setProfilerHooks(...)`), mirroring `setErrorReporter`.

## Caller attribution (ambient tier)

Each `db`/`loader` span records the single innermost enclosing request/loader it ran under
(its immediate `parent`), so N+1 / fan-out patterns point straight at their source — one
level only, keyed by **label** (`SpanRef` is `{kind,label}`), which is what the `byParent`
aggregate breakdown groups by. A loader triggered by a WS subscription or a push cascade
nests inside a `sub` / `push` origin entry, so its `parent` names the request class that
triggered it instead of being `null`.

Per-*instance* identity is a separate, finer axis (`id` / `parentId`, see the
flight-recorder section); `SpanRef` deliberately carries **no** id — an aggregate is a
roll-up over many runs of one label, where an instance id would be meaningless.

## Wall-clock decomposition (wait / child / self)

Every entry span decomposes its wall-clock into **`waitMs`** (time covered by named
gate/pool waits at any depth of its subtree), **`childMs`** (time covered by direct-child
entry executions), and **`selfMs`** (the remainder: its own orchestration/CPU — on a
composite span a *conservative upper bound* of own work, since untracked awaits land here).
A concurrency gate calls `chargeWait(layer, ms)` from its `onWait` callback; the interval
`[now − ms, now]` propagates to **every open ancestor entry** (innermost included) up the
live `EntryContext.parent` chain, so a composite span like a `flush` draining many loaders
names the gates its subtree waited on rather than showing huge wall-clock with empty `waits`.

The load-bearing math is the **streaming interval-union** (`Track`, per ancestor): a flush
drains loaders concurrently, so *summing* child waits into an ancestor could exceed its
wall-clock (20 loaders × 60 s gate wait inside a 90 s flush ≠ "1200 s wait"). Each ancestor
instead unions the intervals over its own timeline, guaranteeing `waitMs ≤ wall` and
`selfMs ≥ 0` at every level; per-layer `waits` values are unions too (each ≤ wall). Every
charge arrives at its interval's END (gates call `onWait` at slot acquisition; children
charge at finish), so the stream is end-ordered by construction and the O(1) streaming
union is *exact* — a non-end-ordered arrival would only undercount, never overcount. A
finished child charges its execution interval into the *nearest open ancestor only* (its
own interval propagates upward when it finishes — charging every ancestor would
double-count grandchildren); gate waits go to *all* open ancestors because unions are
idempotent under re-covering, which is what makes each level's `waits` self-contained.
Closed ancestors are never mutated (a detached child finishing late cannot corrupt a
recorded span).

### Positioned wait bands (`WaitBand`)

`Track` is the *measure* of the covered set; a **`WaitBand[]` per `(entry, layer)`** is the
covered set itself, so a wait has a *when* and not merely a *how much*. Bands are derived
from `contribute()`'s **return value** (the slice it newly covered, already clipped to that
ancestor's `startMs` and frontier), never the raw `[start, end]` — every ancestor clips the
same charge differently, which is what makes `Σ band widths === track.unionMs` true *by
construction*. End-ordered arrival (above) makes the insert a tail op: O(1), no sort.

The list is capped at `WAIT_BAND_CAP` per `(entry, layer)`; on overflow the **smallest** band
is dropped, never merged across a gap — painting time a span was not waiting would be worse
than admitting ignorance (the recorder is conservative in the *under* direction everywhere).
`waitMs` stays the authoritative cross-layer union, so a consumer derives
`residualMs = waitMs − crossLayerUnion(bands) ≥ 0` = "this much wait happened, at positions
we no longer retain". Note the *cross-layer* union: two layers can overlap in time, so their
per-layer widths **sum** to more than `waitMs`.

Bands attach to the `EntryContext` actually charged (a closed intermediate ancestor has
none) and are never reconstructed from a subtree walk — a detached child whose wait
straddles its parent's close would paint a phantom band in a parent deliberately excluded.

Reading it: a leaf loader that is mostly `waitMs` was head-of-line-blocked (the resource is
fast); mostly `selfMs` = genuinely slow. A `flush` with `childMs ≈ wall`, `waits` naming
`background-acquire`/`db-acquire`, and small `selfMs` spent its life awaiting gate-blocked
children. `waitSplit(agg)` returns the per-call averages `{ avgMs, waitMs, childMs, selfMs,
waits }` from the aggregate's summed totals.

Charging layers: `background-acquire` (background DB **query** gate), `background-tx-acquire`
(background DB **transaction** lease gate) and `db-acquire` (pg pool connect wait), all
`database/server/internal/client.ts`; `heavy-read-acquire` / `heavy-read-local`
(`infra/host-read-pool`); `read-admit` (resource read admission) and `read-coalesce` (joined
an in-flight resource read) (`server-core/core/resources.ts`); `endpoint-concurrency` /
`endpoint-dedupe` (per-route gates, `infra/endpoints/core/implement.ts` — the `http` entry
span encloses them, so deduped GETs record one span per request with joiners showing
`endpoint-dedupe ≈ wall`, `selfMs ≈ 0`); `git-coalesce:<name>` (joined an in-flight git
recompute) and the 0 ms markers `git-memo-hit:<name>` / `git-memo-miss:<name>`
(`infra/git-read-cache`). A `chargeWait` with no active entry (context-less jobs/pollers)
falls back to a standalone `db [layer]` span so the wait is never lost. See
`research/2026-07-02-global-profiler-wait-propagation.md`.

## Windowed max (`recentMaxMs` / `maxAgeMs`)

Each aggregate keeps a rolling ~5-min bucketed max: `recentMaxMs` answers "is it slow NOW"
(0 when idle past the window), while `maxMs` is the sticky since-boot peak and `maxAgeMs`
its age — so a stale spike reads as stale. `getRuntimeProfile()` sorts aggregates by
`recentMaxMs` desc. All timestamps flow through one injectable clock seam (`installClock`,
default `performance.now()`) so union/bucket arithmetic is deterministic under test
(`core/recorder.test.ts`).

The ambient context is supplied by an **injected** `SpanContextRuntime`, so the core stays
pure (no `node:async_hooks`, web bundle unaffected): `core/recorder.ts` holds a
no-op-by-default runtime + `installSpanContextRuntime(rt)`, and `server/internal/install.ts`
installs an `AsyncLocalStorage`-backed one as a module side effect (imported by the routeless
`server/index.ts`, so the registry wires it up at boot, before `Bun.serve`). The web never
imports `server/`, so on the client every entry point is a transparent passthrough.

### Entry points vs leaves

- `recordEntrySpan(kind, label, fn)` — used at the HTTP (`endpoints/core/implement.ts`),
  loader (`server-core/core/resources.ts` `wrapLoad`), origin (`server-core` `wrapOrigin`,
  for the `sub`/`push` entries), and job (`infra/plugins/jobs/server/internal/worker.ts`,
  wrapping each `job.run()` in a `job` entry span labelled by the job name) chokepoints.
  Runs `fn` under a fresh ambient `EntryContext` (chained to the live parent, with per-track
  union accumulators), while recording the entry span itself against the *outer* parent (an
  entry is never its own parent). Records in `finally`, materializing
  `waits`/`waitMs`/`childMs`/`selfMs`.
- `recordSpan(kind, label, durationMs)` — leaf path (DB pool wrapper); attributes to the
  current ambient context automatically. A leaf has no decomposition: `waitMs`/`childMs`
  default to 0, `selfMs` to the full duration.
- `chargeWait(layer, ms)` — see the decomposition section above.
- `currentCallerKind()` — the `kind` of the **innermost** enclosing entry point (or
  `undefined` when none is active). A thin read of the same ambient context; the DB pool
  wrapper uses it to decide whether to capture a query's read-set. Read it synchronously,
  before any await.
- `currentOriginClass()` — the lane (`"interactive" | "background"`) of the **outermost**
  enclosing entry, or `undefined` when none is active; the DB pool gates partition on it.
  Walks the `EntryContext.parent` chain to the root and maps `root.kind` through an
  exhaustive `Record<SpanKind, OriginClass>` (so adding a span kind is a tsc error until it
  picks a lane): `http`/`sub`/`loader` interactive, `flush`/`push`/`cascade`/`job`
  background. Root, not innermost, because inside a resource load the innermost kind is
  `loader` regardless of *why* the load runs. Unlike `chargeWait`, the walk does not skip
  closed ancestors (it only reads `kind`). Allocation-free; read it synchronously, before
  any await.
- `runInBackgroundLane(fn)` — declare that `fn` is background work whatever triggered it,
  overriding the origin walk. Backed by its own AsyncLocalStorage (`server/internal/install.ts`),
  so it propagates through awaited DB work — including down to the `pool.connect()` a nested
  `db.transaction()` takes. Used by the observability writers (slow-ops, reports, trace
  capture, contention), whose transactions would otherwise inherit the origin of whichever
  human request tripped them, and by the jobs worker's post-run cleanup writes, which sit
  outside the `job` entry span. Deliberately **separate** from `runWithoutProfiling`: "don't
  record" and "isn't background" are different claims — `debug/profiling/boot-bench`'s
  load-generator wants the former while deliberately holding real gate slots. See
  `research/2026-07-09-global-interactive-lane-origin-based-db-gating.md`.

`getRuntimeProfile()` returns each aggregate (sorted by `recentMaxMs` desc) with its
`byParent` breakdown (count desc) and summed `waitTotalMs`/`childTotalMs`/`selfTotalMs`, and
each `slowest` span with its `parent` and per-span `waitMs`/`childMs`/`selfMs`.

## Monitoring self-meter (`getSelfMeter`)

Every observability write runs inside `runWithoutProfiling`, so monitoring's own cost is
invisible to the profiler — the tool you'd reach for. So `runWithoutProfiling` **meters
itself**: everything suppressed is by definition monitoring work, so two module counters at
that one chokepoint attribute all of it with zero per-callsite edits, and being plain
numbers outside the recorder's span path they can never re-feed the profiler.

`getSelfMeter()` returns cumulative-since-boot `{ count, totalMs }`: one *op* per
**outermost** `runWithoutProfiling` scope, `totalMs` its wall-clock from call to settlement
(sync return, sync throw, or promise settle — observed on a detached derived promise, so the
original result passes through untouched and a rejection is never absorbed). A scope opened
while suppression is already active (detected via `suppressed()` itself, ALS semantics, so
it holds across awaits) adds neither count nor time — never double-counted. Two *concurrent*
outermost scopes each meter their full wall (a sum, like CPU-time accounting): separate
monitoring work items. The meter is monotonic and **never reset** (not by
`resetRuntimeProfile` either) — consumers diff successive readings, and a reset would
surface as a negative delta.

Consumer: the health sampler (`debug/health-monitor` `process-sampler.ts`) diffs it each
10 s tick into the optional `HealthSample.monitorOps` / `monitorMs` per-tick deltas →
`health.jsonl` → the Debug → Health charts. So a monitoring storm shows up as a spike even
though every one of its spans is suppressed.

## Loader→table read-set (union vs per-run)

Each `loader` entry captures the tables its DB queries read (`recordReadTables`, from the
pool chokepoint, matching only `FROM`/`JOIN`) and flushes them in `recordEntrySpan`'s
`finally` into **two** structures:

- **`readSetIndex` (union)** — append-only per key; surfaced by `getReadSetIndex()`. A safe
  **over-approximation** (never sheds), so inverting it (`table → resource`) for live
  change-feed routing (`applyDbChange`) can only over-recompute, never miss — which is why it
  stays a union: a table read only for SOME data (a data-dependent conditional query) must
  not drop out of the live-routing set.
- **`lastLoaderReadSet` (per-run)** — the exact tables the MOST RECENT run read (REPLACE,
  not union); surfaced by `getLastLoaderReadSet(key)`. The resource runtime persists this
  after a FULL recompute (`live_state_snapshot.tables_read`, replace semantics) so a
  dependency a code change removed — or a historical mis-attribution — is **shed** from the
  durable seed instead of carried forever. Read it synchronously right after awaiting the
  loader (no intervening await), so it is that load's own capture. Written only when the run
  read ≥1 table (same gate as the union), so a no-table run never replaces a real set with
  empty. See `research/2026-07-07-global-read-set-self-heal-on-full-recompute.md` (and the
  prior `…-notifications-attribution-noise.md`). Both are cleared by `resetRuntimeProfile()`.

## Flight-recorder substrate

Three side-structures let a slow-event consumer materialize ONE coherent instant — who was
in flight, who just finished, how saturated each gate was — from which the true call tree
can be rebuilt in a single read (see
`research/2026-07-02-global-slow-event-flight-recorder.md` and
`research/2026-07-09-global-span-instance-identity-call-tree.md`):

- **Open-entry registry** — a `Set<EntryContext>` maintained by `recordEntrySpan` (add
  before the run, delete in the `finally` — paired on every path, including throws), which
  lets a snapshot enumerate every concurrently in-flight op. Leaf `db` spans have no context
  and are not registered (the completed ring covers them). The delete runs *before*
  `record()`, so a tripping span is never in its own `open` list — the ring carries it (see
  the ordering note below).
- **Recently-completed ring** — a preallocated 4096-slot circular buffer written inside
  `record()` for spans ≥ 5 ms (the blocker often finishes before its victim's span ends,
  so open entries alone can't name it). Slots are mutable and overwritten in place;
  placement inside `record()` puts it behind the `SINGULARITY_PROFILING=0` kill-switch and
  the suppression early-returns. A completed **entry** span also parks its `waits` and
  `waitBands` in the slot, so it carries the same per-layer breakdown an open one does. The
  per-query **leaf** path (`recordSpan`) writes scalars only and stays allocation-free.
- **Gate-gauge registry** — `registerGateGauge(layer, read)` (throws on a duplicate layer)
  + `readGateGauges()`. Layer names use the SAME vocabulary as the `chargeWait` layers
  above, so a snapshot's gate occupancy joins directly to span `waits`; gate *owners*
  self-register — the recorder never names a gate.

### Per-instance identity (`id` / `parentId`)

`{kind,label}` names a span *class*, not a *run* — two concurrent `loader:tasks` runs under
different parents are indistinguishable by label, so a label-keyed window cannot be
reassembled into a tree. Every span run therefore gets an `id` from one monotonic
process-lifetime counter, and carries the enclosing entry run's `id` as `parentId` (`null`
at the top level), resolved off the live `EntryContext.parent` chain. An entry mints its id
at **open**, before `fn` runs, so a child can name it while it is still in flight; a leaf
mints at record time. `SlowSpan` and `FlightSpan` both carry the pair.

The counter is **never reset** — not by `resetRuntimeProfile()`, which deliberately leaves
live EntryContexts alone (they deregister in their own `finally`); a restarted counter would
hand an in-flight parent's id to a fresh child, splicing one call tree into another. Because
a parent always opens before its child, `parentId < id` holds for every span: the edge set is
**acyclic by construction**, and a consumer can refuse `parentId >= id` as corruption. A
`parentId` that resolves to nothing in the window is an **orphan**, not corruption — the
parent may be a sub-5 ms span the ring never took, one evicted before capture, or (for a
detached child) one that closed long ago. Consumers render such a span as a root.

### `captureFlightWindow`

`captureFlightWindow({ windowStartMs, maxOpen?, maxCompleted? })` (defaults 200/400)
synchronously materializes both span sources into a `FlightWindow` `{ atMs, open, completed }`
of `FlightSpan`s. Open spans carry `t1: null` and per-layer `waits` + `waitBands` read
mid-flight — sound, since a track's union is monotonic accumulated coverage and its band list
only ever extends (the bands are **copied**, as the live context may extend them after the
capture). Completed spans are the ring slots overlapping the window, newest first, carrying
the same `waits`/`waitBands`. Ids are unique across `open ∪ completed` (a context leaves the
registry before its span reaches the ring), so a consumer indexes both by `id` and links by
`parentId`.

The open set is **ancestor-closed**: after taking up to `maxOpen` entries from the registry,
every still-open ancestor of a taken entry is pulled in too, so `maxOpen` is a *soft* cap
(hard-bounded by `openEntries.size`) — a hole mid-chain would silently reparent a whole
subtree onto a root it never ran under. The walk stops at a closed ancestor: that edge is a
legitimate orphan, not a fillable hole. Completed spans need no such pass — a parent
finishes *after* its child, so it is newer in the ring with `t1 ≥ child.t1 ≥ windowStartMs`,
surviving both the window filter and the newest-first `maxCompleted` cut before its children.

**Ordering inside `record()`: the ring write must precede the `onSlowSpan` notify loop**
(covered by `core/recorder.test.ts`) — a handler calls `captureTrace` →
`captureFlightWindow` *synchronously*, and by then the tripping entry is already out of
`openEntries`, so a ring write after the notify would leave the trip span in neither source.
Both early-returns still guard the write, so kill-switch and suppression semantics are
unchanged. `resetRuntimeProfile()` clears the ring (profile data) but keeps gauges
(structural registrations), leaves open entries to their own `finally`, and does not touch
the id counter.

Overhead: one `++` per span, one paired `Set.add`/`Set.delete` per *entry* span (entry spans
are low-rate — never per-DB-query), a comparison + ~12 field writes per qualifying completed
span (label strings and the `waits`/`waitBands` references are shared, not copied), and per
`chargeWait` one comparison plus at most one push into a `WAIT_BAND_CAP`-bounded array. The
remaining allocations are one flat band array per completed entry span, and whatever
`captureFlightWindow` builds on a (rate-limited) slow-event trip.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Load-bearing: yes
- Cross-plugin:
  - Imported by: `infra/endpoints`
- Core:
  - Exports (types):
    - `Aggregate`
    - `EntryContext`
    - `FlightSpan`
    - `FlightWindow`
    - `GateGauge`
    - `OriginClass`
    - `ParentBreakdown`
    - `SlowSpan`
    - `SlowSpanHandler`
    - `SpanKind`
    - `SpanRef`
    - `Track`
    - `WaitBand`
    - `WaitBreakdown`
  - Exports (values):
    - `__contribute`
    - `__pushBand`
    - `captureFlightWindow`
    - `chargeWait`
    - `currentCallerKind`
    - `currentOriginClass`
    - `getLastLoaderReadSet`
    - `getReadSetIndex`
    - `getRuntimeProfile`
    - `getSelfMeter`
    - `installBackgroundLaneRuntime`
    - `installClock`
    - `installProfilingSuppressionRuntime`
    - `installSpanContextRuntime`
    - `onSlowSpan`
    - `profilerNowMs`
    - `readGateGauges`
    - `recordEntrySpan`
    - `recordReadTables`
    - `recordSpan`
    - `registerGateGauge`
    - `removeReadSetTable`
    - `resetRuntimeProfile`
    - `runInBackgroundLane`
    - `runTracked`
    - `runWithoutProfiling`
    - `seedReadSetIndex`
    - `SPAN_KINDS`
    - `waitSplit`

<!-- AUTOGENERATED:END -->
