# optimistic-mutation

Reusable optimistic-mutation primitive layered on top of `live-state`. It gives
any `useResource`-backed surface immediate, snap-free optimistic updates that
reconcile cleanly with the authoritative WebSocket push.

## Model: overlay / replay — and never-revert

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

The governing policy
(`research/2026-07-11-global-never-revert-optimistic-edits.md`, matching
Docs/Figma/Linear/Notion local-first semantics): **pending local edits are never
visually reverted.** An op leaves the overlay only for a *causal* reason —
provably absorbed (confirmation / the same-target cascade) or provably
superseded (a snapshot causally past its commit lacks its effect). A failed
`mutate` is a sync-status state (the cloud icon), never an undo; a
non-confirming push is at worst a *report*, never an eviction. The CRDT text
lane (`page/editor`'s `live-state-yjs-provider.ts` — offline is `syncing`,
bytes buffer and retry push-based) implements the same policy for text; this
primitive is the structural lane's twin.

## Three signals, not one

The pending list answers three different questions, and conflating them is what
pinned the sync-status cloud on "Saving…" forever:

| question | signal |
|---|---|
| Has the server acked my write? | `saving` — is any op still **unresolved**? |
| Can I stop predicting this op? | *confirmation* — drop it from the overlay |
| Does the server durably disagree? | *divergence* — a report, not a UI state |

`pendingOps` is the **replay set**: it still contains server-acked ops whose
confirming push hasn't been matched yet, and failed ops awaiting a retry. It is
NOT "is anything unsaved" — read `saving` for that.

## API

```ts
const { data, serverData, pending, dispatch, pendingOps, saving, failed, retry } = useOptimisticResource({
  resource,            // ResourceDescriptor<Data, P> from live-state
  params,              // optional resource params
  apply,               // (current: Data, vars: Vars) => Data — PURE predicted next state
  mutate,              // (vars: Vars) => Promise<void | { watermark?: string }> — the network call
  // Content-based confirmation is an all-or-nothing PAIR (omit both for coarse):
  isConfirmedBy,       // (serverData, vars) => boolean — content-based confirmation
  sameTarget,          // (a, b) => boolean — op identity; REQUIRED with isConfirmedBy (same-target cascade)
  onError,             // optional (err, vars) => void
  label,               // optional string — names the thing being saved (sync-status error state)
  describeOp,          // optional (vars) => string — bounded op summary for the divergence report
});
```

- `dispatch(vars)` mints an `opId`, appends `{opId, vars, resolved:false,
  dispatchGen, misses:0, divergenceReported:false}` to the ordered pending
  list, and fires `mutate(vars)`. `dispatchGen` is the cache generation
  (`dataUpdateCount`) at dispatch — tokenless coarse confirmation compares
  against it. On resolve the op is marked `resolved`, stamped with the
  endpoint's `ackWatermark` (when returned), cleared of any prior failure, **and
  immediately re-checked for confirmation** (see below). On reject the op
  **stays in the overlay** (never-revert) with a classified `failure` — see the
  failure model below.
