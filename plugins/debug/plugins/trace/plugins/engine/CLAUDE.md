# engine

The generic slow-event trace engine. It owns the **open registry** of perf-event
classes, the `captureTrace()` entry point, and the durable `traces` store. It
**never names a class** and the pane never names a class — adding a perf signal
to every trace and the Gantt is one new plugin (a `defineTraceEventClass`
contribution), zero engine edits. Mirrors reports' `ReportKindSpec` +
`defineServerContribution`.

## captureTrace — the one entry point

Any producer (`slow-ops`' span hook, the client slow-op endpoint, `op-rate`'s
op-time trip-wire, a future GC-pause detector) mints a `TraceTrigger` and calls
`captureTrace(trigger)`. It runs in the caller's hot path and **never throws into
it**; it returns `{ id }` (minted synchronously, so a report or a `slow_ops`
sample can reference the trace before it is even persisted) or `null` when
disabled / rate-limited. Two phases:

1. **Synchronous coherent-instant capture.** `atMs = performance.now()` is read
   once; admission runs first (one Map lookup — a storm never serializes); then
   every class's `captureAtTrip(ctx)` runs inline, with **no `await` between
   admission and the last capture**, so every section describes the *same
   instant*.
2. **Detached async enrich + validate + persist**, under `runWithoutProfiling`
   so the engine's own IO (a class's enrich query, the row insert) never
   re-feeds the profiler it was captured for — the same suppression discipline
   as flight-recorder's old `trip.ts`.

## The TraceEventClass contract

A class contributes one snapshot section under `snapshot.events[id]`:

- **`id`** — stable lane/section id (`"spans"`, `"gates"`, `"contention"`,
  `"heap"`…). Also the Gantt lane key.
- **`schema`** — zod validator for this class's section. The persisted value is
  always `schema`-valid (see isolation below).
- **`captureAtTrip?(ctx)`** — **phase 1, synchronous, in the profiler hot path.**
  Must be cheap: no IO, no heavy allocation, and it should not throw (the engine
  guards it, but a throw wastes the coherent instant). Return `undefined` to
  skip. This is the ONLY place to read live in-memory state that changes
  instant-to-instant (`captureFlightWindow`, `readGateGauges`).
- **`enrich?(ctx, atTrip, ringSlice)`** — **phase 2, async**, run under
  `runWithoutProfiling`. Receives the phase-1 output and this class's ring slice
  (events overlapping `[windowStartMs, atMs]`). Use it for out-of-band reads that
  don't need the frozen instant (`contention` queries `pg_stat_activity` here).
  Return `undefined` to skip the section for this trip — no error, no report —
  the same skip semantics as `captureAtTrip`, so an enrich-only class that only
  reacts to certain triggers (e.g. keyed on `trigger.kind`) opts out cleanly.
  When absent, the phase-1 output — or, failing that, the ring slice — is
  persisted directly.
- **`ring?: { max }`** — declare a bounded in-memory ring and the handle's
  `emit(event)` becomes live: a class that samples continuously (a future
  RAM/GC/CPU sampler) pushes `RingEvent`s, and the slice overlapping the trip
  window is persisted — **a Gantt lane for free**, no capture hook needed. A
  class with no `ring` gets a no-op `emit` (forgetting `ring` fails loudly by its
  events simply never appearing, never a throw).

**Schema-validation isolation.** Each section is validated independently in the
async phase. A class whose `captureAtTrip`/`enrich` throws, or whose output fails
its `schema`, is **omitted** from `events` and a server error report is filed —
loud (a report) and isolated (like a slot error boundary). One bad class never
kills the whole snapshot and never fakes a section, so a *present* key is always
valid. This is the noise-rules per-rule try/catch discipline applied to sections.

## Admission (the `trace` config)

Checked before any capture work, all four knobs live-editable in Settings →
Config (read synchronously at trip time via `getConfig` — in-memory, cheap, no
restart). They govern *how often* a trigger persists — **not** what counts as
slow (each producer owns its own threshold):

- **`enabled`** — when off, `captureTrace` is a no-op (existing rows untouched).
- **`cooldownMs`** (10 s) — min time between two traces for the same
  `kind:label` trigger. A repeatedly-tripping op produces one trace per window.
- **`maxPerMin`** (30) — hard global per-minute ceiling across all triggers, so a
  slow-event storm can't saturate the engine. A cooldown rejection does not
  consume a minute token.
- **`windowMs`** (10 s) — *minimum* lookback; the actual captured window is
  `max(trigger.durationMs, windowMs)`, so a long trip always covers its own
  lifetime.

Admission is shared across all trigger sources — a slow-span storm can consume
the global budget and starve an op-time capture in the same minute. Acceptable:
op-time runs on a 5-min cadence and retries next tick. If it bites, per-source
budgets are a config-only extension.

### Duress shedding (after admission)

