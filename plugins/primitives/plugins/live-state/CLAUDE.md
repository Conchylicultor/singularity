# live-state

## No Suspense — hydrate, don't suspend

Resource reads are **non-suspending** by design. `useResource` returns a
`pending` flag; it never throws a promise. There is no `<Suspense>` boundary
anywhere in the app (the old app-level fallback and the `suspense-boundary`
slot middleware were removed). To avoid a first-paint flash of default values,
seed the cache **before render** with `hydrateResource(resource, params, value)`
(see config_v2's `Core.Boot` task for the canonical use) rather than suspending.

If you ever add a genuinely suspending read (`React.lazy`, `useSuspenseQuery`),
it has **no ambient boundary** — you must wrap it in your own `<Suspense>`.

For non-resource query data there is `hydrateQuery(queryKey, data)` — a raw
seeder on the same default client. Don't call it with a hand-built key; go
through a typed wrapper that owns the key shape. `hydrateEndpoint(endpoint,
params, opts, data)` is the canonical one: it seeds a GET endpoint with the
exact key `useEndpoint` reads (endpoints' `endpointQueryKey`). It lives here
rather than in endpoints because live-state already sits downstream of
endpoints (via log-channels) — the import can only point this way.

## Hazard tests (H1–H7) — the executable correctness argument

The client transport hazards are pinned by named vitest tests under
`web/__tests__/`: `notifications-subs.test.ts` (H4 duplicate-subs +
keep-alive, the `no-sub` frame-drop gate, delta-no-base and delta-drift
forced resubs + the recovery-applies pin, the version guard, per-tab frame
tagging + pagehide `unsub-tab`), `notifications-reconnect.test.ts` (H1
reopen-gap convergence via one `sub-batch`, H1b batch version/epoch echoes +
baseline reset at send, H2 restart version-counter reset via the stale-epoch
full path, the same-boot `up-to-date-batch` cache-keeping resync, H7
level-state convergence + `probeMissedUpdates` over the batch replay), and
`notifications-cross-tab.test.ts` (H6 two-client leader handover +
independently-scoped per-tab replay batches). They build real
`NotificationsClient` + `SharedWebSocket` stacks on the deterministic
fake transports from `@plugins/primitives/plugins/networking/web`
(`createTransportHub`); only `WebSocket`/`BroadcastChannel`/`navigator.locks`
are faked. The server-half siblings (H5, the version short-circuit, gate
dedup, sub-batch) live in
`plugins/framework/plugins/resource-runtime/core/`. Design:
`research/2026-07-03-global-live-state-client-transport-harness.md`. Run:
`bun run test:dom plugins/primitives/plugins/networking plugins/primitives/plugins/live-state`.
When touching `notifications-client.ts`, `shared-websocket.ts`, or
`cross-tab-election.ts`, run these suites — they are the regression fence for
the race-prone core (a prerequisite for the A1 cascade migration).

## Replay is ONE `sub-batch` frame; recovery resubs never echo state

On every socket (re)open — and for the missed-update probe's forced resync —
`replaySubs` sends the channel's whole sub set as ONE `{op:"sub-batch", tabId,
epoch?, complete:true, entries}` frame, built synchronously (snapshot + baseline
reset + send in one task, so an `observe()` can't interleave). Each entry echoes
the sub's pre-reset version; `epoch` is the server boot identity learned from
ack frames. A same-boot server answers every already-current entry from its
in-memory version counter in one `up-to-date-batch` — no loader, no
read-admission slot (see `resource-runtime/CLAUDE.md`). `complete:true` makes
the batch the server's whole truth for THIS tab: subs the tab dropped while
disconnected (or that a closed pane left behind) are reconciled away, and a
`pagehide` listener sends a best-effort `{op:"unsub-tab"}` per channel so a
closing tab's subs release immediately instead of leaking until the socket
cycles.

The old per-sub replay **stagger was deleted deliberately**: same-boot replays
short-circuit server-side for ~0 cost, and post-restart replays are bounded by
the server's read-admission gate + single-flight dedup — the correct layer for
herd control, not client-side pacing (which also forced a probe carve-out and
the H2 per-batch baseline subtleties).

**Recovery resubs never echo state** (`forceFullResub`): a delta with no base or
with drift clears the etag AND resets `version`/`lastAckVersion` to -1 before
sending a version-less sub. The baseline reset is load-bearing — the broken
delta already advanced `entry.version` to the server's current version (the
guard adopts before dispatch), so without the reset the recovery sub-ack at
that same version would be `<=`-dropped and the cache would never heal until an
unrelated bump.

## Per-hop tracing (`live-state` log channel)

`NotificationsClient` traces every hop of the update pipeline to the
`live-state` log channel (`logs/live-state.jsonl`) via `clientLog` — a plain
HTTP path decoupled from the notifications WS, so traces still flush when that
WS is wedged (the exact failure this instruments). Each line is stamped with
`[tabId]`. Read with `tail`/`cat` on the JSONL file.

Always-on lines are low-volume transitions and silent-drop anomalies:
`observe`/`unobserve`, `sendSub`, `sub-ack`, `replaySubs`, `probeMissedUpdates`,
net-diag socket/election transitions, and every `drop reason=…` (`no-sub`,
`stale-version`, `parse-error`, `delta-no-base-resub`).

The per-frame successful `applyUpdate` line is **high-volume** and is gated
behind a dev-only flag — it is silent unless you opt in:

```js
localStorage.setItem("liveState.verboseTrace", "1"); // enable; "0"/remove to disable
```

This is intentionally a localStorage flag (read with a try/catch for
SSR/denied-storage safety), not a `config_v2` server-plumbed setting — it's a
local debug switch, not user config.

## One socket per origin, shared across tabs

The `NotificationsClient` talks to the server over a `SharedWebSocket`: a single
tab is elected leader and owns the real socket; every received frame is
broadcast to **all** tabs (and dispatched to the leader itself). So a given
tab's `handleServerMessage` runs for **every** server frame — including pushes
for resources only *other* tabs subscribed to.

The load-bearing consequence: a tab must apply a frame only for `(key, params)`
it holds a **live local subscription** for. `handleServerMessage` gates on the
local sub `entry` (`channel.subs.get(id)`) before dispatching to
`applyUpdate`/`applyDelta`/`applyInvalidate`, and that same gate carries the
version guard + bump. Because `observe()` registers the schema (and `keyOf`)
together with the sub entry, a present entry guarantees the schema is
registered — so the apply paths can parse safely. Dropping the gate reintroduces
the "no schema registered for key=…" crash whenever one tab observes a resource
(e.g. the config sidebar's `config-v2.conflicts`) and another tab, mounted on a
page that never observes it, receives the broadcast push.

**`sub-error` frames carry `params` and heal through `applyInvalidate`.** A
`sub-error` frame is now `{ kind, id?, key, params, reason }` — `params` was added
so the shared-socket broadcast can be gated on the local sub entry exactly like
every other frame (a params-less legacy frame won't match a live sub → safe
drop). When the entry exists, the client calls `applyInvalidate(key, params)`:
the HTTP fallback refetch runs and **its own outcome** sets `q.error` naturally
(a 500 loader-failed / 404 unknown-key surfaces as `ResourceHttpError`) or heals
if the failure was transient. This reuses the single existing error channel — no
queryClient internals — and actually un-wedges the pane, instead of the old
`console.error`-and-drop that left the resource `pending` forever with
`error: null`. (Pre-existing hole, out of scope: `handleResourceHttp` runs no
`authorize` check — moot today with zero `authorize` resources, tracked as a
follow-up for when that seam ships.)

## Resource schemas

Every resource **must** declare a `schema` (Zod) — it is required on
`defineResource` (both runtimes) and guarded at registration. The payload is
parsed against that schema **twice**, by design:

- **On the server, at load time** — the single chokepoint (`timedLoad` in the
  shared `@plugins/framework/plugins/resource-runtime/core`, which now backs both
  the server and central channels) parses the loader output before any broadcast
  or HTTP response. A payload that violates its schema throws
  there and is handled by the existing loader-failure path (reported + the send
  skipped / a `sub-error` returned) rather than shipping a malformed value. This
  is the single structural guarantee that every live-state payload matches its
  declared schema. Keyed Layer-2 scoped loads return a partial array, which
  still satisfies the `z.array(Element)` schema.
- **On the client, on receipt** — before the value lands in the TanStack cache,
  at both write paths: the HTTP path (`NotificationsClient.fetchOverHttp` — see
  "One version-guarded HTTP write path" below) and the WS push path in
  `NotificationsClient.applyUpdate` (a key→schema registry populated as
  `useResource` calls `observe`). A parse failure on the WS push path is no
  longer swallowed: the `onmessage` handler re-throws it asynchronously
  (`queueMicrotask`) so it surfaces as an uncaught browser error the crashes
  plugin reports, rather than silently leaving the cache at its empty default.

This makes the TS type and the runtime shape impossible to drift: types like
`Date` that don't survive `JSON.parse` are coerced (`z.coerce.date()`) on the
way in, so consumers can rely on them. See
`research/2026-06-08-global-mandatory-resource-schema-server-validation.md`
(and the earlier `research/2026-04-29-global-resource-schema-validation.md` for
the original client-side migration).

## One version-guarded HTTP write path (`fetchOverHttp`)

Every HTTP resource-cache write goes through the **single** method
`NotificationsClient.fetchOverHttp(key, params, origin, schema, source)`:

- `useResource`'s `queryFn` (WS-down fallback + `invalidate`-mode post-invalidate
  refetch) calls it with `source: "fallback"` and lets errors propagate to
  `q.error`.
- The cold-start prime (`primeFromHttp`) delegates to it with `source: "prime"`,
  fire-and-forget: a transient network (`TypeError`) / HTTP-status
  (`ResourceHttpError`) failure is swallowed (the WS sub-ack is the source of
  truth); a schema/parse failure is a real bug rethrown via `queueMicrotask`.

It writes through the **same version guard** as WS frames, so a late HTTP
response can never clobber a newer WS value — with one deliberate difference: the
HTTP guard is **strict `<`** where the WS guard (`handleServerMessage`) is `<=`.
An HTTP GET *reports* the server's per-`(key,params)` version counter without
bumping it, so a legitimate response can *equal* the version already applied — in
particular the normal `invalidate` refetch (the `invalidate` frame advanced the
client to `N`, the refetch GET returns `N`). `<` accepts that equal version (a
no-op write for push/keyed via structural sharing) while still dropping a
genuinely-stale older read; `<=` here would silently discard invalidate mode's
refetch. `fetchOverHttp` returns the *effective* cached value (the freshly
applied one, or the retained value on a `304`/stale drop) so React Query's
`queryFn` contract holds with no separate render path. See
`research/2026-07-02-converge-http-resource-writes-version-guard.md`.

**Both fetches are `cache: "no-store"`, deliberately.** The conditional GET and
the defensive refetch pass `cache: "no-store"` so the browser HTTP cache never
stores or replays a resource body. Without it, the browser cached an old-boot
body `{value, version: 1}` and, on a later request, transparently revalidated it
with its stored `ETag`. Because some resources emit a **restart-stable** ETag
(`edited-files` is content-addressed for 304 herd-collapse), the server 304'd
after a backend restart and the browser handed JS the *old-boot* body — versions
are per-boot in-memory counters, so the cross-boot compare dropped it as stale
and the pane wedged on "Close (state unknown)". `no-store` kills that at the
client; the server pairs it with `Cache-Control: no-store` on the 200 **and** the
304 (the handler that emits the ETag owns forbidding cache storage — see
`resource-runtime/CLAUDE.md`). Design:
`research/2026-07-15-global-live-state-http-cache-poisoning-class-fix.md`.

**Epoch-aware cross-boot guard.** The HTTP body now carries
`{ value, version, epoch }` — `epoch` is the server `bootEpoch`, the twin of the
WS ack epoch — because a bare version compare across boots is meaningless (the
counter resets to 0 each boot). `ActiveSub` carries `epoch?` labelling which boot
`entry.version` belongs to (stamped when a version is adopted from an
epoch-carrying frame, and on an HTTP apply). The strict-`<` guard is replaced by a
4-case matrix, engaged only when `entry` exists and `body.epoch` is defined (an
epoch-less body from a pre-upgrade server keeps today's strict-`<` behavior):

1. **Same boot** (`body.epoch === entry.epoch`) — keep strict-`<` (preserves the
   equal-version accept the `invalidate` refetch depends on).
2. **Entry is stale-boot** (epochs differ, `body.epoch === channel.serverEpoch`) —
   **ADOPT**; the WS channel's current server identity vouches for the body, and a
   cross-epoch adopt sets `entry.version = body.version` unconditionally (the old
   number is meaningless).
3. **Body is stale-boot** (epochs differ, `entry.epoch === channel.serverEpoch`) —
   **DROP** (`stale-epoch`), subject to the never-applied escape below.
4. **No arbiter** (epochs differ, `serverEpoch` matches neither / undefined) —
   **ADOPT**. This is the WS-down fallback window — `fetchOverHttp`'s raison
   d'être; dropping here would starve the fallback for a whole outage, and a live
   response beats a memory of unknown vintage. A socket reopen resets the replay
   baseline to -1 before any WS frame applies, so a post-adopt frame can't
   mis-compare.

**Never settle with a placeholder (`ResourceStaleReadError`).** A stale-dropped or
`304` body must never *settle* a query that still holds only its `initialData`
placeholder (the exact limb of the wedge: React Query marks the queryFn a success
and the query settles holding a value the server never vouched for). The guard is
`hasAppliedValue(key, params)` (`dataUpdatedAt !== 0` — `initialData` is seeded at
`0`): when a value was already applied, a stale drop returns the cached value
(today's behavior — the cache holds server-vouched newer truth); when
**never-applied**, it **throws a typed `ResourceStaleReadError`** (a sibling of
`ResourceHttpError` carrying `key`, `bodyVersion`, `haveVersion`, `reason`) rather
than returning the placeholder or applying the stale body (which could render
old-boot data under destructive buttons). On the same-epoch invalidate race
(entry bumped to N+1, GET raced the flush and returned N) the throw drives RQ's
`retry: 1` → the flush lands → it applies; a persistent throw settles `q.error`
typed and visible (through `ResourceView`/`matchResource`'s error arm, no toast)
and the next invalidate frame heals it. `primeFromHttp` swallows
`ResourceStaleReadError` as a transient (prime is best-effort; the WS sub-ack is
truth) with its own trace line.

**Stale-drop observability sink.** Every stale drop emits a policy-free
`HttpStaleDropReport` into `httpStaleDropReportSink` (`web/stale-drop-reporter.ts`,
re-exported from the barrel) carrying a running `consecutiveDrops` count
(`NotificationsClient` keeps a `Map` keyed `(key, params)`, incremented on drop,
**reset in `markApplied`** on any WS or HTTP apply). The primitive owns no
threshold — it emits on every drop; the `reports/live-state-stale-drop` consumer
owns the wedge policy (fire once at `consecutiveDrops === 3 && neverApplied`).
Import direction is legal: `live-state` → `report-sink` (a leaf); `live-state`
must never import `reports`.

## Commit watermarks (`getResourceWatermark` / `compareTxWatermark`)

Full-reconcile frames from a worktree server carry a `watermark` — the
snapshot's `pg_snapshot_xmin(pg_current_snapshot())` as xid8 decimal text,
captured by the resource runtime before the loader read. `NotificationsClient`
notes it into a module-level registry (`web/watermark-registry.ts`, keyed
`(key, params)`, monotonic adopt) immediately **before** the cache write it
describes, so a QueryCache listener reading `getResourceWatermark(key, params)`
synchronously sees the causal floor of the value it was just handed. The
optimistic-mutation primitive compares that floor against mutation ack tokens
(the `currentTxId` a mutation endpoint returns) to confirm — or causally deny —
pending overlay ops.

**Rule B′ (which frames carry one):** only frames that fully reconcile the
client to server truth as of the capture — `sub-ack`, `update`, FULL keyed
deltas, and the HTTP body. Scoped deltas **never** do (they re-read only
affected rows; stamping one would let a client wrongly deny a pending op). This
is the twin of resource-runtime's "etag rides only the `update` frame" rule. An
absent watermark (fresh sub, central-origin resource, pre-watermark server)
means "no causal floor": confirming by content is fine, denial is forbidden.

Compare watermarks and ack tokens only with `compareTxWatermark`
(`live-state/core`) — xid8 decimal text overflows `Number` and is not
lexicographically ordered ("9" > "10"), so BigInt comparison is the only sound
one. Full design:
`research/2026-07-11-global-never-revert-optimistic-edits.md`.

## Descriptor registry (`resourceDescriptorByKey`)

Every descriptor factory (`resourceDescriptor`, `keyedResourceDescriptor`,
`centralResourceDescriptor`) self-registers its result into a module-level
key→descriptor map at **descriptor-module evaluation time** (the factory call runs
on import, before first paint). `resourceDescriptorByKey(key)` reads it back.
boot-snapshot uses this to resolve the snapshot's boot-critical keys to their
client descriptors *before* the first render — earlier than any `useResource`
runs.

This is **distinct from the observe-time key→schema registry** (populated as
`useResource` calls `observe`, used by `applyUpdate` to parse WS pushes): that one
only exists once a component has mounted and subscribed, which is **too late** for
pre-paint boot hydration. The descriptor registry is keyed off import evaluation,
so it is ready while boot tasks run.

## Keyed delta sync (`mode: "keyed"`)

Array resources that rebroadcast the whole list on every change can opt into
row-level delta sync. The resource still runs its full loader, but the server
keeps a per-`(key,params)` snapshot of id→hash, diffs the new result by row id,
and broadcasts only `upserts`/`deletes` — not the whole array. The client merges
by id and keeps unchanged rows' object references, so memoized row components
don't re-render.

The delta carries the full id `order` **only when membership/order actually
changed** (an add, delete, or reorder). For the common in-place-update case (a
status/title flip on one row) `order` is omitted entirely, so the frame is just
the one changed row — the id list (which dominates the frame for large lists) is
never sent. When `order` is absent the client maps over its prior array in
place, swapping changed rows by id; when present it rebuilds from the
authoritative `order`. An omitted `order` strictly means "in-place upserts,
membership unchanged" (`deletes` is then necessarily empty, and there are no new
ids).

Keyed-ness is declared in **one place** — the client descriptor — and the server
reads it from there, so the two sides cannot drift (a server `mode: "keyed"`
paired with a plain `resourceDescriptor` that forgot its `keyOf` is a guaranteed
client crash with no compile-time signal; the single-source form removes the
class):

- **Client/shared** — use `keyedResourceDescriptor(key, schema, initialData,
  keyOf)` instead of `resourceDescriptor`. `schema` stays `z.array(Element)`, so
  `T` (and every `useResource` caller) is unchanged — callers still get `T[]`.
  The `keyOf` keys prior cache rows when merging a delta; per-row parsing goes
  through the array schema's `.element`. A delta that arrives with no cached base
  is dropped and a fresh full sub is forced (load-bearing guard).
- **Server** — pass that descriptor to the two-arg
  `defineResource(descriptor, { loader, dependsOn?, identityTable? })`. The
  `key` / `schema` / `mode: "keyed"` / `keyOf` are all derived from the
  descriptor; the server supplies only the DB-bound half. Do **not** restate
  `mode`/`keyOf` — the `ServerResourceOptions` type rejects `mode: "keyed"` so
  keyed-ness can only come from the descriptor. (The flat one-arg
  `defineResource({ key, mode, schema, loader })` form is **push/invalidate-ONLY**
  and structurally **cannot** be keyed — a keyed resource MUST use
  `keyedResourceDescriptor(...)` + the two-arg `defineResource(descriptor, opts)`
  form. Inline `keyed:` contract literals are banned by the
  `keyed-resource-scope` check.) The first notify per pk (and every `sub-ack` /
  HTTP fallback) still ships a full `{ value, version }` so brand-new clients get
  a complete base; subsequent notifies ship a `delta`.

  Caveat — descriptor and server resource must live where the server can import
  the descriptor without a plugin cycle. When the descriptor lives in a sub-plugin
  the server can see (e.g. `agents/shared`, `tasks-core/core`), this is automatic;
  when it lives in a parent umbrella the server's plugin already depends on (the
  `tasks/core` → `tasks-core` case), the descriptor must be relocated down to the
  shared sub-plugin first.

Strictly additive: `push`/`invalidate` resources are untouched. `tasks` and
`attempts` are the first adopters.

### Scoped recompute (`notify(params, { affectedIds })`)

Layer 1 shrinks the wire payload but the keyed loader still recomputes the
**whole** view on every fire. Layer 2 lets a high-frequency content-only caller
scope the recompute: `notify(params, { affectedIds: [...] })` tells the loader,
via `ctx.affectedIds`, which row ids changed, so it can `WHERE id IN (…)` and
return only those rows. The scoped diff merges the partial result into the
existing snapshot and ships a `{ kind: "delta", upserts, deletes: [], order:
undefined }` — exactly Layer 1's content-delta shape, so the client needs zero
changes. An empty scoped set skips the send entirely.

This is **opt-in and strictly additive**: plain `notify()` / `notify(params)`
keeps today's full-recompute semantics, which remain authoritative for any
membership change (create/delete/reorder must stay FULL — a scoped delta never
asserts `order`/`deletes`). It is also **sticky-FULL**: within one flush, if any
contributor to a pk is id-less (or a cascade edge can't map ids), the pk
degrades to a FULL recompute — scoping never silently drops a change, and the
next FULL notify or a resub self-heals any drift. Cascades propagate scope via
an `affectedMap?(upstreamAffected, upstreamParams) => string[]` on each
`dependsOn` edge (upstream-FULL, missing map, or a throwing map ⇒ downstream
FULL). `affectedMap` must self-query the DB rather than read the upstream value,
so it does not force the upstream loader to run. The conversation poller and
`insertPush` were the first adopters.

**M5 exception (`scopedMembership`)**: a keyed resource that opts into scoped
membership on the server CAN ship a scoped delta that asserts membership — real
`deletes` plus the full `order` list — for row-level INSERT/DELETE/where-flip
changes (a DELETE ships with zero DB queries; an INSERT runs the scoped refill
plus one ids-only `orderOf` query). The client needs **zero changes**: when
`order` is present it already rebuilds the array from it (the same path a FULL
membership delta uses), and `deletes` stays informational. See
`plugins/framework/plugins/resource-runtime/CLAUDE.md` and
`research/2026-07-03-global-scoped-membership-m5.md`. The
`conversations-active`/`conversations-system` scans are the first adopters.

### Bounded windows and point reads (`windowResourceDescriptor` / `pointResourceDescriptor`)

> **DEFAULT for new resources.** New DB-backed collection descriptors use these bounded
> factories (window / point); `keyedResourceDescriptor` over an unbounded collection is legacy
> pending migration — don't copy existing unbounded resources as precedent. See
> `research/2026-07-18-global-bounded-working-set-resource-contract.md`.

The bounded working-set contract
(`research/2026-07-18-global-bounded-working-set-resource-contract.md`) rides
the SAME keyed wire — **a window is just a params tuple**. Two descriptor
factories in `core/window.ts` declare a keyed resource whose membership is a
bounded selector carried in the sub params:

- `windowResourceDescriptor(key, elementSchema, keyOf, { defaultLimit,
  bootCritical? })` — an ordered window; params are `{ limit: "100" }`.
- `pointResourceDescriptor(key, elementSchema, keyOf)` — an explicit id set;
  params are `{ ids: "a,b" }` (sorted, deduped, comma-joined). Never
  `bootCritical` (post-mount hydration is the recorded decision).

The descriptor **carries the selector codec** (`.window.encode/decode`,
`.point.encode/decode`), so the client hooks, the boot paths, and the server
compiler (`windowQueryResource` in `infra/query-resource`) all derive params
from one encode/decode pair. Encode is canonical and decode is STRICT
(malformed params throw): the SAME logical selector must always produce the
SAME params object, because paramsKey identity is what makes boot hydration,
the subscription, and the server land on ONE per-tuple state. A future cursor
rides as an additional `cursor` key (absent field = absent key), so cursor-less
windows keep their paramsKey.

`defaultParams` (a generic optional `ResourceDescriptor` field, set by the
window factory to the encoded default window) is how boot-snapshot serves a
windowed `bootCritical` resource: the server's fallback loader runs at
`resourceDescriptorByKey(key)?.defaultParams` and the client hydrates at
`d.defaultParams` — the identical tuple a bare `useWindowResource(r)`
subscribes to.

Web hooks (`web/window-hooks.ts`):

- `useWindowResource(resource, { limit? })` → `ResourceResult<El[]>`, default
  = the descriptor's default window.
- `usePointResource(resource, id)` → `ResourceResult<El | null>` — the O(1)
  replacement for an O(n) `.find()` over a whole-collection resource. Built on
  the documented select/gate mechanics (`select` narrows the 0-or-1-element
  payload to row-or-null; `gate: true` keeps the pending→settled flip reliable
  when the slice is `null` on both sides of the boundary). `null` on the
  settled arm is determinate: the server answered, the row does not exist.
- `usePointResources(resource, ids)` — one coalesced tuple for an explicit
  set; per-row `usePointResource` subs are the decided default.

The server runtime half (membership routing, bounded deltas, the
never-persisted rule) lives in
`plugins/framework/plugins/resource-runtime/CLAUDE.md`; the compiler in
`plugins/infra/plugins/query-resource/CLAUDE.md`.

### Future escape hatch (NOT yet implemented)

Some hot-path resources may eventually be large enough that Zod-parsing every
push hurts. The planned escape hatch is a `transform: (raw) => T` field on the
descriptor that bypasses Zod for those cases. Don't add it speculatively —
current payloads are small and parse cost is negligible.

## Keep-alive subscriptions (deferred teardown)

The WS subscription lifetime is aligned with the TanStack Query cache via a
gc window. `useResource` is backed by React Query, which keeps the **cache
entry** alive after the last observer leaves (its `gcTime`). The WS
subscription used to lack an equivalent: `unobserve` tore the sub down the
instant refcount hit 0, so a transient unmount→remount churned an
unsub→resub round-trip on the wire.

`NotificationsClient` now defers that teardown by `SUB_KEEPALIVE_MS` (30s).
When the last observer of a `(key, params)` leaves, the sub stays in
`channel.subs` with refcount 0 and a one-shot timer is parked in
`channel.pendingTeardown`. A resurrecting `observe()` within the window
cancels the timer and bumps refcount back up — **zero WS traffic**. Only if
the window elapses with refcount still 0 does the timer fire the `unsub` and
delete the sub. This is a one-shot deferred-cleanup timer, **not a polling
loop** — it checks nothing on a schedule (mirrors React Query's own
`setTimeout`-based gc).

The consequence: transient observer churn — e.g. a reorderable slot rendered
**per row** in a streaming/virtualized list, where rows mount and unmount as
events arrive and filters apply — reuses the one live sub instead of flapping
it. This is why a per-row `useResource` of a **row-invariant** value no longer
needs a manual hoist (the old `ReorderHoist` provider): N rows already share
one cache entry and one refcounted sub, and the keep-alive window absorbs the
mount/unmount churn at the live-state layer.

Trace gating follows from this: the always-on `live-state` channel logs only
real **transitions** — the 0→1 new sub, and the eventual `teardown`. Refcount
bumps (resurrection / decrement above 0) are silent on the always-on path so a
per-row list doesn't storm the low-volume channel; `emitDebug()` still fires on
every change so the live-state-health inspector stays accurate.

## `pending` means "no trustworthy value"; an unknown value is `Resolvable`

Two different things can stand between a consumer and a value, and they live in
two different channels. Keeping them apart is what makes a destructive default
unreachable by construction rather than by a remembered guard (see
`research/2026-07-09-global-resource-unknown-value-and-error-gate.md`).

**The `error` channel — transient.** *"We failed to determine the value; a retry
may succeed."* `pending` is `!hasValue || error !== null`, so never-loaded and
errored are one state to a consumer, and the settled arm **deliberately omits
`error`**:

```ts
type ResourceResult<T> =
  | { pending: true;  error: Error | null; stale?: T; refetch }
  | { pending: false; data: T;                        refetch };
```

A value you can read is one the server currently vouches for. Reading `.error`
off a narrowed-settled result is a **tsc error** — that is the enforcement, and
it is why the field is absent rather than typed `null` (`null` is assignable to
`Error | null`, so a `null`-typed field would catch nothing). Last-known-good
under a transient error is the opt-in `stale?: T` on the pending arm: named,
greppable, and never what a `.data` read reaches. `matchResource`/`ResourceView`
pass it to the error handler for surfaces that prefer to keep painting.

The one sanctioned exemption is `useOptimisticResource`: editors keep painting
`stale` under an error and report it through `error` + `sync-status`, rather than
blanking the document.

`ResourceStaleReadError` (see "One version-guarded HTTP write path") lives in this
transient channel: a never-applied HTTP body the version/epoch guard rejected is
**thrown**, not returned, so the resource stays `pending` (retryable) instead of
settling on its `initialData` placeholder — the structural fix for the
"Close (state unknown)" wedge, where returning the placeholder had marked the
queryFn a success and settled a value the server never vouched for.

**The value channel — determinate.** *"The server has an answer, and the answer
is: there is nothing to determine."* A loader branch that **cannot determine**
its value must say so in the payload, via `Resolvable<T>` from `live-state/core`:

```ts
type Resolvable<T> = { resolved: true; value: T } | { resolved: false; reason: string };
resourceDescriptor("edited-files", resolvableSchema(z.array(EditedFileSchema)), unresolved("not loaded"))
```

It settles, renders its `reason`, and stops retrying — where a throw would wedge
the resource `pending` forever. It never returns the empty value: `[]` must mean
*measured, and empty*. `edited-files` and `commits-graph.{delta,graph}` are the
adopters — each collapses "no worktree" and "worktree reaped mid-compute" onto
one `unresolved(…)` via an `onWorktree` helper, with `revalidate` returning the
matching `"no-worktree"` ETag from the **same branch** so the pair stays
co-produced. Every *other* git failure still throws.

This is the resource-payload form of the repo-wide rule in the `api-design`
skill ("Failure must be a type, not an absorbable value"). `initialData` should
be `unresolved("not loaded")` for such a resource — a self-describing non-value
rather than a lie.

## Readiness gates — never collapse `pending` into a default

`useResource` returns a discriminated union: `.data` does not exist while
`pending`. Do **not** defeat it with `r.pending ? [] : r.data` — that collapses
"still loading" and "genuinely empty" into the same value, and downstream UI
renders a confidently-wrong state (empty lists, zero counts, destructive
default button modes) during the load window. The
`live-state/no-pending-data-collapse` lint rule bans the idiom (BURNDOWN
allowlist in `lint/index.ts` — migrate entries, never add).

Sanctioned patterns, in order of preference:

```tsx
// One resource, JSX — children only ever run with settled data.
<ResourceView resource={songs} fallback={<Loading variant="cards" />}>
  {(rows) => <Grid rows={rows} />}
</ResourceView>

// One resource, expression position.
matchResource(songs, { ready: (rows) => …, pending: () => … })

// SEVERAL resources — all-or-nothing, so a view can never render from a
// half-loaded snapshot (the queue "Unranked" bug class). Accepts useResource
// results, useOptimisticResource results, and nested combined results.
const all = useCombinedResources({ conv, ranks, tasks });
if (all.pending) return <Loading variant="rows" />;
const { conv: c, ranks: r, tasks: t } = all.data;

// Early return — plain narrowing is always fine.
if (r.pending) return <Loading />;

// List/grid surfaces: DataView's `loading` prop — emptyState requires
// confirmed-empty, the skeleton renders while loading.
<DataView rows={rows} loading={result.pending} … />
```

Defaults: `<ResourceView>`/`matchResource` fall back to `<Loading/>` (delayed
~120ms — a warm WS load paints content with zero flash) and an error
`Placeholder`. Data-dependent **action buttons** (label/destructiveness varies
with data) render disabled-neutral while pending — never a default mode, and
especially never the destructive one (see push-and-exit / drop-and-exit).

**Gate restriction:** feed only whole-resource results into gates — never a
`select` result (silent-flip caveat below). For a select-based readiness read,
pass `gate: true` (next section).

## Slice selectors (`useResource(resource, params, { select })`)

A **point or derived read of a list resource** — e.g. one row out of the
`conversations` list — must not re-render on every push to the whole list. Pass a
`select` to subscribe to a derived **slice**: the component then re-renders
**only when the selected slice changes**.

```ts
const select = useCallback(
  (p: ConversationListPayload) => p.active.find((c) => c.id === id) ?? null,
  [id],
);
const q = useResource(conversationsResource, undefined, { select });
// q.data is the row (or null); re-renders only when THAT row changes.
```

Two React Query mechanics make this work, and both are engaged **only** when
`select` is present (plain `useResource` is byte-for-byte unchanged):

- **Structural sharing on the select output** — RQ runs `replaceEqualDeep` on
  the selected value, so a deeply-equal slice keeps its previous reference and
  the observer is not notified. This holds even for a full-payload `update`-mode
  resource (the whole struct is reparsed each push): the comparison is on the
  **selected** value, not the payload.
- **`notifyOnChangeProps: ["data", "error"]`** — `useResource` reads
  `q.dataUpdatedAt` for its `pending` flag, and `setQueryData` bumps that on
  **every** push. Without scoping, that bump alone re-renders every subscriber
  (the real driver of the O(C²) storm, where ~175 toolbar components each
  observed the global `conversations` list). Scoping notifications to data/error
  stops it. Reading `dataUpdatedAt` does not re-enable it once
  `notifyOnChangeProps` is an explicit list.

Caveat: with `select`, `pending` flips to `false` **silently** (no re-render) if
the selected slice is identical across the initialData→first-real-data boundary.
Harmless for point lookups — the caller sees the same value either way. Pass a
**stable** selector (`useCallback`) so it is not re-run every render.

**`gate: true`** fixes that caveat for select-based READINESS reads (e.g.
`useHasActiveSiblings`, whose boolean decides a destructive button mode): the
subscription stays un-scoped until the first authoritative value arrives — at
most a couple of pushes — so the pending→settled flip always re-renders, then
narrows to the select-scoped subscription with steady-state behavior identical
to plain `select`. Without it, a gate built on a select result can wedge as
pending forever.

This narrows re-renders, not the WS subscription: N callers of the same
`(key, params)` still share one refcounted sub (deduped server-side). The
residual cost is the selector's own `find` (cheap, no React work); if a list
ever grows large enough that point-lookup *compute* matters, normalize it into a
`mode: "keyed"` flat array (per-row references already stable) rather than
reaching for a heavier entity cache.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.
- Load-bearing: yes
- Web:
  - Uses: `infra/endpoints.endpointQueryKey`, `primitives/css/placeholder.Placeholder`, `primitives/latest-ref.useLatestRef`, `primitives/loading.Loading`, `primitives/log-channels.clientLog`, `primitives/networking.NetDiagEvent`, `primitives/networking.SharedWebSocket`, `primitives/networking.subscribeNetDiag`, `primitives/networking.subscribeWsStatus`, `primitives/networking.WsStatus`, `primitives/tab-id.getTabId`
  - Exports: Types: `ChannelStatuses`, `CombinedResources`, `DebugSnapshot`, `DebugSub`, `GateDataOf`, `GateInput`, `HttpStaleDropReport`, `LeaderInfo`, `LiveStateSocketKind`, `MatchResourceHandlers`, `MissedFrame`, `PointParams`, `PointResourceDescriptor`, `ResourceDescriptor`, `ResourceKey`, `ResourceOrigin`, `ResourceResult`, `ResourceViewProps`, `SlowResourceInfo`, `WindowParams`, `WindowResourceDescriptor`, `WindowSelector`; Values: `centralResourceDescriptor`, `combineResources`, `ensureNotificationsClient`, `getNotificationsClient`, `getResourceWatermark`, `hasResourceTxAck`, `httpStaleDropReportSink`, `hydrateEndpoint`, `hydrateQuery`, `hydrateResource`, `keyedResourceDescriptor`, `liveStateSocketKind`, `matchResource`, `noteResourceTxAcks`, `noteResourceWatermark`, `NotificationsClient`, `NotificationsProvider`, `pointResourceDescriptor`, `queryKeyFor`, `registerSlowResourceReporter`, `resourceDescriptor`, `resourceDescriptorByKey`, `ResourceStaleReadError`, `ResourceView`, `subscribeResourceTxAcks`, `useCombinedResources`, `useNotificationsChannelStatuses`, `useNotificationsClient`, `useNotificationsStatus`, `usePointResource`, `usePointResources`, `useResource`, `useWindowResource`, `windowResourceDescriptor`
- Cross-plugin:
  - Imported by: `active-data`, `active-data/attempt`, `active-data/task`, `active-data/task-link`, `apps/agent-manager/worktree-switcher`, `apps/browser/bookmarks`, `apps/browser/history`, `apps/browser/start-page`, `apps/deploy/servers`, `apps/mail/inbox`, `apps/mail/mail-core`, `apps/mail/mailbox`, `apps/mail/reading-pane`, `apps/mail/sync-status`, `apps/mail/thread-list`, `apps/pages/history`, `apps/pages/page-tree`, `apps/pages/starred`, `apps/pages/trash`, `apps/pages/welcome/recent-pages`, `apps/prototypes/files`, `apps/prototypes/gallery`, `apps/settings/config`, `apps/sonata/library`, `apps/sonata/playback-history`, `apps/sonata/rich/key-mode`, `apps/sonata/rich/rhythm-controls`, `apps/sonata/sources/midi`, `apps/sonata/track-mixer`, `apps/sonata/transpose`, `apps/story/generation`, `apps/story/marker`, `apps/story/render`, `apps/story/shell`, `apps/studio/compositions/release`, `apps/studio/compositions/release/release-artifact`, `apps/studio/compositions/release/release-info`, `apps/studio/compositions/release/release-logs`, `apps/website/blog/pages-integration`, `apps/website/blog/publish`, `apps/website/blog/site`, `apps/workflows/definitions`, `apps/workflows/engine`, `apps/workflows/executions`, `auth`, `auth/apple-signing/setup-wizard`, `auth/google/setup-wizard`, `build`, `build/build-fix`, `build/build-info`, `config_v2`, `config_v2/settings`, `config_v2/staging`, `conversations`, `conversations/agents`, `conversations/all-conversations`, `conversations/conversation-category`, `conversations/conversation-preprompt`, `conversations/conversation-progress`, `conversations/conversation-view`, `conversations/conversation-view/code`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/dependencies`, `conversations/conversation-view/dependent-count`, `conversations/conversation-view/drop-and-exit`, `conversations/conversation-view/drop-dependents`, `conversations/conversation-view/jsonl-viewer`, `conversations/conversation-view/jsonl-viewer/event-counter`, `conversations/conversation-view/jsonl-viewer/message-toc`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`, `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`, `conversations/conversation-view/notes`, `conversations/conversation-view/op-status`, `conversations/conversation-view/push-and-exit`, `conversations/conversation-view/turn-summary`, `conversations/conversations-view/data-view/history`, `conversations/conversations-view/data-view/queue`, `conversations/conversations-view/queue`, `conversations/effort-provider`, `conversations/model-provider`, `conversations/recover`, `conversations/summary`, `debug/claude-cli-calls`, `debug/live-state-health`, `debug/queue`, `debug/reports`, `debug/slow-ops`, `debug/slow-ops/pane`, `debug/zero-test`, `fields/secret/config`, `framework/web-core`, `infra/boot-snapshot`, `infra/claude-cli`, `infra/events`, `infra/health`, `infra/jobs`, `infra/query-resource`, `infra/trash`, `page/editor`, `page/editor-collab`, `page/inline-page-link`, `page/links`, `page/page-link`, `page/read-only-view`, `plugin-meta/plugin-health`, `primitives/data-view/custom-columns`, `primitives/data-view/view-order`, `primitives/optimistic-mutation`, `release`, `reports`, `reports/live-state-stale-drop`, `review`, `review/code-review`, `review/config-defaults`, `review/plugin-changes`, `shell/global-action-bar`, `shell/notifications`, `tasks`, `tasks/attempt-view`, `tasks/auto-start`, `tasks/task-dependencies`, `tasks/task-deps-tree`, `tasks/task-description`, `tasks/task-detail`, `tasks/task-draft-form`, `tasks/task-effort`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-list`, `tasks/task-preprompt`, `tasks/tasks-core`, `ui/tweakcn`
- Core:
  - Exports: Types: `PointParams`, `PointResourceDescriptor`, `Resolvable`, `ResourceDescriptor`, `ResourceOrigin`, `WindowParams`, `WindowResourceDescriptor`, `WindowSelector`; Values: `centralResourceDescriptor`, `compareTxWatermark`, `keyedResourceDescriptor`, `pointResourceDescriptor`, `resolvableSchema`, `resolved`, `resourceDescriptor`, `resourceDescriptorByKey`, `tolerantEnum`, `unresolved`, `windowResourceDescriptor`

<!-- AUTOGENERATED:END -->