- **Ack watermarks (Rule A) and snapshot watermarks (Rule B).** A mutation
  endpoint may return `{ watermark }` — `pg_current_xact_id()::text` read
  *inside its write transaction* (`currentTxId(tx)` from `database/server`;
  free, the write already assigned the xid). Live-state frames that fully
  reconcile the client to server truth carry a snapshot watermark
  (`pg_snapshot_xmin(pg_current_snapshot())` captured before the loader read —
  Rule B′; scoped deltas never do), adopted into a module-level registry
  (`getResourceWatermark` from `live-state/web`) immediately before each cache
  write. Both are xid8 decimal text, compared causally via `compareTxWatermark`
  (BigInt — `live-state/core`). The one sound inference:
  `cmp(snapshotWm, ackWm) > 0` (strict) ⇒ that snapshot provably saw the op's
  commit (or its overwrite). Equal or older proves nothing — the snapshot may
  predate the commit no matter how many pushes delivered it (delivery order is
  not causality; the exact confusion behind the old miss-limit eviction that
  reverted a user's split mid-typing).
- `failed` is the list of `{opId, vars}` whose `mutate` was **durably rejected
  by the server** (an `EndpointError` — HTTP status). Network-level failures
  are deliberately NOT in it (they auto-retry — see the failure model).
  `retry(opId)` re-fires the op **in place**: same opId, same overlay position
  — the rendered prediction never moves or flickers. (It clears the failure and
  re-runs `mutate`; there is no remove + re-dispatch.)
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
  `savedAt` timestamp. A network-failed op is unresolved, so it reports as
  `syncing` (offline-is-syncing — the Yjs lane's policy), never `error`; only a
  durable HTTP rejection is an `error`. `savedAt` is stamped (`Date.now()` into
  state) **inside the resolve handler**, from `resolvePass`'s result, the moment
  no unresolved op remains ("nothing failed" is implied — a failure only ever
  sits on an unresolved op) — NOT from an effect watching a derived boolean,
  which React can coalesce away within one render (the exact hazard
  `sync-status/CLAUDE.md` documents). It drives the "Saved" cloud under the
  unified explicit-`savedAt` model. Every optimistic surface therefore lights up
  the universal `<SyncStatusIndicator/>` (Google-Keep cloud) with no indicator
  code of its own — and the indicator's Retry button re-sends exactly this hook's
  failures. Outside a `<SyncStatusProvider>` (unit tests, non-surface mounts) the
  report is a no-op.
- **Exact-ack confirmation (`ackTx`).** Feed-driven live-state frames carry
  `ackTx` — the source-transaction ids the recompute folded in — and
  `ackChannel`-opted resources additionally broadcast standalone
  `{ kind: "ack" }` frames for no-value-change recomputes. The client notes
  them into a module-level tx-ack registry (`hasResourceTxAck` /
  `subscribeResourceTxAcks` from `live-state/web`, namespaced per
  `(key, paramsKey)`, 256-entry ring). The claim is narrow and sound: a
  registry hit on an op's `ackWatermark` proves *that commit's rows were
  re-read post-commit for this tuple* — so it CONFIRMS the op exactly (feeding
  the same-target cascade in content mode, on all three edges: push, resolve,
  and the ack edge's `ackPass`) and can NEVER deny; denial stays
  snapshot-watermark-only (Rule B). This is what keeps confirmation exact once
  scoped/point deltas stop shipping snapshot watermarks: an evicted or lost ack
  degrades safely to the Rule B watermark backstop on the next full frame /
  resub. See `research/2026-07-18-global-bounded-working-set-phase2.md` Part C
  (C4 is the precise confirmation rule).
- **Confirmation runs on TWO edges**, because the confirming push routinely
  arrives *before* the mutation's own HTTP response:
  - **The push edge** (`confirmPass`) — the QueryCache subscription on
    `queryKeyFor(key, params)`. Resolved ops are dropped: content-based when
    `isConfirmedBy(serverData, vars)` accepts the snapshot; coarse-with-token
    when the snapshot watermark is strictly past the op's `ackWatermark` (exact
    causal confirmation); tokenless coarse on any post-resolve push (legacy).
    The registry watermark is read synchronously inside the cache callback — it
    was written immediately before the `setQueryData` that fired it, so it is
    the causal floor of exactly the snapshot being examined.
  - **The resolve edge** (`resolvePass`) — `mutate` came back 2xx: mark the op
    resolved, stamp its ack token, then confirm it *immediately* against what
    the cache already holds. Content-based re-runs `isConfirmedBy` on the
    current snapshot; coarse-with-token asks the registry watermark; tokenless
    coarse asks `gen > op.dispatchGen` — "has an authoritative push landed
    since I dispatched?".

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

  **Tokenless-coarse soundness.** `gen > dispatchGen` proves *a* push landed
  after dispatch, not that it carries our commit. In the rare bad ordering (a
  push generated pre-commit, delivered post-dispatch) the op drops early and
  the UI briefly reverts until the real push lands — which is *guaranteed*,
  since the write committed. Bounded and self-healing; never a permanent
  zombie. Returning `{ watermark }` from `mutate` upgrades the consumer to the
  exact causal check and removes even that window.
- **Failure model (never-revert).** A rejected `mutate` keeps the op in the
  overlay — the prediction stays rendered; `removeOp`-on-reject is gone. The
  rejection is classified once:
  - **`network`** (`fetch` rejected — no HTTP verdict: offline, gateway down,
    server restarting): nothing is known to be wrong with the op. It stays
    `syncing` (not in `failed`) and **auto-retries in place, push-based** on
    either reconnect edge — the live-state socket for this resource's origin
    reopening (`subscribeWsStatus` + `liveStateSocketKind`, mirroring the Yjs
    provider), or the browser's `online` event. No timers, no per-push retry;
    the residue (fetch fails while the WS never cycled and the browser never
    went offline) waits for the next edge or a manual `retry`, same as the Yjs
    lane.
  - **`http`** (`EndpointError` — the server answered and said no): a durable
    verdict. The op surfaces in `failed`, phase `error`, and waits for an
    explicit `retry` — reconnect edges deliberately do NOT re-fire it (the
    server would just repeat the verdict). `onError` still fires on every
    rejection.

  A failed op is **unresolved**, and unresolved ops are untouchable by
  confirmation, cascade, denial, and miss counting alike — it just keeps
  replaying, which is exactly the never-revert guarantee.
- **Divergence: denial vs report-only.** The old miss-limit eviction
  (`DIVERGENCE_MISS_LIMIT`) is gone — under push lag its "misses" were stale
  snapshots computed before the commit, and dropping the op reverted the user's
  edit (the motivating production bug). What replaced it:
  - **Causal denial** (content mode only — the ONE remaining eviction): a
    resolved, unconfirmed, non-cascaded op carrying an `ackWatermark` is
    dropped when the snapshot watermark is *strictly* past it yet
    `isConfirmedBy` still rejects the snapshot — the snapshot provably saw the
    commit, so the effect was overwritten by newer server truth. Rendering that
    is showing newer truth, not reverting. Reported via the sink with
    `kind: "superseded"`. Coarse mode never denies (it has no `isConfirmedBy`
    to attest "the snapshot lacks my effect" — a causally-later snapshot can
    only confirm); tokenless ops are never denied (no causal proof exists).
  - **The stalled report** (`DIVERGENCE_REPORT_MISSES = 3`): a resolved op that
    survives that many consecutive authoritative snapshots files ONE report
    (`kind: "stalled"`, latched via `divergenceReported`) and **stays in the
    overlay**, still confirmable by any later matching snapshot. It is the
    investigation signal for a wrong `apply`/`isConfirmedBy` pair — or plain
    push lag, which self-heals. Cascade-dropped ops are **never** reported:
    being superseded by a newer same-target write is the healthy outcome. The
    resolve edge counts no miss and never denies — no new snapshot arrived, so
    a non-confirmation carries no evidence.
- **`optimisticDivergenceReportSink`** (`web/reporter.ts`) is the sanctioned sink
  inversion, mirroring `error-boundary`'s `boundaryReportSink` → `reports.crash`:
  this primitive must not import `reports`, so `reports/plugins/optimistic-
  divergence` registers the handler at mount and files the report. The payload
  (`{ kind, resourceKey, params, label, misses, opSummaries }`) carries no raw
  `vars` — unbounded and possibly unserializable. `opSummaries` comes from the
  optional `describeOp(vars)` arg (the page editor passes `v => v.tag === "patch" ?
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
`{ pending, dropped, stalled }`, sharing one `reconcile` core), plus
`markResolved` / `markFailed` / `clearFailure`. Both edges return the input
`pending` array **by identity** when nothing changed, so the React shell skips
the state write. It is unit-tested directly in `overlay.test.ts` (`bun test`) —
that is where new lifecycle coverage belongs.

The hook (`web/internal/use-optimistic-resource.ts`) is a thin shell: it owns the
`pending` state (mirrored in a commit-time ref, because a functional `setState`
updater cannot yield the report lists without becoming effectful), the cache
subscription, the reconnect auto-retry subscription, the `savedAt` stamp, and
the sink emits. Its wiring — the `dataUpdateCount` stamp, the
push-before-resolve ordering, the keep-rendered failure model, the `online`
auto-retry, and the registry-watermark denial — is pinned by the jsdom suite in
`web/__tests__/use-optimistic-resource.test.tsx`
(`bun run test:dom plugins/primitives/plugins/optimistic-mutation`).

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Optimistic-mutation primitive over live-state: useOptimisticResource replays pending ops on server truth (overlay/replay) under the never-revert policy — causal (ack-watermark) and content-based confirmation, denial only under causal proof, and keep-rendered failures with reconnect auto-retry.
- Web:
  - Uses: `infra/endpoints.EndpointError`, `primitives/latest-ref.useLatestRef`, `primitives/live-state.getResourceWatermark`, `primitives/live-state.hasResourceTxAck`, `primitives/live-state.liveStateSocketKind`, `primitives/live-state.queryKeyFor`, `primitives/live-state.subscribeResourceTxAcks`, `primitives/live-state.useResource`, `primitives/networking.subscribeWsStatus`, `primitives/sync-status.useReportSync`
  - Exports: Types: `OptimisticDivergenceReport`, `UseOptimisticResourceArgs`, `UseOptimisticResourceResult`; Values: `OpNoLongerApplies`, `optimisticDivergenceReportSink`, `useOptimisticResource`
- Cross-plugin:
  - Imported by: `config_v2/staging`, `conversations/conversations-view/data-view/queue`, `conversations/conversations-view/queue`, `page/editor`, `reports/optimistic-divergence`

<!-- AUTOGENERATED:END -->