During a host **duress episode** (`infra/duress`), an admitted non-critical trip
past the first-N-per-trigger grant is **shed**: the entire capture — including
the synchronous coherent-instant phase, which is exactly the cost shedding
exists to avoid — is skipped and the caller sees `null`, the same contract as a
rate-limited trip. Only an accounting **stub** (`kind`/`label`/`wallTime`/
`durationMs`) is buffered; its replay is a documented no-op (a trace's coherent
instant is gone by flush time — no fake traces), and the stubs fold into the
post-episode `duress-shed` summary report (kind registered by
`debug/duress-shed`). The gate sits **after** admission so cooldown / rate-limit
semantics stay primary — a cooldown rejection never consumes a first-N grant. A
`critical` trigger (cluster onset, frozen-backend stall) bypasses the gate
entirely: duress is precisely when that trace matters. See `internal/trace-shed.ts`.

## Clock domains

Every snapshot stores **two clocks**, and mixing them is the classic trap:

- **Profiler clock** (`performance.now()` domain): `atMs`, `windowStartMs`, and
  every span's `t0`/`t1`, plus `RingEvent.tMs`. These only ever compare **to each
  other** — they are the Gantt's x-axis (`t − windowStartMs` → window-relative
  ms). Never compare a profiler-clock value to `Date.now()`.
- **Wall clock** (`wallTime`, ISO): the single anchor to human time. Display
  wall time for a span as `wallTime + (t − atMs)`.

## Storage & retention

One `traces` row per trip (`server/internal/tables.ts`), the boot-profile
storage precedent. The `traces` table and the `Trace` wire schema both derive
from the single `traceFields` record (`core/fields.ts` via `defineEntity`), so a
column/schema drift is unrepresentable. The full `TraceSnapshot` is one
zod-pinned **jsonb** blob (`snapshot`) — written once, read whole by one pane,
never queried per-span, and its `events` sections are class-owned open shapes, so
normalizing would freeze the payloads into SQL and defeat the open registry. The
flat `triggerKind` / `triggerLabel` / `durationMs` / `thresholdMs` columns are
list metadata: `GET /api/traces` reads them and **never selects the (tens-of-KB)
blob**.

- **`ExcludeFromChangeFeed` — yes.** A trace is inserted *exactly* when a span
  tripped its slow threshold — i.e. when the system is already loaded. Wiring
  per-statement live-state invalidation onto it would push a recompute cascade at
  the worst moment and can self-amplify (slow → more traces → more notify →
  slower) — the same recorded reason `slow_ops` is excluded. The Slow Events list
  therefore **hydrates on open** (`GET /api/traces`, metadata only, newest first)
  with a Refresh button, no live resource.
- **7-day TTL sweep** (`debug.trace-cleanup`): a `defineJob`, `singleton`,
  `perWorktree`, daily cron. A trace is debugging evidence, not a durable
  artifact; retention is a code constant (the `bootTraceCleanupJob` precedent),
  not config.

## How to read a snapshot (the blocking-chain walk)

Viewed in the **Debug → Slow Events** Gantt (the old flight-recorder dumped this
to dead-end JSONL). The **trip row** is pinned first; the `spans` lanes,
`gates` strip, and `contention` card fill in below. To find *what blocked the
victim*:

1. **`trigger.detail.waits` names the layer** the victim queued on — e.g.
   `"heavy-read-acquire": 3500` means 3.5 s of the trip's wall-clock was spent
   waiting on that gate, not on its own work. In the Gantt these are painted as
   positioned *wait bands* over the victim's bar at their true offsets, colored per
   layer — so the same gate lines up as one color across every co-queued row.
2. **The `gates` strip shows saturation at the same instant** — `active 4/4,
   queued 11` on that layer confirms the gate was the bottleneck. Gate names use
   the `chargeWait` layer vocabulary, so `trigger.detail.waits`, each span's
   `waits`, and the `gates` keys all join directly.
3. **The `spans` tree names the holder — read it, don't guess it.** The spans
   section is a **nested call-tree waterfall**: every span carries a per-instance
   `id` / `parentId` minted by the recorder, so each row sits under the exact
   parent *run* that opened it (two concurrent `flush`es draining the same loader
   label are two rows under their own parents, not one bucket). The co-queuers are
   the rows whose `waits` include the saturated layer; the **holder** is the one
   with dominant `selfMs`/`childMs` among them. Walk the trip row's subtree — its
   children are literally the work it was blocked behind. Click any bar for its
   label, kind, t0/t1 (wall + relative), resolved ancestor chain, and
   wait/child/self split in the bottom detail strip.
4. **The `contention` card** distinguishes "queued behind a gate" from "the whole
   host was saturated" — a high `loadAvg` vs `cpuCount`, or a spike in pg
   backends, points at host/DB pressure rather than a single holder.

Caveats surfaced in the UI. The *shape* of the tree is exact — nesting is read off
instance ids, never inferred from time overlap — and wait bands sit at their true
offsets, but the window it is drawn from is bounded:

- **The ≥5 ms flight-ring floor.** Completed spans shorter than 5 ms never enter
  the ring, so they are absent from the Gantt entirely.
- **Orphan rows.** A span whose `parentId` resolves to nothing in the window
  renders as a root, marked as such: its parent either closed in <5 ms (never
  entered the ring) or it is a detached, fire-and-forget child that outlived its
  parent. The row is real; only its edge is missing.
