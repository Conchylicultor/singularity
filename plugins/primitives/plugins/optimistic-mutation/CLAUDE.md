# optimistic-mutation

Reusable optimistic-mutation primitive layered on top of `live-state`. It gives
any `useResource`-backed surface immediate, snap-free optimistic updates that
reconcile cleanly with the authoritative WebSocket push.

## Model: overlay / replay

Pending local mutations live **outside** the TanStack cache, in React state
colocated with the consumer. The rendered value is always

```
data = pendingOps.reduce(apply, serverTruth)
```

so when a WS push overwrites the cache key, `data` simply recomputes — replaying
the still-pending ops on the fresh base. Nothing is ever lost, and no push can
clobber the prediction (because the prediction was never written into the cache).
This is why we do **not** `setQueryData` a prediction: live-state's push
overwrites the whole key, version-gated and uncorrelated with any client op, so
a cache-write prediction would race exactly like waiting for the refetch does.

## Three signals, not one

The pending list answers three different questions, and conflating them is what
pinned the sync-status cloud on "Saving…" forever:

| question | signal |
|---|---|
| Has the server acked my write? | `saving` — is any op still **unresolved**? |
| Can I stop predicting this op? | *confirmation* — drop it from the overlay |
| Does the server durably disagree? | *divergence* — a report, not a UI state |

`pendingOps` is the **replay set**: it still contains server-acked ops whose
confirming push hasn't been matched yet. It is NOT "is anything unsaved" — read
`saving` for that.

## API

```ts
const { data, serverData, pending, dispatch, pendingOps, saving, failed, retry } = useOptimisticResource({
  resource,            // ResourceDescriptor<Data, P> from live-state
  params,              // optional resource params
  apply,               // (current: Data, vars: Vars) => Data — PURE predicted next state
  mutate,              // (vars: Vars) => Promise<void> — the network call (resolves on 2xx)
  // Content-based confirmation is an all-or-nothing PAIR (omit both for coarse):
  isConfirmedBy,       // (serverData, vars) => boolean — content-based confirmation
  sameTarget,          // (a, b) => boolean — op identity; REQUIRED with isConfirmedBy (same-target cascade)
  onError,             // optional (err, vars) => void
  label,               // optional string — names the thing being saved (sync-status error state)
  describeOp,          // optional (vars) => string — bounded op summary for the divergence report
});
```

- `dispatch(vars)` mints an `opId`, appends `{opId, vars, resolved:false,
  dispatchGen, misses:0}` to the ordered pending list, and fires `mutate(vars)`.
  `dispatchGen` is the cache generation (`dataUpdateCount`) at dispatch — coarse
  confirmation compares against it. On resolve the op is marked `resolved` **and
  immediately re-checked for confirmation** (see below); on reject the op is
  **rolled back** (removed from the overlay — the cache was never touched) **and
  retained** as a failed op in `failed` (with its `vars`), and `onError` is
  called. The failure is no longer silent: it stays surfaced until retried.
- `failed` is the list of `{opId, vars}` whose `mutate` rejected. `retry(opId)`
  drops that entry from `failed` and re-runs the op by calling `dispatch(vars)`
  again (which re-adds it to the overlay and re-fires `mutate`).
- `serverData` is the raw authoritative overlay base — server truth with NO
  pending ops applied (`resource.initialData` until the first push). For
  consumers that must distinguish "the server has really absorbed this row"
  from the optimistic prediction — e.g. the page editor gates a block's
  content-doc seed (an FK-dependent write) on the block id appearing here,
  never in the overlaid `data`.
- **Forced sync-status reporting:** the hook calls `useReportSync` internally
  (`@plugins/primitives/plugins/sync-status/web`) with
  `phase = failed.length ? "error" : saving ? "syncing" : "idle"`, the `label`, a
  `retry` that re-runs **only this hook's own** failed ops, and an explicit
  `savedAt` timestamp. `savedAt` is stamped (`Date.now()` into state) **inside the
  resolve handler**, from `resolvePass`'s result, the moment no unresolved op
  remains and `failed` is empty — NOT from an effect watching a derived boolean,
  which React can coalesce away within one render (the exact hazard
  `sync-status/CLAUDE.md` documents). It drives the "Saved" cloud under the
  unified explicit-`savedAt` model. Every optimistic surface therefore lights up
  the universal `<SyncStatusIndicator/>` (Google-Keep cloud) with no indicator
  code of its own — and the indicator's Retry button re-sends exactly this hook's
  failures. Outside a `<SyncStatusProvider>` (unit tests, non-surface mounts) the
  report is a no-op.
