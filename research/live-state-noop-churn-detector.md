# Server-side no-op live-state recompute/push detector

## Problem

A keyed live-state resource can be recomputed and pushed to clients at a
sustained high rate (~5/s observed on an idle conversation) while producing **no
content change** — the keyed diff is empty (no upserts, no deletes, order
unchanged). Each such push wastes server CPU (recompute cascade), a WebSocket
frame per client, and a client wakeup, for zero information.

Today this churn has **no automatic detection**. It was only ever surfaced
incidentally by the *client* render-loop detector via the DOM thrash it caused.
Once the client correctly no-ops identical refreshes, that symptom vanishes and
the underlying server-side churn continues undetected.

This is the **detection/observability gap only** — the server-side analog of the
client render-loop report. Eliminating the specific writer/trigger that drives
the ~5/s recompute is a separate follow-up (the detector files a task for it).

## Where the signal lives

`plugins/framework/plugins/resource-runtime/core/runtime.ts`, `drainEntry`, keyed
full path (~line 1279):

```ts
const { upserts, deletes, order } = diffKeyed(entry, pk, value);
// hadSnapshot === true here ⇒ this is a delta push
const changed = upserts.length > 0 || deletes.length > 0 || order !== undefined;
// currently the empty delta is sent UNCONDITIONALLY (no guard) to all subs
```

`subs.length` = client count. An empty diff with `hadSnapshot === true` is a
no-op push.

## Design

Three pieces, mirroring `onSlowSpan` (substrate hook) + `queue-health`
(scheduled reporter).

### 1. `resource-runtime` (framework) — emit a push outcome

Add to `ResourceRuntimeOptions`:

```ts
onPush?(key: string, info: { subscribers: number; changed: boolean }): void;
```

Emit it **once per push to ≥1 subscriber** in the keyed paths of `drainEntry`:
- full keyed path: `changed = upserts.length>0 || deletes.length>0 || order!==undefined`
- scoped keyed path: `changed = upserts.length>0`
- first-notify (`!hadSnapshot`): `changed = true` (legitimately new data)

Pure factory addition; no behavior change to sends. (Value-mode no-op detection
is a follow-up — needs prev-value comparison the runtime doesn't retain.)

### 2. `server-core` (framework) — observer registry (the `onSlowSpan` shape)

server-core owns the singleton worktree runtime. Add a module-level observer set
and export a registration API from the server barrel:

```ts
// resources.ts
const pushObservers = new Set<PushObserver>();
export function onResourcePush(cb: PushObserver): () => void { ... } // returns unsubscribe
// wired into createResourceRuntime: onPush: (key, info) => pushObservers.forEach(cb => cb(key, info))
```

No cycle: server-core (framework) never imports debug; the debug plugin imports
`onResourcePush` from `@plugins/framework/plugins/server-core/server` and
registers at boot.

### 3. `plugins/debug/plugins/live-state-churn` (new) — accumulator + reporter

```
core/
  config.ts        defineConfig: enabled, noopRateThreshold (/s), windowSeconds, minNoopSamples
  kinds.ts         LiveStateNoopPayloadSchema (zod)
  index.ts         barrel
server/
  index.ts         register:[monitorJob]; contributions:[noopKind, ConfigV2.Register]; onReady: install accumulator
  internal/
    accumulator.ts module-level per-key bucketed counters (1s buckets, windowSeconds wide, key cap);
                   recordPush(key,{subscribers,changed}); snapshot(windowSeconds) -> per-key {noopCount,totalCount,rate,subscribers}
    accumulator.test.ts  deterministic bun:test of bucketing + rate + eviction
    monitor-job.ts defineJob cron "* * * * *" perWorktree: read config + snapshot, file report per key over threshold
    noop-kind.ts   ReportKind kind:"live-state-noop", fingerprint:`live-state-noop:${key}`, renderTask
web/
  index.ts         Reports.KindView({match, component}) + ConfigV2.WebRegister
  components/noop-summary.tsx   one-line Debug -> Reports summary
```

Also add `"server-live-state-monitor"` to `SERVER_REPORT_SOURCES` in
`plugins/reports/shared/types.ts`.

**Detection criterion** (per resource key, evaluated each minute over the
trailing `windowSeconds` window): if `noopRate >= noopRateThreshold` AND
`noopCount >= minNoopSamples`, file a deduped report. A no-op push is wasted by
definition, so no "user idle" signal is needed — real activity produces *changed*
pushes, not no-op pushes. The 5/s bug = 300 no-op pushes/min ≫ default 1/s
threshold, so it trips on the first evaluation window.

Defaults: `noopRateThreshold=1` (/s), `windowSeconds=60`, `minNoopSamples=30`,
`enabled=true`. Report variant `warning`, `notifCooldownMs` ~6h. Fingerprint per
resource key ⇒ each churning resource gets its own task.

## Follow-ups (file as tasks)

1. **Eliminate the writer/trigger** causing ~5/s no-op recompute on idle
   conversations (root cause; the detector files this automatically when observed,
   but file an explicit one too).
2. **Suppress empty delta sends in the full keyed path** (symmetric with the
   scoped path's `if (upserts.length)` guard) so redundant WS frames aren't sent
   even before the writer is fixed.
3. **Value-mode (non-keyed) no-op detection** — retain prev serialized value to
   compute `changed` for `update`-mode resources.
