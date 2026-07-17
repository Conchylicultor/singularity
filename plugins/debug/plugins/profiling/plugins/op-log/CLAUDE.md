# op-log

The **one** durable record for every op that competes for a host resource —
`build`, `push`, `check`. One record type, one writer, one reader, one orphan
reconciler.

See [`research/2026-07-17-global-op-log-unified-wait-profiling.md`](../../../../../../research/2026-07-17-global-op-log-unified-wait-profiling.md).

## Why it exists

Three ops each hand-rolled their own lifecycle logging (and `check` had none at
all — a standalone `./singularity check` takes a host CPU grant, making every
other agent's build queue, while appearing nowhere). The duplication had already
drifted: `PushContentionRecord` existed in **three** independent copies, one of
which had silently lost `opSlug` and the in-flight synth. Adding `check` as a
fourth parallel mechanism would have meant a third orphan reconciler and a fourth
record type. The abstraction was missing.

## `waits` is a list, and that is the whole point

An op genuinely blocks on several distinct resources **in sequence** — a build
waits on the build lock, then the duress valve, then the host CPU grant, and can
re-do the last two N times across requeue cycles. A scalar `waitMs` is what made
a build stall unattributable: a build that queued 5 min and worked 1 min rendered
identically to one that worked 6.

`OpWait.startMs` is relative to the op's `requestedAt`, **not** to the previous
wait: waits are interleaved with real work (a build does migrations and codegen
between releasing the build lock and queueing for the grant), so segments are
painted at their true offsets inside the op's span, never packed head-to-tail.

`waitMs` survives as a **derived** read-model field (`sum(waits)`) so the stats
panes keep working.

## The three phases, and why `requested` is re-stamped

| phase | written when | carries |
|---|---|---|
| `requested` | before the first wait, **and again on every wait open/close** | full identity, `requestedAt`, closed `waits`, `openWait` |
| `granted` | the op stops queuing for its ENTRY ticket and starts its own work | `opId`, `grantedAt`, `waits[]` so far |
| `completed` | terminal | everything + the **accumulated** `waits[]` + `outcome` + `steps` |

Fold at read time per `opId`: **terminal wins**; `requested` only → synthetic
`outcome: "waiting"`; `requested + granted` → `"running"` with a growing
`holdMs`. In **both** in-flight cases the wait list is the closed waits plus any
`openWait`, clocked against the reader's `now` — which is what makes bars grow on
refresh, with no polling added.

### `granted` does not mean "will never block again"

`markGranted()` means *the op stopped queuing for its entry ticket and began
doing its own work*. It does **not** mean the op is done waiting — and for two of
the three kinds the most diagnostically important wait is **post-`granted`**:

| kind | grants at | waits AFTER `granted` |
|---|---|---|
| `push` | the push mutex | its nested rebased-checks subprocess queues for an interactive `host-grant` |
| `build` | the build lock | minutes of migrations/codegen, **then** `duress-valve` + `host-grant`, possibly over several requeue cycles |
| `check` | the host grant | none |

So the wait list keeps growing after `granted`, exactly as before it. Freezing it
there is what made a build parked 5 minutes in `host-grant` render as a
motionless "running" bar — the precise failure this record exists to kill.

The outcome stays `"running"` while parked in a post-grant wait; it does **not**
flip back to `"waiting"`. The op *has* been admitted, the Gantt maps both states
to the same pulse treatment, so the flip would buy nothing and would lie.

Both in-flight branches share one `liveWaitsOf` helper. That sharing is
load-bearing: the two branches having their own copies is exactly how the
post-`granted` waits came to be dropped in the first place.

**Wait lists only ever append**, so where a `requested` re-stamp and the
`granted` snapshot disagree, the longer list is by construction the newer one.
(`requested.waits ?? granted.waits` will not do: a `requested` that never
re-stamped carries `waits: []` — present and empty — which would clobber a
populated `granted` list and silently drop the wait.)

`requested` is re-stamped rather than written once because the reader can only
attribute an in-flight op's wait from what is already **on disk**. Written once,
it could only ever name the first resource an op declared — which for a build
(build-lock, then minutes of duress-valve and host-grant) is the wrong one
exactly when it matters. Re-stamping is append-only and costs ≤ 2 lines per wait.

`foldOpRecords(raw, now)` takes `now` as a **parameter**; it never reads the
clock. That is what makes the live synthesis testable (`core/fold.test.ts`).

## `opSlug` is the liveness key, not `worktree`

`opSlug` is `basename(worktree root)` — the op-marker slug `isWorktreeOpActive()`
reads. It is **not** `worktree` (which comes from `SINGULARITY_WORKTREE`); the
two can differ. `finalizeOrphanedOps` probes `opSlug`; a null slug is inactive.

## Vocabulary is borrowed, not invented

`OpKind = "build" | "push" | "check"` is deliberately identical to `WorktreeOp`
(`infra/worktree/server`, `worktree-op.ts:26`), which already models exactly this.
Those markers are ephemeral by design (one file per op, overwritten, no history)
so they cannot *be* the durable store — but the durable store speaks their
vocabulary rather than inventing a second one.

## Storage and the legacy cutover

`~/.singularity/op-log.jsonl`, append-only. Append (never rewrite) is load-bearing
even in the reconciler: concurrent CLI processes are writing the same file.

`push-contention.jsonl` (~5.3k lines) and `build-log.jsonl` (~10.5k lines, whose
oldest records carry **no `phase` field at all**) are **not migrated**. `core`'s
read-only adapters map them into `OpRecord` so history renders unchanged:

- legacy push → `waits: [{ kind: "push-mutex", startMs: 0, durationMs: waitMs }]`.
  Its nested host-grant wait was never recorded and is unrecoverable — that blind
  spot is what the new log closes going forward.
- legacy build → `waits: []`, `holdMs = totalMs`. The old `startedAt` was stamped
  *before* `acquireBuildLock`, so `totalMs` already swallowed every wait; there is
  nothing to split.

Nothing here ever writes to the old files — their own reconcilers still own that.
Each adapter is deletable as one unit once history ages past the pane's window.

A malformed final line is tolerated (a torn partial append), and **only** that:
a `SyntaxError` is skipped, anything else rethrows.

## Plugin reference

- Description: Unified op log for every host-contending op (build / push / check): one record, one writer, one reader, one orphan reconciler.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Unified op log: the one durable record for every host-contending op (build / push / check), its per-resource wait list, the writer, the merged reader (incl. read-only legacy adapters), and the single orphan reconciler.
- Server:
  - Uses: `infra/paths.SINGULARITY_DIR`
  - Exports: Types: `OpProfiler`, `OpProfilerOptions`; Values: `createOpProfiler`, `finalizeOrphanedOps`, `LEGACY_BUILD_FILE`, `LEGACY_PUSH_FILE`, `OP_LOG_FILE`, `readOpRecords`
- Cross-plugin:
  - Imported by: `debug/profiling/push`, `stats/pushes`
- Core:
  - Exports: Types: `OpenWait`, `OpGroup`, `OpKind`, `OpOutcome`, `OpRecord`, `OpStep`, `OpWait`, `OutcomeByKind`, `RawLegacyBuildRecord`, `RawLegacyPushRecord`, `RawOpRecord`, `TerminalOutcome`, `WaitKind`; Values: `foldLegacyBuildRecords`, `foldLegacyPushRecords`, `foldOpRecords`, `groupByOpId`, `orphanedOps`, `sumWaits`

<!-- AUTOGENERATED:END -->
