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

## Per-hop tracing (`live-state` log channel)

`NotificationsClient` traces every hop of the update pipeline to the
`live-state` log channel (`logs/live-state.jsonl`) via `clientLog` — a plain
HTTP path decoupled from the notifications WS, so traces still flush when that
WS is wedged (the exact failure this instruments). Each line is stamped with
`[tabId]`. Read with `tail`/`cat` on the JSONL file.

Always-on lines are low-volume transitions and silent-drop anomalies:
`observe`/`unobserve`, `sendSub`, `sub-ack`, `replaySubs`, `resync`, net-diag
socket/election transitions, and every `drop reason=…` (`no-sub`,
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
  at both write paths: `useResource`'s `queryFn` HTTP fallback
  (`web/use-resource.ts`) and the WS push path in
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

Opting in is a ~two-line change on each side:

- **Server** (`defineResource`): `mode: "keyed"` + `keyOf: (row) => row.id`.
  The payload must be an array; `keyOf` is required for keyed mode (guarded at
  registration). The first notify per pk (and every `sub-ack` / HTTP fallback)
  still ships a full `{ value, version }` so brand-new clients get a complete
  base; subsequent notifies ship a `delta`.
- **Client**: use `keyedResourceDescriptor(key, schema, initialData, keyOf)`
  instead of `resourceDescriptor`. `schema` stays `z.array(Element)`, so `T`
  (and every `useResource` caller) is unchanged — callers still get `T[]`. The
  client `keyOf` keys prior cache rows when merging a delta; per-row parsing
  goes through the array schema's `.element`. A delta that arrives with no
  cached base is dropped and a fresh full sub is forced (load-bearing guard).

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

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Server live-state primitive: useResource hook + NotificationsProvider + NotificationsClient. Thin TanStack Query wrapper over the app's leader-elected /ws/notifications channel.
- Load-bearing: yes
- Web:
  - Uses: `primitives/log-channels.clientLog`, `primitives/networking.NetDiagEvent`, `primitives/networking.SharedWebSocket`, `primitives/networking.subscribeNetDiag`, `primitives/networking.subscribeWsStatus`, `primitives/networking.WsStatus`, `primitives/tab-id.getTabId`
  - Exports: Types: `ChannelStatuses`, `DebugSnapshot`, `DebugSub`, `LeaderInfo`, `ResourceDescriptor`, `ResourceKey`, `ResourceOrigin`, `ResourceResult`, `ResyncSub`; Values: `centralResourceDescriptor`, `getNotificationsClient`, `hydrateResource`, `keyedResourceDescriptor`, `NotificationsClient`, `NotificationsProvider`, `queryKeyFor`, `resourceDescriptor`, `useNotificationsChannelStatuses`, `useNotificationsClient`, `useNotificationsStatus`, `useResource`
- Cross-plugin:
  - Imported by: `active-data`, `active-data/attempt`, `active-data/task`, `active-data/task-link`, `agents`, `apps/deploy/servers`, `apps/pages/page-tree`, `apps/sonata/library`, `apps/sonata/playback-history`, `apps/sonata/sources/midi`, `apps/sonata/track-mixer`, `apps/story/marker`, `apps/story/render`, `apps/story/shell`, `apps/workflows/engine`, `attempt-view`, `auth`, `auth/google/setup-wizard`, `build`, `build/build-fix`, `build/build-info`, `collections`, `config_v2`, `config_v2/settings`, `conversations`, `conversations-recover`, `conversations/conversation-category`, `conversations/conversation-preprompt`, `conversations/conversation-progress`, `conversations/conversation-view`, `conversations/conversation-view/code`, `conversations/conversation-view/code/docs-button`, `conversations/conversation-view/commits-graph`, `conversations/conversation-view/dependencies`, `conversations/conversation-view/dependent-count`, `conversations/conversation-view/drop-and-exit`, `conversations/conversation-view/drop-dependents`, `conversations/conversation-view/jsonl-viewer`, `conversations/conversation-view/jsonl-viewer/event-counter`, `conversations/conversation-view/jsonl-viewer/message-toc`, `conversations/conversation-view/jsonl-viewer/tool-call/add-task`, `conversations/conversation-view/jsonl-viewer/tool-call/agent`, `conversations/conversation-view/jsonl-viewer/tool-call/ask-user-question`, `conversations/conversation-view/jsonl-viewer/tool-call/task-tools`, `conversations/conversation-view/jsonl-viewer/tool-call/workflow`, `conversations/conversation-view/notes`, `conversations/conversation-view/op-status`, `conversations/conversation-view/push-and-exit`, `conversations/conversation-view/side-task`, `conversations/conversation-view/tasks-panel`, `conversations/conversation-view/turn-summary`, `conversations/conversations-view/grouped`, `conversations/conversations-view/queue`, `conversations/model-provider`, `conversations/summary`, `crashes`, `debug/claude-cli-calls`, `debug/crashes`, `debug/live-state-health`, `debug/queue`, `fields/secret/config`, `floating-bar`, `framework/web-core`, `health`, `infra/claude-cli`, `infra/events`, `infra/jobs`, `notifications`, `page/editor`, `page/inline-page-link`, `page/links`, `page/page-link`, `plugin-meta/plugin-health`, `review`, `review/code-review`, `tasks`, `tasks-core`, `tasks/auto-start`, `tasks/task-dependencies`, `tasks/task-description`, `tasks/task-detail`, `tasks/task-draft-form`, `tasks/task-events`, `tasks/task-graph`, `tasks/task-list`, `tasks/task-list/recent`, `tasks/task-list/tree`, `tasks/task-preprompt`, `ui/theme-engine`, `worktree-switcher`
- Core:
  - Exports: Types: `ResourceDescriptor`, `ResourceOrigin`; Values: `centralResourceDescriptor`, `keyedResourceDescriptor`, `resourceDescriptor`, `tolerantEnum`

<!-- AUTOGENERATED:END -->