- **Confirmation runs on TWO edges**, because the confirming push routinely
  arrives *before* the mutation's own HTTP response:
  - **The push edge** (`confirmPass`) — the QueryCache subscription on
    `queryKeyFor(key, params)`. Resolved ops are dropped: coarse by default, or
    precisely when `isConfirmedBy(serverData, vars)` returns true.
  - **The resolve edge** (`resolvePass`) — `mutate` came back 2xx: mark the op
    resolved, then confirm it *immediately* against what the cache already holds.
    Content-based re-runs `isConfirmedBy` on the current snapshot; coarse asks
    `gen > op.dispatchGen` — "has an authoritative push landed since I
    dispatched?".

  Without the resolve edge an op that resolves one millisecond *after* its
  confirming push is stranded in the overlay **forever**: `confirmPass` saw it
  unresolved and kept it, and no further push for that key is coming. This is
  structurally biased, not a coin flip — the L4 DB change-feed pushes at
  transaction commit while the HTTP response still has the handler's post-commit
  tail (re-SELECT, parse, serialize) to write. The stranded op keeps `saving`
  true (spinner never stops, `savedAt` never stamped) and stays in the replay
  fold, ready to resurrect a row another writer later deletes.

  **Only an authoritative snapshot may confirm.** Both edges are gated on one, and
  neither `resource.initialData` nor "the cache emitted an event" qualifies:
  - The QueryCache emits `"updated"` for **every** query action (`fetch`, `error`,
    `invalidate`, `setState`), all of which leave `state.data` untouched. Only the
    `success` action bumps `dataUpdateCount`, so the push edge ignores any event
    that doesn't increase it. Ungated, a bare `invalidateQueries` would
    coarse-confirm every resolved op and charge each one a divergence miss for a
    snapshot that never arrived.
  - Before the first push, `state.data` is `resource.initialData` — a placeholder
    with `dataUpdatedAt === 0` (exactly what `useResource` reads for its own
    `pending` flag). The resolve edge passes `undefined` rather than the
    placeholder, because `isConfirmedBy` would accept it: an empty base vacuously
    "reflects" a remove, and `isPatchReflected` treats an update-only upsert onto
    a missing row as absorbed. Confirming there drops the op against data the
    server never sent.

  **Coarse soundness.** `gen > dispatchGen` proves *a* push landed after dispatch,
  not that it carries our commit. In the rare bad ordering (a push generated
  pre-commit, delivered post-dispatch) the op drops early and the UI briefly
  reverts until the real push lands — which is *guaranteed*, since the write
  committed. Bounded and self-healing; never a permanent zombie. Migrating the
  coarse consumers to content-based confirmation remains available and would make
  this exact.
- **Divergence** (`DIVERGENCE_MISS_LIMIT = 3`). A resolved op that survives a
  fresh authoritative snapshot accrues a **miss**; three consecutive misses mean
  the server acked the write (2xx) yet its snapshots keep not reflecting it. That
  is not a spinner state — the op leaves the overlay and the hook `emit`s
  `optimisticDivergenceReportSink` (see below). Safe at 3 because every write to
  the key generates a push for that key, so our own commit is long visible by the
  third post-resolve push. Cascade-dropped ops are **never** reported: being
  superseded by a newer same-target write is the healthy outcome. The resolve
  edge counts no miss — no new snapshot arrived, so a non-confirmation carries no
  evidence.
- **`optimisticDivergenceReportSink`** (`web/reporter.ts`) is the sanctioned sink
  inversion, mirroring `error-boundary`'s `boundaryReportSink` → `reports.crash`:
  this primitive must not import `reports`, so `reports/plugins/optimistic-
  divergence` registers the handler at mount and files the report. The payload
  (`{ resourceKey, params, label, misses, opSummaries }`) carries no raw `vars` —
  unbounded and possibly unserializable. `opSummaries` comes from the optional
  `describeOp(vars)` arg (the page editor passes `v => v.tag === "patch" ?
  "patch" : v.op.kind`); omit it and the array is empty. `emit` never throws.
  `describeOp` itself must be pure and total — it runs on the reconcile path.