- **The wait-band budget.** The recorder keeps at most `WAIT_BAND_CAP` bands per
  `(entry, layer)`, dropping the smallest on overflow. `waitMs` stays the
  authoritative total, so any wait whose position was dropped (or clamped off the
  window edge) shows in the detail strip as `Nms unpositioned` — reported as text,
  never painted. A trace captured before wait bands existed reads as *position not
  captured (pre-wait-band trace)* and paints no band at all.

## Adding a new event class

Create a new sub-plugin under `trace/plugins/<class>/` (a `heap` / `gc` / `cpu`
sampler) and list a `defineTraceEventClass` handle in its `server/index.ts`
`contributions` array:

```ts
// server/internal/class.ts
export const heapClass = defineTraceEventClass({
  id: "heap",
  schema: HeapSectionSchema,            // validates snapshot.events.heap
  // Cheap synchronous read at the trip instant (or omit for an enrich/ring class):
  captureAtTrip: (ctx) => readHeapGauge(),
  // OR: async out-of-band enrichment that doesn't need the frozen instant:
  // enrich: async (ctx, atTrip, ringSlice) => ({ ... }),
  // OR: a continuously-sampled ring — emit(...) elsewhere, get a lane for free:
  // ring: { max: 240 },
});

// server/index.ts
contributions: [heapClass.contribution],
```

Then give it a `Trace.Lane` on the web side keyed by the same `id` (see
`spans` / `gates` / `contention` for the three shapes: per-kind bars, an
occupancy strip, a footer card). Skip the web lane and the class still shows up —
the pane's `GenericEventLane` fallback renders unregistered sections as point
markers + expandable JSON, so a new class is **visible by default, never
silent**. No engine edit, no `*-in-sync` codegen: the snapshot is self-describing
(its `events` keys) and the dispatch fallback covers the rest.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Trace-engine web surface: the Trace.Lane / Trace.TriggerSummary dispatch slots (with generic fallbacks so a new event class or trigger kind is visible by default), plus the trace config registration for Settings → Config. The generic slow-event trace engine: the TraceEventClass registry, captureTrace() admission + coherent-instant capture + async enrich/persist into the durable traces table, list/get endpoints, a daily 7-day sweep, and the test-trigger verification endpoint.
- Web:
  - Slots: `Trace.Lane` ← `debug.trace.contention`, `debug.trace.gates`, `debug.trace.spans`, `debug.trace.stall`, `Trace.TriggerSummary`
  - Contributes: `ConfigV2.WebRegister`
  - Uses: `config_v2.ConfigV2`, `primitives/css/spacing.Stack`, `primitives/css/text.SectionLabel`, `primitives/css/text.Text`, `primitives/slot-render.defineDispatchSlot`
  - Exports: Types: `TraceLaneProps`, `TraceListItem`, `TraceSelection`, `TraceSelectionField`, `TraceTriggerSummaryProps`; Values: `getTrace`, `listTraces`, `Trace`
- Server:
  - Uses: `config_v2.ConfigV2`, `config_v2.getConfig`, `database.db`, `database/change-feed.ExcludeFromChangeFeed`, `infra/duress.createShedBuffer`, `infra/duress.ShedSummary`, `infra/endpoints.HttpError`, `infra/endpoints.implement`, `infra/entities.defaultNow`, `infra/entities.defaultRandom`, `infra/entities.defineEntity`, `infra/jobs.defineJob`, `infra/paths.currentWorktreeName`, `reports.recordReport`
  - DB schema: `plugins/debug/plugins/trace/plugins/engine/server/internal/tables.ts`
  - Exports: Types: `TraceEventClassHandle`, `TraceEventClassSpec`; Values: `_traces`, `captureTrace`, `defineTraceEventClass`, `TraceEventClass`
  - Register: `defineJob('debug.trace-cleanup')`
  - Routes: `GET /api/traces`, `GET /api/traces/:id`, `POST /api/debug/trace/test-trigger`
- Core:
  - Uses: `config_v2.defineConfig`, `fields.FieldsRecord`, `fields.fieldsToZodObject`, `fields/bool/config.boolField`, `fields/date/config.dateField`, `fields/float/config.floatField`, `fields/int/config.intField`, `fields/json/config.jsonField`, `fields/text/config.textField`, `fields/uuid/config.uuidField`, `primitives/pane.defineRoute`
  - Exports: Types: `RingEvent`, `Trace`, `TraceSnapshot`, `TraceTrigger`, `TripContext`; Values: `traceConfig`, `traceDetailRoute`, `traceFields`, `traceListRoute`, `TraceSchema`, `TraceSnapshotSchema`, `TraceTriggerSchema`
- Cross-plugin:
  - Imported by: `debug/health-monitor`, `debug/op-rate`, `debug/sentinel`, `debug/slow-ops`, `debug/trace/contention`, `debug/trace/gates`, `debug/trace/pane`, `debug/trace/spans`, `debug/trace/stall`

<!-- AUTOGENERATED:END -->
