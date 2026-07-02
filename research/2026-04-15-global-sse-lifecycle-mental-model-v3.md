# Live State Redesign v3 — REST + WS Notifications + TanStack Query

## Context

v2 ([`2026-04-15-global-sse-lifecycle-mental-model-v2.md`](./2026-04-15-global-sse-lifecycle-mental-model-v2.md))
proposed replacing the SSE-based live-state stack with **REST reads + WS
notifications + TanStack Query cache.** Review surfaced a set of
correctness and design gaps that would have turned into bugs during
implementation. v3 keeps v2's shape and closes those gaps.

If you haven't read v2, read it first — this doc edits v2, it doesn't
restate it. The `Goals`, `Migration strategy`, and `Critical files`
sections from v2 carry over unchanged unless noted.

Scope remains single-user / localhost / many-agents. Multi-user sync
is out of scope; the escape hatch is still "adopt a sync engine."

## What changed from v2

1. Subscribe-before-fetch ordering, with server-sent initial value on
   sub-ack. No more "snapshot vs edge" race.
2. Resource registry is an allow-list; unknown keys rejected. No
   `authorize` hook yet (single-user scope).
3. Params typed via `loader` signature; routes derived. Three fields
   per resource, often two.
4. `notify()` coalesces per-key; last write wins.
5. Push-vs-invalidate decision rule is explicit (size + fan-out).
6. Mutations path is specified (commands + server-driven reconcile, no
   client optimistic writes in v1 of this primitive).
7. Leader-tab handover is specified.
8. Gateway WS upgrade + heartbeat are called out.
9. Verification maps every hazard H1–H7 to a concrete check.
10. Why WS (not SSE + POST) is justified.

---

## 1. Subscribe-before-fetch, server-sent initial value

**Problem in v2.** v2 didn't say whether `GET /api/resources/:key`
or `{op:"sub"}` fires first. Either order has a race: if GET returns
before sub is registered, any `notify()` between those two moments is
lost and the client holds stale state indefinitely. If sub fires first
but GET races with a concurrent update, the cache can be written with
the older value after the newer.

**v3 rule.** Subscription is authoritative. GET is a fallback.

The normal path:

1. `useResource(key)` mounts. `NotificationsClient` sends
   `{op:"sub", key, params}` over the WS.
2. Server registers the subscription, calls the resource's `loader`,
   and replies with `{kind:"sub-ack", key, value, version}`.
3. Client writes `value` to the TanStack Query cache via
   `setQueryData`. No `queryFn` HTTP call is made in this path.
4. Subsequent `notify()` broadcasts carry a monotonically increasing
   `version` per key. Client drops any message with
   `version <= cache.version`.

The GET route (`/api/resources/:key/...`) still exists for:

- The WS being down (fallback path; TanStack Query falls back to
  `queryFn`).
- Direct curl / debugging.
- SSR if we ever need it.

Both the sub-ack and the GET response carry `{value, version}` from
the same loader + version counter so the cache converges regardless of
which arrives first.

On WS reconnect: client re-sends every `sub`; server re-runs loaders
and re-acks. One line, not a per-feature concern.

## 2. Resource registry as allow-list

**Problem in v2.** `{op:"sub", key}` with a free-form tuple lets any
client subscribe to anything, including keys that don't exist or keys
that belong to other users' data once we grow past single-user.

**v3 rule.** `defineResource` registers a key at server boot. The
notifications server maintains a map `key → {loader, mode}`. Every
`sub` and every `GET /api/resources/...` resolves the incoming key
against the registry; unknown key → `{kind:"sub-error",
reason:"unknown-key"}` and `404` from the HTTP route.

No `authorize` hook in v1. Scope is single-user localhost; adding an
auth hook we never populate is noise. The day we grow past
single-user, add it then — it's a non-breaking field addition.

## 3. Typed keys + derived routes

**Problem in v2.** `ResourceKey` is a tuple, `loader` takes
`Record<string,string>`, the HTTP route is `/api/resources/:key`.
Three shapes, none reconciled. TypeScript inference from
`defineResource` to `useResource` is unspecified.