- **Cascade confirmation** (content-based mode): `sameTarget` is **required**
  alongside `isConfirmedBy` — the two are a paired, all-or-nothing arm of a
  discriminated union (`isConfirmedBy` without `sameTarget`, or vice versa, is
  unrepresentable). Precise per-op matching implies concurrent per-entity ops
  in flight — a structurally multi-target consumer — which needs the cascade to
  avoid the stuck-inverse-pair replay. So whenever an op is confirmed, every
  RESOLVED op older than it in the pending order **that writes the same
  entity/key** is dropped too, even when the snapshot doesn't match those ops. A
  snapshot reflecting a newer write to a target already contains an older
  resolved write's effect on that target (possibly overwritten), so an older
  same-target op that still doesn't match can never match any future snapshot —
  keeping it would replay stale state forever. Concretely this closes the
  stuck-inverse-pair hazard (undo dispatches "delete X", redo dispatches
  "restore X" before the push carrying the deletion arrives: every later
  snapshot shows X present, confirming the redo but never the undo — without the
  cascade the stuck undo would delete X from every rendered state from then on).
  The containment argument is only valid WITHIN one entity, so the consumer
  declares op identity via `sameTarget: (a, b) => boolean` ("do these two ops
  write the same entity?"); an older resolved op on an UNRELATED target always
  survives until its own confirming push arrives (cascade-dropping it would
  transiently revert that entity to stale server data). Unresolved ops are never
  cascade-dropped. Current `sameTarget` consumers: the page editor
  (`sameOverlayTarget` — block-id-set intersection over ops/patches) and
  config_v2 staging (`(pluginId, configName)` equality).
- `apply` must be pure. For the "this op no longer applies to the current base"
  case (e.g. the server already absorbed it and the row it referenced is gone),
  throw `OpNoLongerApplies` (exported from the barrel) — the replay drops just
  that op and keeps the rest. Any OTHER throw is treated as a reducer bug and
  propagates loudly (fail loudly — never silence), rather than vanishing into a
  self-healing push.
- Op insertion order is preserved, so fast chained ops compose deterministically.

## Where the logic lives

The **whole op lifecycle** is a pure state machine in `web/internal/overlay.ts`:
`replay`, the two edge functions `confirmPass` / `resolvePass` (both returning
`{ pending, diverged }`, sharing one `dropConfirmed` cascade helper), plus
`markResolved` / `removeOp`. Both edges return the input `pending` array **by
identity** when nothing changed, so the React shell skips the state write. It is
unit-tested directly in `overlay.test.ts` (`bun test`) — that is where new
lifecycle coverage belongs.

The hook (`web/internal/use-optimistic-resource.ts`) is a thin shell: it owns the
`pending` state (mirrored in a commit-time ref, because a functional `setState`
updater cannot yield `diverged` without becoming effectful), the cache
subscription, the `savedAt` stamp, and the sink emit. Its wiring — the
`dataUpdateCount` stamp and the push-before-resolve ordering — is pinned by the
jsdom suite in `web/__tests__/use-optimistic-resource.test.tsx`
(`bun run test:dom plugins/primitives/plugins/optimistic-mutation`).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Optimistic-mutation primitive over live-state: useOptimisticResource replays pending ops on server truth (overlay/replay), with coarse and content-based confirmation and automatic rollback on reject.
- Web:
  - Uses: `primitives/latest-ref.useLatestRef`, `primitives/live-state.queryKeyFor`, `primitives/live-state.useResource`, `primitives/sync-status.useReportSync`
  - Exports: Types: `OptimisticDivergenceReport`, `UseOptimisticResourceArgs`, `UseOptimisticResourceResult`; Values: `OpNoLongerApplies`, `optimisticDivergenceReportSink`, `useOptimisticResource`
- Cross-plugin:
  - Imported by: `config_v2/staging`, `conversations/conversations-view/data-view/queue`, `conversations/conversations-view/queue`, `page/editor`, `reports/optimistic-divergence`

<!-- AUTOGENERATED:END -->
