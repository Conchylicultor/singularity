# supervised-job

A build, a release, a deploy — work that runs for half an hour in a process of
its own — is an ordinary entry in the queue. `defineSupervisedJob` is the whole
of it: `defineJob` + a `supervised-run` kind + `ctx.waitFor`, composed once so no
consumer composes them again.

## Long work, short runs

The handler is short at both ends and empty in the middle:

```
1. claim()               lost the race? return, there is nothing to do
2. startSupervisedRun()  spawn detached, record the pid
3. observe               marker on disk already? then skip to 5
4. ctx.waitFor(runEnded) SUSPEND — the run returns, the worker slot is freed
5. on wake: re-read the marker. still running → wait again. ended → onEnded()
   (the row itself was already closed by the reconciler's `finish`)
6. non-zero exit and runAttempts > 1 → step 1 again, as a NEW run
```

`ctx.waitFor` RETURNS from the handler through the jobs plugin's suspend
sentinel: the graphile row is deleted, the slot is released, and the workflow
comes back later as a fresh dispatch. So a workflow may span an hour while every
one of its runs is milliseconds — which is why `hold` is **`instant`** and why a
consumer cannot set it. The hold table's reviewer heuristic is literally "does it
spawn? → `minutes`", and `minutes` is one of only four slots that can serve long
work; spending one for the length of a build is exactly the wedge those
reservations exist to prevent. A consumer whose `onEnded` really does exceed the
class ceiling gets a slot-hog report naming the real defect, which is the honest
outcome.

## The marker is the authority; the event is only a wake-up

`supervisedRun.ended` carries **only `(kindId, runId)`** — no exit code, no
signal, nothing to trust. That is not minimalism; it is the one rule this plugin
exists to enforce, made unspellable rather than documented:

- The event can be **lost**. If the backend dies between the shim writing the
  exit marker and the emit landing, nothing ever fires. And for a kind whose own
  CLI stamps its ledger row early (`./singularity build` does, ~100 s before its
  child exits) the `supervised-run` reconciler will not re-announce it either,
  because the row left `listUnfinished` long ago.
- The event can arrive **late, twice, or for a row already closed**. `finish` is
  called once per run per PROCESS, and a restart makes a second process.

So every wake re-reads the marker file and decides from scratch (`observeRun`):
present ⇒ ended; absent with a live pid ⇒ keep waiting; absent with a dead pid ⇒
hard kill, `exitCode: -1`, `signalCode: null`. **Never re-derive killed-ness from
`exitCode > 128`** — `kill -TERM` and a program calling `exit(143)` are the same
number, and guessing between them is what once recorded a deploy that never
exited as "Exited with code 143".

The wait is **bounded** (5 minutes) and loops, rather than `unbounded: true`.
That is the same argument `RECONCILE_MS` makes inside `supervised-run`: a bounded
re-look exists only while a run is live and covers exactly the edge nothing can
report. A lost event costs one interval, never the run.

**Observe before waiting, not after.** `startSupervisedRun` settles a run whose
marker is already on disk when the spawn returns, so the emit can fire while the
handler is still inside its spawn step, with no trigger armed to receive it. A
wait-first loop hangs until its timeout on a run that was over before it started.

### `awaitSupervisedRun` is internal, and stays that way

The observe-then-wait half is its own function, `awaitSupervisedRun(ctx, { kind,
runId, pid, name })`, which `superviseRuns` calls — so the loop above is a thin
ladder over it and the two cannot drift.

It is **not exported**, and the reason is worth keeping. It was exported briefly
for deploy, whose `update` owns three sequential runs (converge leg → release →
ship leg) under one ledger row and so cannot be a `defineSupervisedJob`. Deploy
then found a better answer that needs no copy of the close rule at all: wait for
the leg's exit marker **or** the ledger row already being closed, since `finish`
→ `closeRow` is what stamps a hard-killed run — the pid reasoning stays in the
reconciler, where it already lives. With no caller left, exporting it would offer
a subtle precondition that nothing exercises.

That precondition, in case a real caller ever appears: **`pid` must be the pid of
a child YOU started for this run.** With no marker, a pid that is not alive IS the
hard-kill outcome — the close rule, correct for a row with no process behind it —
so `pid: null` returns the `-1` sentinel immediately. Right for a run you started,
wrong for a run whose id you merely know. It takes the kind HANDLE rather than an
id (a handle can only be obtained by having defined the kind) and asserts
registration on the way in, because a wait on a kind nobody registered is a wait
nothing will ever wake.

## `dedup: "none"`, and why it is not a policy about overlap

Overlap is prevented by the **claim**: each kind keeps its own ledger with a
partial unique index `WHERE finished_at IS NULL`, and the claiming INSERT is what
wins or loses. `dedup` is set to `"none"` for an unrelated reason — to stay out
of a trap in the step log.

