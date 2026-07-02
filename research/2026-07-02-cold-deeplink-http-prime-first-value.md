# Cold deep-link fast first-value: HTTP-prime when the live-state transport isn't ready

**Date:** 2026-07-02
**Status:** design → implementing
**Area:** load-bearing (`primitives/live-state`, touches `networking`/boot indirectly)

## Problem

On a cold page load that deep-links straight into an app (e.g. `/sonata/song/<id>`),
a route-parametrized live-state resource takes **~2.5–3.4s** to show its first data
(worse under host contention). This is the real cause behind the misleading
"Slow operation detected: sonata-key-auto-detect 2679ms" report — the key-detection
algorithm (<30ms), the score pipeline (<27ms) and the piano-roll render (~12ms) are
all fast. The ~2.7s is entirely **time-to-first-data transport settle**.

## Root cause (from the prior investigation, re-confirmed against code)

1. **boot-snapshot deliberately hydrates only param-less global resources.** Route-param
   resources are excluded (`readPersistedSnapshots` hard-codes `params_key = '{}'`;
   the endpoint has no params field). Their first value must therefore arrive over the
   notifications WebSocket sub-ack.
2. **The notifications WebSocket is leader-gated.** `SharedWebSocket` constructs the real
   socket exclusively from the cross-tab-election `onElected` callback, which fires from a
   `navigator.locks.request(...)` grant callback — a browser-scheduled task that **cannot
   run until the main thread yields**. On a cold deep-link, ~8s of synchronous cold-boot
   work (2.8MB bundle parse, zod hydration, DOM construction) starves that callback, so the
   socket isn't constructed until ~8.4s.
3. **Then an ~857KB single sub-ack batch** (all subscriptions replayed at once) takes ~2.5s
   to resolve + transfer + parse. That 2.5s tail is what the slow-op measures as mount→settle.

The `useResource` query is configured `staleTime: Infinity` + `initialData` +
`initialDataUpdatedAt: 0`, so its `queryFn` (`fetchResourceValue`) **never runs on mount** —
data comes only from `hydrateResource` (boot-snapshot, param-less) or the WS sub-ack. For a
route-param resource neither pre-paint hydration happens, so it is hostage to the 8.4s + 2.5s
transport path.

This is **systemic**: config-v2, reports, mail, pages and any route-scoped resource are all
victims on a cold deep-link; sonata just surfaced it.

**Constraint:** the slow-ops "element settle" signal is intentional UX truth and must NOT be
suppressed. The fix must make content actually settle fast at the source.

## Options weighed

- **(a) Fast HTTP path for a resource's initial value when the transport is not yet ready at
  mount** — reuses the existing `fetchResourceValue` HTTP path; warm path unchanged. **CHOSEN.**
- (b) Construct the WS eagerly instead of waiting on the starved election callback. **Rejected:**
  breaks the single-socket-per-origin invariant `SharedWebSocket` exists to guarantee — N tabs
  would open N server connections, duplicate delivery during a reconciliation window, server-side
  sub churn, and it needs entirely new "provisionally-leading, might-get-preempted" machinery.
  High blast radius on load-bearing networking.
- (c) Reduce the ~8s cold-boot main-thread saturation (bundle splitting, cheaper hydration).
  Real and worth doing, but broad, systemic, and orthogonal — already being chipped at
  incrementally (see the react-icons eager-chunk commit). **Filed as a follow-up**, not this fix.
- (d) Extend boot-snapshot to hydrate the deep-link route's parametrized resources pre-paint.
  Feasible but invasive: needs an endpoint-contract param field, a params-aware L2 persistence
  schema/query, a route-aware `Resource.Declare` shape, AND a route→resource-params bridge that
  does not exist today. It also makes the **blocking** pre-paint boot gate heavier. Worse ROI
  than (a). **Rejected as primary.**

## Chosen design (option a)

When a resource mounts **before the transport has ever been ready** and has no hydrated value,
fire a single HTTP GET for its initial value in parallel with the WS coming up. A single small
GET resolves in a few hundred ms — it does not wait on leader election or on the 857KB batch —
so first data lands ~2.5s sooner. The WS sub-ack still arrives later and reconciles.

Two properties make this clean and safe:

### 1. All resource-cache writes go through the version guard (structural fix)

