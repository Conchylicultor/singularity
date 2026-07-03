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
`insertPush` are the first adopters.

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
  - Exports: Types: `ChannelStatuses`, `CombinedResources`, `DebugSnapshot`, `DebugSub`, `GateDataOf`, `GateInput`, `LeaderInfo`, `LiveStateSocketKind`, `MatchResourceHandlers`, `MissedFrame`, `ResourceDescriptor`, `ResourceKey`, `ResourceOrigin`, `ResourceResult`, `ResourceViewProps`, `SlowResourceInfo`; Values: `centralResourceDescriptor`, `combineResources`, `ensureNotificationsClient`, `getNotificationsClient`, `hydrateEndpoint`, `hydrateQuery`, `hydrateResource`, `keyedResourceDescriptor`, `liveStateSocketKind`, `matchResource`, `NotificationsClient`, `NotificationsProvider`, `queryKeyFor`, `registerSlowResourceReporter`, `resourceDescriptor`, `resourceDescriptorByKey`, `ResourceView`, `useCombinedResources`, `useNotificationsChannelStatuses`, `useNotificationsClient`, `useNotificationsStatus`, `useResource`
- Cross-plugin:
  - Imported by: `active-data`, `active-data/attempt`, `active-data/task`, `active-data/task-link`, `apps/agent-manager/worktree-switcher`, `apps/browser/bookmarks`, `apps/browser/history`, `apps/browser/start-page`, `apps/deploy/servers`, `apps/mail/mail-core`, `apps/mail/mailbox`, `apps/mail/reading-pane`, `apps/mail/sync-status`, `apps/mail/thread-list`, `apps/pages/history`, `apps/pages/page-tree`, `apps/pages/starred`, `apps/pages/welcome/recent-pages`, `apps/prototypes/files`, `apps/prototypes/gallery`, `apps/settings/config`, `apps/sonata/library`, `apps/sonata/playback-history`, `apps/sonata/rich/key-mode`, `apps/sonata/sources/midi`, `apps/sonata/track-mixer`, `apps/sonata/transpose`, `apps/story/generation`, `apps/story/marker`, `apps/story/render`, `apps/story/shell`, `apps/studio/release`, `apps/studio/release/release-artifact`, `apps/studio/release/release-info`, `apps/studio/release/release-logs`, `apps/workflows/definitions`, `apps/workflows/engine`, `apps/workflows/executions`, `auth`, `auth/apple-signing/setup-wizard`, `auth/google/setup-wizard`, `build`, `build/build-fix`, `build/build-info`, `config_v2`, `config_v2/settings`, `config_v2/staging`, `conversations`, `conversations/agents`, `conversations/all-conversations`, `conversations/conversation-category`, `conversations/conversation-preprompt`, `conversations/conversation-progress`, `conversations/conversation-view`, `conversations/conversation-view/code`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/dependencies`, `conversations/conversation-view/dependent-count`, `conversations/conversation-view/drop-and-exit`, `conversations/conversation-view/drop-dependents`, `conversations/conversation-view/jsonl-viewer`, `conversations/conversation-view/jsonl-viewer/event-counter`, `conversations/conversation-view/jsonl-viewer/message-toc`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`, `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`, `conversations/conversation-view/notes`, `conversations/conversation-view/op-status`, `conversations/conversation-view/push-and-exit`, `conversations/conversation-view/turn-summary`, `conversations/conversations-view/data-view/history`, `conversations/conversations-view/data-view/queue`, `conversations/conversations-view/grouped`, `conversations/conversations-view/queue`, `conversations/effort-provider`, `conversations/model-provider`, `conversations/recover`, `conversations/summary`, `debug/claude-cli-calls`, `debug/live-state-health`, `debug/queue`, `debug/reports`, `debug/slow-ops`, `debug/slow-ops/pane`, `debug/zero-test`, `fields/secret/config`, `framework/web-core`, `infra/boot-snapshot`, `infra/claude-cli`, `infra/events`, `infra/health`, `infra/jobs`, `infra/query-resource`, `page/editor`, `page/inline-page-link`, `page/links`, `page/page-link`, `page/read-only-view`, `plugin-meta/plugin-health`, `primitives/data-view/custom-columns`, `primitives/optimistic-mutation`, `release`, `reports`, `review`, `review/code-review`, `review/config-defaults`, `review/plugin-changes`, `shell/global-action-bar`, `shell/notifications`, `tasks`, `tasks/attempt-view`, `tasks/auto-start`, `tasks/task-dependencies`, `tasks/task-description`, `tasks/task-detail`, `tasks/task-draft-form`, `tasks/task-effort`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-list`, `tasks/task-preprompt`, `tasks/tasks-core`, `ui/tweakcn`
- Core:
  - Exports: Types: `ResourceDescriptor`, `ResourceOrigin`; Values: `centralResourceDescriptor`, `keyedResourceDescriptor`, `resourceDescriptor`, `resourceDescriptorByKey`, `tolerantEnum`

<!-- AUTOGENERATED:END -->