`worker.ts` deletes `_jobSteps` / `_jobWaits` only on the **completed** path; a
throw exits before the cleanup. A `singleton` workflow's `workflowRunId` is the
constant `${jobName}:_`, so after ONE failed run the next enqueue replays the
previous run's cached steps and its resolved wait — it would skip the spawn
entirely and never build again. `dedup: "none"` mints a fresh uuid per enqueue,
so no two runs can ever share a step log.

The handler still cleans up after itself: on the way out it calls
`abortDurableRun(ctx.workflowRunId)`, releasing a wait some iteration armed and
then skipped (the marker appeared on a replay before that wait was consulted).
Without it, a stale resume re-dispatches the handler minutes after the run is
already recorded.

### A scheduled supervised job is TWO jobs, and that is the intended shape

`defineJob`'s spec is a union in which declaring `schedule` narrows `dedup` to
`"singleton"`. A supervised job is fixed at `"none"`. So **a supervised job cannot
carry a `schedule`**, and a cron-driven kind is written as a separate two-line
`defineJob` — singleton, `hold: "instant"` — whose whole body is
`theSupervisedJob.enqueue(…)`. `backup.run.schedule` is the worked example.

Not an oversight, and do not "fix" the union: both halves are load-bearing in
opposite directions. graphile's cron path hardcodes the singleton job key
`${name}:_`, so a scheduled non-singleton inserts a fresh row every tick (the
2026-08-17 queue wedge); and a supervised singleton would reuse that same
constant as its `workflowRunId`, hitting the step-log trap above and never
spawning again after one failure.

Nothing is lost by the split. Overlap was never the tick's problem — the claim is
the lock, so a tick that fires while a run is in flight claims nothing and
returns.

## `finish` closes the row; `onEnded` does the work

The split is by **what** each arm does, not by which one runs:

- **`finish`** (in the reconciler, in every backend) — close the ledger row if it
  is still open, then emit `runEnded`. A bare terminal write and an
  announcement; nothing else. The consumer supplies the write as
  `kind.closeRow`.
- **`onEnded`** (in the job handler) — the terminal WORK: the notification, the
  convergence reconcile, any data beyond the outcome. Exactly-once, because only
  this arm has side effects.

**The close is a backstop and must not be the workflow's alone.** An earlier
draft had `finish` only announce, so the handler was the only thing that could
stamp a row. A workflow that dies — dead-lettered, or killed in the millisecond
between spawning its child and recording that it did — then left the row open
forever, and the kind's partial unique in-flight index refused every future run
of that kind, permanently, with no symptom at the call site. Closing in `finish`
costs a dead workflow its notification instead of costing the kind its future.

Closing happens **before** the announcement, so a failing emit still leaves a
closed row. Two consequences for a consumer:

- `closeRow` must be a bare, idempotent, first-writer-wins write
  (`WHERE finished_at IS NULL`). No notification, no enqueue, no reconcile: it
  runs in backends that know nothing about the workflow.
- By the time `onEnded` runs, the row is **already closed** in the ordinary case.
  Do not gate anything there on the row still being open, and read the row back
  rather than assuming who stamped it.

`onEnded` must also be **idempotent, because it is deliberately not memoized in a
step.** A step that throws is cached as a permanent failure and replays its error
forever — which would make the work most worth retrying the one piece that never
gets a second chance.

### The claim→spawn window closes itself

`claim` mints the row seeded with `process.pid` — this backend's own, alive — so
between the claim and a live child there is a window where the row exists and
nothing will ever finish it. A spawn that throws in that window (no
`./singularity` on PATH, `EAGAIN`, a DB write refusing) leaves a row the
reconciler reads as _running_ forever: no child exists to write a marker, and the
seeded pid does not die until the backend does. **That row is the kind's lock**,
so the kind then refuses every future run with no symptom at the call site.

So `spawnClaimedRun` closes the row with the hard-kill sentinel and rethrows the
original error — the job still fails loudly, the lock is released. It is here
rather than in each consumer's catch because it is the same three lines for
build, release and deploy; release carried them by hand as `failUnstartedRelease`.

**After the spawn, that same close is a worse bug than the wedge it repairs.** A
failure in the bookkeeping that follows `Bun.spawn` — the `setPid` write, the
watcher — leaves a child genuinely running, which will write its transcript and
its exit marker and be settled by the reconciler in the ordinary way. Stamping
`finished_at` there releases the in-flight lock **under a live child**, so the
next enqueue claims cleanly and spawns a second one: two `./singularity build`
runs against one checkout, two converges against one remote. That is exactly the
overlap the index exists to prevent, so doing nothing on that side is not a gap —
it is the correct action.