**v3 rule.** Three fields. Params typed via the `loader` signature;
no zod at the boundary.

```ts
// server
export const editedFilesResource = defineResource({
  key: "edited-files",
  mode: "invalidate",
  loader: async ({ conversationId }: { conversationId: string }) =>
    loadEditedFiles(conversationId),
});
```

`mode` defaults to `"invalidate"` so the common case is two fields
(`key`, `loader`).

This gives us:

- HTTP route `GET /api/resources/edited-files/:conversationId`, derived
  from the `loader` param names.
- Wire key on WS: `{ name: "edited-files", params: { conversationId } }`.
- Client hook `useResource(editedFilesResource, { conversationId })`
  with full inference of both param and return types from the exported
  `Resource` object.

Keys shared across server and client by exporting the `Resource`
object, not a string. Runtime payload validation (zod) is deferred
until we have untrusted clients.

## 4. Notify coalescing + versioning

**Problem in v2.** Two rapid `notify(v1)`, `notify(v2)` could deliver
out of order to a slow client; nothing enforces final state = v2.

**v3 rule.** Per key, the server holds `(latestValue, version)`.
`notify(v)` increments version and schedules a broadcast via a
microtask-batched queue. If multiple `notify()` calls land before the
flush, only the final value ships. Every broadcast carries
`version`; client drops stale versions.

For `mode:"invalidate"`, only version is sent; client invalidates the
query which triggers its own `queryFn`/loader.

## 5. Push vs invalidate — what they do and when to pick

Both modes deliver level state (full values, never deltas). They
differ in *where* the value is materialized.

**`push`** — server sends `{kind:"update", key, value, version}` over
the WS. Leader tab writes its cache and fans the value out to
follower tabs via `BroadcastChannel`. One computation on the server,
one WS payload, N tabs updated. No HTTP round-trip.

**`invalidate`** — server sends `{kind:"invalidate", key, version}`
(~20 bytes) over the WS. Leader fans *the invalidation* out via
`BroadcastChannel`. **Each tab that actually has an observer for that
key fires its own `GET /api/resources/...` independently.** Tabs
without observers do nothing; no value crosses the wire.

Why per-tab refetch (not leader-only): the leader can't know which
follower has which component mounted. Per-tab refetch also isolates
failures (one tab's network blip doesn't starve the others). The
cost — multiple tabs watching the same key each fire a GET — is
acceptable at our scale; coalescing is a later optimization, not a
correctness concern.

**Decision rule.** Use `push` when **all** hold:

- Value is < ~4KB typical (fits comfortably in one WS frame and in
  every follower tab's cache whether they care or not).
- Value is the same for every subscriber.
- Observers are almost always present when `notify()` fires (i.e.
  pushed bytes rarely go to waste).

Otherwise `invalidate`. Concretely for current plugins:

- `conversations` — small, shared, always watched when mounted → **push**.
- `tasks` — same → **push**.
- `edited-files/:id` — can be large, observer may have navigated away
  before the update arrives → **invalidate**.

Document this rule in `server/CLAUDE.md` when the primitive lands.

## 6. Mutations path

v2 didn't say how writes interact with the cache. v3 keeps writes
dumb:

- Writes go through existing `defineCommand` / HTTP routes.
- After a successful write, the server calls `resource.notify()` for
  every affected key. The WS push is the client's signal to re-render.
- **No client-side optimistic `setQueryData` in v1 of this
  primitive.** The round-trip is fast on localhost; optimistic writes
  add a reconcile layer and we explicitly want to not rebuild that.

If a specific feature later needs optimistic writes, it opts in
per-call with `useMutation`'s `onMutate`. Not a framework concern.

## 7. Leader-tab handover

**v3 rule.** `NotificationsClient` uses `navigator.locks.request("sse-
leader", { mode: "exclusive" }, …)` with an indefinite-held lock.

- On lock grant: open WS, replay subs, mark self leader, broadcast
  cache updates to follower tabs via `BroadcastChannel`.
- Followers: read cache via `BroadcastChannel` messages; do not open
  WS.
- Leader tab closes → lock releases → next waiter's callback fires →
  that tab opens the WS, replays its own subs, invalidates every
  observed key (cache may be stale during the gap).

Handover cost is bounded: one WS reconnect + one re-sub + one
invalidate of observed keys. Acceptable.

Fallback: browsers without Web Locks support (none in our target) →
every tab opens its own WS. Correct, just N× connections.

## 8. Gateway + heartbeats

The gateway at `:9000` already proxies WS for terminal and log
streams; `/ws/notifications` uses the same upgrade path. Call out two
things:

- **Heartbeat.** Send `{kind:"ping"}` server→client every 20s. Client
  responds `{kind:"pong"}`. If no pong in 40s, server drops the
  socket; client's reconnect logic handles the rest. Protects against
  half-open connections behind the gateway.
- **Idle proxy timeouts.** Our gateway doesn't impose one, but if we
  add one later, 20s heartbeat is below any sane threshold.

## 9. Verification — full H1–H7 coverage

v2 mapped H1/H2/H7. v3 maps all seven.

| Hazard | Check |
|---|---|
| H1 events-lost-in-reopen-gap | Open conversations + open a second pane mid-stream; first pane never flickers (v2 check #2). |
| H2 stale React state after reconnect | Restart server; all panes converge to truth within a tick (v2 check #3). |
| H3 refresh-watcher-keyed-on-wrong-status | N/A — `wasReconnecting` watcher is deleted. Regression test: open a pane, kill the WS, restore; the query refetches exactly once, no status-keyed logic remains (`grep -r wasReconnecting` returns empty). |
| H4 duplicate subscriptions across mounts | Mount/unmount the same pane 10×; DevTools shows exactly one `sub` + one `unsub` net per cycle (TanStack Query refcounts observers, `NotificationsClient` subs on 0→1 and unsubs on 1→0). |
| H5 snapshot/edge event ordering | Covered structurally by §1 sub-ack + versioning; **now pinned by executable tests** — `plugins/framework/plugins/resource-runtime/core/runtime-h5.test.ts` races a `notify()` against a fresh `sub` (push, keyed, multi-socket) and asserts the client simulator converges to server truth. Companion server-runtime invariants (scoped-vs-FULL routing, over-replay idempotence, L2 persist-hook contract) are in the sibling `runtime-scoped-routing.test.ts` / `runtime-catchup.test.ts`. See `research/2026-07-03-global-live-state-server-invariant-harness.md`. |
| H6 cross-tab divergence | Open 3 tabs; mutate state; all three reflect within a tick; exactly 1 WS open (v2 check #5). |
| H7 snapshot-replays-only-working-truth | Kill an agent externally; row transitions to `gone` within a tick (v2 check #4). Level-state push has no notion of "only working truth." |

Plus v2's DevTools checks (`/api/events` absent, `/ws/notifications`
present) and the TanStack Query devtools sanity check.

## 10. Why WS, not SSE + POST sub/unsub

Both solve the URL-immutability problem. WS wins because:

- One socket, one lifecycle, one reconnect policy. SSE + POST doubles
  the failure modes (POST for sub can succeed while SSE is down).
- Server→client backpressure is observable over WS; over SSE it
  isn't.
- Heartbeats are symmetric on WS.

The cost is dealing with WS framing/proxies, which the gateway
already handles for terminals.

---

## Open questions (non-blocking)

- **Persistence of `version`.** On server restart, version counters
  reset. Clients reconnect, re-sub, get sub-ack with the new value +
  version=1. Correct but means version isn't monotonic across
  restarts. Acceptable; documented so no one treats version as global.
- **Observability endpoint.** `/api/resources/_debug` listing
  registered keys + current subscriber counts. Small, cheap, worth
  shipping with the primitive.
- **Raw-SSE check replacement.** `cli/src/checks/no-raw-sse.ts`
  becomes `no-adhoc-live-state`: forbids raw `text/event-stream`
  writes *and* WS routes outside `defineResource` / the existing
  terminal & log stream allow-list.

If all checks in §9 pass and the three open questions above are
addressed during or just after the primitive lands, the live-state
surface area of the app is one primitive with one mental model.
