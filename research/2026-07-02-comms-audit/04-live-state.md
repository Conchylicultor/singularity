# 04 — Live-State: The Server-Push Pipeline (L1–L4)

> Part of the [communications audit](./00-overview.md). This is the core of
> the system: how server truth stays live in the browser. It has the most
> layers because it has absorbed the most performance/correctness work — each
> layer exists to kill a specific bug class or cost, listed explicitly below.

## 1. The model in plain terms

A **resource** is a named server-side computation ("the task list", "the
events of conversation X") with a zod schema. Clients *subscribe* to it; the
server *recomputes and pushes* when the underlying data changes. Three
choices define the whole design:

1. **Level state, not deltas-of-events.** The client always ends up holding
   the current value. Reconnect = resubscribe = correct, with no event-replay
   bookkeeping. (Keyed resources ship row-level diffs as an *optimization*,
   but a diff that can't be applied safely just forces a fresh resubscribe.)
2. **Server executes the queries.** The browser holds a cache, not a
   database. (The Zero pilot explores moving reads client-side; see
   [07-side-channels](./07-side-channels.md) §7.)
3. **The DB decides when to recompute.** Mutation code doesn't signal
   anything; the change-feed does ([02-database-layer](./02-database-layer.md) §5).

## 2. Declaring a resource

**Client half** — a `ResourceDescriptor` in the plugin's `core/`:

```ts
// plugins/tasks/plugins/tasks-core/core/resources.ts
export const tasksResource = keyedResourceDescriptor(
  "tasks", z.array(TaskSchema), [], (row) => (row as Task).id);
export const taskDetailResource = resourceDescriptor(
  "task-detail", TaskDetailSchema.nullable(), null);
```

Descriptors self-register into a module-level key→descriptor map at import
time (this is what lets boot-snapshot hydrate by key before any component
mounts). `centralResourceDescriptor` tags central-runtime resources.

**Server half** — `defineResource` with the descriptor as the contract:

```ts
// plugins/tasks/plugins/tasks-core/server/internal/resources.ts
export const tasksResourceServer = defineResource(tasksResource, {
  loader: async (_p, ctx) => loadTasks(ctx?.affectedIds), // may return partial when scoped
  identityTable: "tasks",          // scoped change routing (ScopePolicy — mandatory for keyed)
  dependsOn: [{
    resource: attemptsResourceServer,
    affectedMap: (attemptIds) => taskIdsOwning(attemptIds),   // translate ids across the edge
    signature: (ids) => relevantFieldsFingerprint(ids),       // suppress irrelevant cascades
  }],
  debounceMs: 250,
});
```

The two-arg form reads `key`/`schema`/keyed-ness off the descriptor, so
server and client **cannot** disagree (a keyed server + a client missing
`keyOf` used to be a guaranteed runtime crash with no compile signal — now
unrepresentable). Keyed resources must declare a `ScopePolicy`: either
`identityTable` or an explicit `recompute: { kind: "full", reason }` opt-out.

**Three modes** (`push` / `invalidate` / `keyed`) — the decision rule
(documented in server-core's CLAUDE.md, derived in the v3 research doc):

| Mode | Wire behavior | Use when |
|---|---|---|
| `push` | Full value inline in the WS frame | < ~4KB, same for all subscribers, almost always observed |
| `invalidate` | Version stamp only; each tab GETs | Large or rarely-observed values |
| `keyed` | Row upserts/deletes (+ optional order) | Lists where one row changes at a time — the workhorse mode |

**External sources**: `defineExternalResource` is for non-DB truth (files,
git, in-memory) and is the *only* form with a callable `.notify()`. DB-backed
resources have no notify method — the change-feed is their only trigger
(enforced by type + a static check). External resources can also supply
`revalidate` (a cheap ETag — e.g. one `lstat` of a transcript file vs a full
read+parse) and `onFirstSubscribe`/`onLastUnsubscribe` lifecycle (start/stop
a file watcher only while someone is looking).

## 3. The wire protocol (`/ws/notifications`, `/ws/central-notifications`)

Client → server: `{op:"sub", id, key, params, etag?}`, `{op:"unsub", key, params}`.
Server → client:

```
{kind:"sub-ack",   key, params, value, version, etag?}   // authoritative initial value
{kind:"update",    key, params, value, version}           // push mode
{kind:"delta",     key, params, upserts:[[id,row]...], deletes:[id...], order?, version}  // keyed
{kind:"invalidate",key, params, version}                  // invalidate mode
{kind:"up-to-date",key, params, version}                  // WS analogue of HTTP 304 (etag hit)
{kind:"sub-error", key, reason}                           // unknown key, schema failure
{kind:"ping"}                                             // 20s heartbeat
```

Correctness rules baked into the protocol (each closed a real race):

- **Subscribe-before-fetch**: the sub-ack carries the initial value, so
  there's no GET-vs-notify ordering race. The HTTP route
  (`GET /api/resources/:key`) is a *fallback* (WS down, curl, invalidate-mode
  refetch), sharing the same `{value, version}` shape and version counter.
- **Versions are per-(key,params), monotonic per process**; the client drops
  `<=` frames (strict `<` on the HTTP path, because a GET reports a version
  without bumping it).
- **Registry as allow-list**: unknown keys are rejected, never lazily created.
- **ETags**: a resubscribing client sends its last etag; the server can
  answer `up-to-date` instead of recomputing + resending — this is what makes
  reconnect herds cheap (the "conditional revalidation herd cure").

## 4. The client (`primitives/live-state` + `primitives/networking`)

### One socket per origin: leader election

`NotificationsClient` is a module-level singleton wrapping two
`SocketChannel`s (worktree + central), each on a `SharedWebSocket`:

- `CrossTabElection` uses `navigator.locks` (exclusive, held forever) to pick
  one leader tab per origin; BroadcastChannel carries leader heartbeats (4s),
  follower `send` relays, and every inbound frame fanned out to followers.
  A follower steals the lock if heartbeats go stale 12s.
- **Every tab runs the same dispatch code on every frame** — so the first
  gate in `handleServerMessage` drops frames for (key, params) this tab never
  subscribed (`no-sub`): the leader relays *all* traffic, including other
  tabs' subscriptions.
- Reconnect replays all subs **staggered** (~6/150ms) to avoid a
  backend-restart herd; the wedge watchdog can force a synchronous full
  resync and detect genuinely missed updates via ack-version vs
  live-frame-sequence bookkeeping.

### `useResource` — the consumer API

```ts
const result = useResource(tasksResource);            // ResourceResult<Task[]>
if (result.pending) return <Loading/>;
return <List rows={result.data}/>;                     // .data doesn't exist while pending
```

- Built on one shared TanStack `QueryClient` with `staleTime: Infinity` — the
  WS is the source of truth; TanStack is *just the cache* (plus the fallback
  queryFn). The discriminated `pending | data` union is lint-enforced
  (no `pending ? [] : data` collapse).
- **Refcounted subscriptions with 30s keep-alive teardown**: unmount doesn't
  unsub immediately, so virtualized-list mount churn causes zero WS traffic.
- **`select` slices**: a component can subscribe to a derived slice of a list
  and re-render only when the slice changes — added after ~175 toolbar
  components observing the global conversations list produced O(C²) render
  storms. `gate: true` variant for readiness gates.
- **Cold-start priming**: if a resource mounts before the socket has ever
  opened (cold deep link), an HTTP prime races the socket in parallel,
  reconciled by the shared version guard (~2.5s faster settle).

### Keyed delta merge (client side)

`mergeKeyedDelta` applies upserts/deletes; `order` present → rebuild the
array from the authoritative id list (with drift detection → forced resub
rather than holes); `order` absent → in-place row swap **preserving object
identity of unchanged rows** so memoized row components skip re-render. A
delta with no cached base forces a fresh resub — deltas are an optimization,
never a correctness dependency.

## 5. The server engine (`framework/plugins/resource-runtime`)

One ~2300-line parameterized runtime (`createResourceRuntime`) instantiated
twice — by server-core (per-worktree, all hooks injected: profiler, L2
persistence, change-feed resolver) and central-core (bare). The ~42
`defineResource` call sites only ever see the facades.

### The `dependsOn` DAG and the flush cycle

Resources form a DAG. A change to an upstream resource cascades downstream,
with two per-edge refinements:

- **`affectedMap(upstreamIds) → myIds`**: translates *which rows* changed
  across the edge (usually one small SQL lookup), so downstream recomputes
  scoped, not FULL. Example chain: a conversation status flip cascades
  conversations → attempts → tasks, each hop translating ids — never a
  full-table recompute.
- **`signature(upstreamIds) → fingerprint`**: a relevance gate — if the
  changed fields don't affect this downstream (e.g. only `updatedAt` moved),
  the cascade stops dead. No-op suppression measured end to end: an empty
  scoped set doesn't bump versions, doesn't push, doesn't cascade.

The flush cycle groups entries by DAG depth, runs each level in parallel with
a barrier between levels (upstream settles before downstream drains), under a
single-flight mutex (a notify mid-flush is folded into the running flush).
`debounceMs` per resource collapses bursts (e.g. `refHeadResource` at 300ms
absorbs a rebase's ref churn) with a ceiling so continuous churn still
flushes.

### `applyDbChange` — where the change-feed meets resources

The change-feed hands over `{table, op, ids, origin}`. The runtime inverts an
in-memory `table → resources` index built from **L3 read-set capture**: the
DB pool chokepoint records, at runtime, which tables every loader actually
reads (via the profiler's ambient loader context). So dependency tracking for
the common case is *automatic and truthful* — no hand-maintained lists.

Scope decision per resource: an UPDATE with ids arriving via a **covered
origin** (the resource's `identityTable`, or reachable through `affectedMap`
edges — computed as a transitive closure so each change is delivered through
exactly one path) → scoped recompute (`ctx.affectedIds`); anything else
(INSERT/DELETE, over-cap payloads, uncovered tables) → FULL. FULL is the
always-correct fallback; scoping is the earned optimization.

**Self-verification**: per-key counters compare hand-`notify()` calls vs feed
intents; a hand notify with no matching feed intent within 2s logs a
"read-set-gap candidate". The `/api/resources/_debug` endpoint (and the
Debug → Read-set pane) dumps subscriptions, versions, DAG edges, read-sets,
covered origins, and loader stats — the observability layer that made the
L4 migration safe.

### Keyed diffing (L1) — server side

Per (resource, params) the runtime keeps a `Map<id, hash>` snapshot of the
last sent value (evicted when the last subscriber leaves). On recompute it
diffs: full recompute → `diffKeyedFull` (upserts + deletes + `order` only
when the sequence actually changed); scoped recompute → `diffKeyedScoped`
(merges only the affected rows into a copy of the previous value — never
asserts membership, so deletes/order never ride a scoped path).

## 6. The layer stack, summarized by "what bug/cost does it kill"

| Layer | Mechanism | Kills |
|---|---|---|
| L4 change-feed | statement triggers + NOTIFY + durable changelog | "forgot to call notify()" — the whole missed-invalidation class, incl. out-of-process writes |
| L3 read-set capture | pool-chokepoint table recording per loader | stale hand-maintained `dependsOn` lists; silent coverage gaps become visible |
| L2 snapshot + watermark + catch-up | persisted value/read-set/xmin per boot-critical resource | cold-boot loader stampede; snapshot-vs-live gap (bounded replay, never under-replays) |
| L1 keyed delta sync | per-subscriber id→hash snapshots, row diffs | O(list) bytes + O(list) re-render per row change |
| dependsOn + affectedMap + signature | scoped, gated DAG cascade | cascade amplification (one write recomputing the world) |
| ETag / up-to-date | conditional resubscribe | reconnect/restart herd recomputes |
| debounce + flush mutex | burst collapse | churny sources (git refs, pollers) hammering loaders |
| keep-alive subs + select slices | client-side refcount grace + slice subscriptions | mount-churn WS traffic; wide-list render storms |

## 7. Writes: mutations and optimism

Baseline write path is deliberately dumb: **endpoint mutation → DB write →
change-feed → push**. On localhost the round-trip is fast enough that most
surfaces need nothing else — no client prediction layer to reconcile.

Where instant feel matters, `primitives/optimistic-mutation` adds an
**overlay/replay** model that never touches the cache:

```ts
const { data, dispatch, failed, retry } = useOptimisticResource({
  resource: queueResource, apply: (cur, vars) => applyLocally(cur, vars),
  mutate: (vars) => fetchEndpoint(reorderQueue, {}, { body: vars }),
});
// data = pendingOps.reduce(apply, serverTruth)  — recomputed on every push
```

Pending ops live in React state and are replayed on top of whatever server
truth arrives, so a WS push can never clobber a prediction. Confirmation is
push-driven (QueryCache subscription; coarse "a push after my op resolved" or
a precise content predicate); rejection = drop the op (rollback is free — the
cache was never written) + keep it in a `failed` list with `retry()`. The
hook auto-reports to the universal sync-status cloud indicator. Consumers:
config staging, conversation queue (two variants), page editor.

## 8. Real consumer examples

- **tasks-core** (the richest): five keyed boot-critical resources
  (conversations ×3, attempts, tasks) + push/invalidate ones; the full
  conv→attempt→task `affectedMap`+`signature` cascade; an explicit
  documented FULL opt-out for a `LIMIT 30` window resource whose membership
  can't be diffed. Consumed by dozens of plugins via plain `useResource`.
- **jsonl-events** (external): transcript file watcher →
  `onFirstSubscribe` starts the watch, `notify({id})` per append, `lstat`
  ETag revalidation, `onLastUnsubscribe` tears down. Push mode — the whole
  conversation transcript UI is "just a resource".
- **frontendHashResource** (external, push): the build-id staleness signal.
- **refHeadResource** (external, push, 300ms debounce): git head movement.
- **authStateResource** (central): OAuth connection state, pushed to every
  worktree's tabs over `/ws/central-notifications`.