Today the WS write path (`handleServerMessage` → `applyUpdate`/`applyDelta`) is version-guarded
(`msg.version <= entry.version` drops stale frames + bumps `entry.version`), but the HTTP
`queryFn` path writes via React Query's queryFn return — **bypassing that guard**. That is a
latent hazard: a late HTTP response can clobber a newer WS value. Rather than add a second
racy writer, the HTTP prime writes through the **same** version-guarded path as WS frames:

- Add `NotificationsClient.primeFromHttp(key, params, origin)`:
  1. Conditional GET (reuse the existing `fetchResourceValue` ETag/304 logic), reading
     `{ value, version }` — the version is currently discarded; now it is used.
  2. Look up the sub `entry`; apply only if `version > entry.version`
     (`setQueryData(parsed)`, `entry.version = version`, `entry.lastAppliedAt`). A late/stale
     HTTP response is dropped by the same guard that protects WS frames.
  3. On the value parse, a schema violation surfaces **loudly** (rethrow via `queueMicrotask`,
     mirroring the WS `onmessage` discipline). A transient **network** failure is non-fatal —
     traced to the `live-state` channel and ignored, because the WS transport is the source of
     truth and will still deliver. (Specific catch, never bare.)

The prime writes via `setQueryData` (same as `applyUpdate`), so `dataUpdatedAt` bumps and
`pending` flips exactly as it does for a WS sub-ack — no new render path.

### 2. Fires only on genuine cold-start (`firstReadyAt === null` latch)

`NotificationsClient` already stamps `firstReadyAt` the first instant the transport reaches
`"open"` (a one-way, never-reset latch). In `useResource`'s existing observe effect, after
`observe()` (which creates the sub entry the prime needs for version tracking + ETag storage):

```
if (pendingAtMount && !notifications.hasEverBeenReady(origin)) {
  void notifications.primeFromHttp(key, p, origin);
}
```

- **Cold deep-link:** the route resource mounts at ~8.3s, before the socket opens (~8.4s), so
  the latch is unset → HTTP fires → data at ~8.6s instead of ~11s.
- **Warm path (post-first-open navigation):** the latch is set → prime never fires → the warm
  path is byte-for-byte unchanged; a new sub acks over the already-open socket in ~1 RTT.
- Gate is **per-origin** (worktree/central sockets are independent), so a worktree resource
  isn't blocked on the central channel's readiness.

### Bounded herd, and it makes the later WS sub-ack cheap

Only *pending, non-hydrated* resources actually mounted by the cold route fire a prime —
boot-critical globals are already hydrated (`pending` false) and skip. This is the same
bounded set the 857KB batch was carrying; we replace one big serialized batch-wait with N
small parallel GETs that start resolving immediately. For resources that declare `revalidate`,
the prime stores the ETag via the existing `noteHttpEtag`, so the subsequent WS `replaySubs`
sends `If-None-Match` and the server answers `up-to-date` (no second loader run).

## Blast radius

- **`primitives/live-state` web only.** No server change, no wire-protocol change, no schema
  migration. `networking` and boot are untouched.
- Warm path unchanged (latch gate). The new write path reuses the existing version guard, so it
  cannot regress ordering relative to WS frames.
- Adds one client method + one effect branch + a small per-origin readiness accessor.

## Verification

- Functional: cold deep-link into a route-param resource (sonata song) shows data promptly;
  warm navigation unchanged; multi-tab still elects one leader (prime is per-tab HTTP, orthogonal
  to election).
- Observability: the prime emits a `live-state` trace line (`http-prime …`) so the accelerator is
  visible in `logs/live-state.jsonl` next to `sub-ack`.
- Reason about the ~2.5s win from the timeline; the slow-ops signal stays intact and should now
  report a much smaller settle (content genuinely settles fast).

## Follow-ups to file

- **(c)** Reduce cold-boot main-thread saturation (the ~8s before the socket can even construct):
  bundle code-splitting / cheaper boot-critical hydration so the election callback isn't starved.
  This is the remaining large lever; (a) removes the batch tail but not the 8s pre-mount cost.
- **Version-guard the existing invalidate/`refetch` HTTP write too** — the `queryFn` path still
  writes unguarded on `applyInvalidate`/manual `refetch`. Now that `primeFromHttp` establishes the
  version-guarded HTTP write, converge the invalidate path onto it so *every* HTTP write is
  guarded (removes the whole "HTTP clobbers newer WS value" class).
</content>
</invoke>
