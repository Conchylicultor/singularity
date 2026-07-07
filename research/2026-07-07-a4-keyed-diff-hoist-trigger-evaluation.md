# A4 "hoist keyed diffing above the socket loop" — trigger evaluation (NOT met)

**Status: task on hold.** Symptom-gated Track 6.1 of
[`research/2026-07-02-global-comms-structural-fixes.md`](./2026-07-02-global-comms-structural-fixes.md)
(task `task-1783005707302-wz2vx2`). Evaluated 2026-07-07 against the live main
instance. Two independent findings, either of which alone would gate this out:

## 1. The premise is stale — the diff is already hoisted

In the current runtime (`plugins/framework/plugins/resource-runtime/core/runtime.ts`),
**every** push path computes the keyed diff exactly once per `(key, paramsKey)`
and broadcasts one shared message object to all subscribers:

- legacy FULL path: `diffKeyed(entry, pk, value)` once, then
  `for (const s of subs) sendJson(s.ws, msg)` (~line 2163);
- Layer-2 scoped path: `diffKeyedScoped(...)` once (~line 2143);
- M5 membership paths (`drainMembershipFull` / `drainMembershipScoped`):
  `diffKeyed` / `diffKeyedScopedMembership` once (~lines 1797, 1919).

This was **already true at the audit date**: the same
compute-once-then-broadcast shape exists at commit `2aefc8770` (2026-07-02).
The audit's "per-subscriber `subCounts` work" wording appears to have
misattributed — `subCounts` is only the sub/unsub refcount map, never touched
in the push loop.

**Residual per-subscriber work** (the only fan-out-scaling cost left):

- `JSON.stringify(msg)` runs once per socket inside `sendJson`
  (runtime.ts ~line 1462) — the same frame is re-serialized N times;
- `subscribersFor(key, pk)` linearly scans all sockets per drained pk.

Both are O(sockets), trivial at current scale, and each is a small local fix
(stringify once above the loop and pass the string; index sockets by key) if
the trigger ever fires. Neither involves diffing.

## 2. Measured fan-out and flush cost (main instance, 2026-07-07)

Sampled `GET /api/resources/_debug` on `singularity` twice, ~30 min apart:

- **Max concurrent subscribers per (key, params): 1.** Zero params-tuples with
  >1 subscriber across **182 active subscriptions** (74 resources). The
  highest-subscription resources are per-params fans (e.g.
  `config-v2.values`: 125 subs, all distinct params; `jsonl-events`,
  `commits-graph.delta`, `edited-files`, `data-view-custom-values`: 3 subs
  each, distinct per-conversation params) — each still 1 subscriber per tuple.
- Trigger threshold is **>3 concurrent subscribers** on one (key, params);
  measured is 1. The client's per-origin leader election plus the
  one-instance-per-user ADR structurally cap this at ~one subscriber per open
  browser profile, so >3 requires 4+ simultaneous distinct browsers.

`get_runtime_profile` on `singularity` (flush/push kinds):

- `flushNotifies`: 165 calls, avg 206 ms — of which childMs 161 ms (loaders)
  and gate waits dominated by `db-acquire` (~3.3 s union total, boot burst);
  avg selfMs 32 ms covers ALL orchestration + diff + serialize. No
  subscriber-count-correlated cost anywhere.
- The multi-second `deliver:<key>` spans (max 9 s `deliver:notifications`)
  are **enqueue→send latency** during the cold-boot flush burst —
  loader/db-acquire head-of-line, a different (already tracked) story, not
  fan-out CPU.

## Re-arm condition

Revisit only if the profiler shows flush `selfMs` growing with subscriber
count on a hot resource AND `_debug` shows >3 subscribers on one
(key, params) tuple. The fix then is the two residuals above (hoist
`JSON.stringify`, index `subscribersFor`), not diff hoisting — that part is
done.