Which side a failure happened on is never inferred. `startSupervisedRun` reports
it as `SupervisedSpawnError.childStarted`, derived from whether the pid was
actually assigned rather than from a list of which call sites throw where, and
the guard compensates **only on positive proof that no child exists**. An
unrecognised error counts as "a child may be running": a wedged kind is loud and
a restart clears it, a duplicated build is neither.

## A non-zero exit code is DATA, not an exception

The handler claims, spawns, waits and records. A build that exits 1 means it did
all four: **that is a success of the job and a failure of the build**, and only
the second is news. So the handler records the outcome and returns normally.

Throwing would file a crash report and a dead-letter for every failed build —
which is not what a failed build is today — and would dangle graphile's row retry
as a way to "re-run" out-of-process work, which it cannot do: a retry replays the
memoized spawn step and re-derives the same outcome. The only retry that means
anything here is a **fresh child**, which is `runAttempts`.

What DOES throw is the wrapper's own failure: `onEnded` throwing, a failing claim
or spawn, a DB write that will not land. Those earn the retry budget and the
report. The failed RUN surfaces where it already does — the ledger row, the runs
UI, and the kind's own notification.

## Cancellation is ONE action here

`cancelSupervisedJob(job, runId)` signals the process group and stops.

The usual advice for a workflow blocked on `ctx.waitFor` — kill the work AND
`abortDurableRun` — **inverts for a supervised job, and following it loses
data.** The kill reaches the shim's TERM trap, which writes a `143 TERM` marker;
that marker is what the suspended handler wakes on, and waking is what runs
`onEnded`. The wait is not a leak to plug, it is how the cancellation gets
recorded. Abort it and the handler never returns: no stamp, no terminal work, and
the kind's in-flight index then refuses every future run of that kind.

Every cancellation path closes itself. A SIGTERM leaves a marker and wakes
immediately; a hard SIGKILL leaves none, and the next bounded wake sees a dead pid
and records the hard-kill outcome.

## Residuals

- **A dead workflow costs its run the side effects, not the ledger.** If the
  workflow is permanently failed — or the backend dies in the millisecond between
  the child being spawned and the spawn step committing, so a replay's `claim`
  loses to its own predecessor's row — the reconciler still closes the row
  through `closeRow`, so the kind is not wedged, but nothing runs `onEnded`: no
  notification, no convergence reconcile. The dead-letter is itself loud, so the
  loss is visible. `claim` is handed the `workflowRunId` so a consumer that wants
  to attribute such a row to its (gone) owner can record it; nothing here reads
  it back.
- **A recycled pid reads as alive.** After a reboot, a run whose pid was reused
  by an unrelated process never satisfies "dead pid, no marker", so its workflow
  waits one interval forever. `supervised-run`'s reconciler has the same
  property; the fix, if it ever matters, belongs there.
- **The close rule is written twice** — here in `observeRun`, and in
  `supervised-run`'s `settleRun`. They must agree. The intended end state is one
  exported rule in `supervised-run/core` that both call.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Out-of-process work as an ordinary job: defineSupervisedJob composes defineJob + a supervised-run kind into a handler that claims, spawns detached and SUSPENDS — so no worker slot is held while the child runs — then wakes on the supervisedRun.ended event, re-reads the child's exit marker (the authority; the event is only a wake-up) and records the outcome, surviving any number of backend restarts in between.
- Server:
  - Uses:
    - `infra/events.defineTriggerEvent`
    - `infra/jobs.abortDurableRun`
    - `infra/jobs.defineJob`
    - `infra/jobs.JobCtx`
    - `infra/jobs.JobFactory`
    - `infra/jobs/supervised-run.assertRegistered`
    - `infra/jobs/supervised-run.defineSupervisedRunKind`
    - `infra/jobs/supervised-run.isSupervisedSpawnError`
    - `infra/jobs/supervised-run.KillOutcome`
    - `infra/jobs/supervised-run.killSupervisedRun`
    - `infra/jobs/supervised-run.startSupervisedRun`
    - `infra/jobs/supervised-run.SupervisedRunKind`
    - `infra/jobs/supervised-run.SupervisedRunKindSpec`
  - DB schema: `plugins/infra/plugins/jobs/plugins/supervised-job/server/internal/tables-run-ended.ts`
  - Exports (types):
    - `DefineSupervisedJobSpec`
    - `RunEndedPayload`
    - `SupervisedJob`
    - `SupervisedJobClaimMeta`
    - `SupervisedJobEndedMeta`
    - `SupervisedJobKindSpec`
    - `SupervisedJobSpawn`
  - Exports (values):
    - `_supervisedRunEndedTriggers`
    - `cancelSupervisedJob`
    - `defineSupervisedJob`
    - `runEnded`
  - Register: `defineTriggerEvent('supervisedRun.ended')`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments`
    - `backup`
    - `build`
    - `release`

<!-- AUTOGENERATED:END -->
