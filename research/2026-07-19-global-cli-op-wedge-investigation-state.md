# CLI ops (build / check) wedge and never exit — investigation state

> **SUPERSEDED IN PART — read
> [`2026-07-20-global-cli-op-wedge-capture-watchdog.md`](./2026-07-20-global-cli-op-wedge-capture-watchdog.md)
> FIRST.** Three corrections to this document, each backed by evidence:
>
> 1. **The process is NOT spinning.** Three preserved `sample` captures of real
>    occurrences (`/tmp/spin-sample.txt` is pid 63550 = occurrence B) show *every*
>    thread parked in a blocking syscall, with no CPU burn anywhere. The
>    "Process signature" section below reads `kevent64` as "the event loop is
>    alive and turning" — that is backwards; `kevent64` **is** the blocking wait.
>    This is an **idle hang**, not a spin. Do not look for a busy loop.
> 2. **The instrumentation section below is stale.** The check progress log is
>    **committed** as `9e337217f` and is in `main` — not "kept, uncommitted", and
>    not undeployed.
> 3. **Two more hypotheses are dead**, plus a fourth occurrence was found. See
>    the newer doc.
>
> The bare "root cause NOT found" verdict below still stands.

**Status: root cause NOT found.** This document records what is proven, what is
disproven, and where the strongest lead points, so the next session does not
re-walk two dead ends.

## Symptom

A `bun plugins/framework/plugins/cli/bin/index.ts {build,check}` process spins at
~95–100% CPU (state `R`), makes no progress, and never exits. It keeps the host
CPU slots it acquired (`~/.singularity/cpu-slots/slot-N.lock`), and if it is a
`push` — or a check spawned by one — it also keeps the global push mutex, which
serialises every build and push on the machine behind it.

Process signature, consistent across occurrences:
- ~95–100% CPU, main thread, state `R`
- physical footprint ~0.8–1.4 GB (NOTE: `ps` RSS reports ~40 MB and is
  **misleading** — it undercounts Bun's mmap'd memory. Use `sample`'s
  "Physical footprint")
- `sample` shows the main thread dominated by the `kevent64` branch: the event
  loop is **alive and turning**, not blocked in one synchronous call
- no child processes (occurrence B) or only an idle one (occurrence C)

## Occurrences — all within ~48h

| | when | what | evidence |
|---|---|---|---|
| **A** | 2026-07-18 03:04–10:55 UTC (~8h) | push-nested `check --scope tree`; held push mutex | two victim pushes recorded `push-mutex` waits of `29344041 ms` (8.15h) and `29749448 ms` (8.26h) in `op-log.jsonl` |
| **B** | 2026-07-18 ~15:52–16:15 UTC | push-nested `check --scope tree` (PID 63550), killed manually | `check-progress.jsonl` run `3c77eca2`: 71 checks done by 17:57:45, `orphaned-db-tables` sole `pending` entry for 18.1 min |
| **C** | 2026-07-18 18:20 → 2026-07-19 ~11:50+ (17.5h) | `build` in worktree `att-1784390103-9cli` (PID 21084), held 8/11 cpu-slots | still spinning at inspection time |

No occurrence is known before 2026-07-17. This matters: `op-log.jsonl` only
begins 2026-07-17T12:28 and `check-progress.jsonl` only exists from 2026-07-18,
so **absence of earlier evidence is not evidence of absence** — but the user
reports the first observed instance was within the last 48h, which points at a
recent regression rather than a latent flaw.

## The strongest lead: it wedges AFTER finishing its work

Occurrence C is the most informative, because its build log ends with:

```
BUILD OK — deployed
  http://att-1784390103-9cli.localhost:9000
  checks ✓   web artifacts ✓
```

The build **completed successfully**, printed its success banner, and then never
exited — spinning for 17.5 hours afterwards. Corroborating:

- `~/.singularity/worktrees/att-1784390103-9cli/ops/build.json` is still
  `{"phase":"running"}` — never finalised.
- Its `op-log.jsonl` records stop at `phase: "requested"` — no `completed`.
- Nothing in the worktree has been touched since the process started.

**So the bug is most likely in post-work teardown / process exit, not in the work
itself.** Something keeps the event loop alive *and busy* after the job is done.
Note an `esbuild` service child was still alive (sleeping, 0% CPU) at 17h47m —
a long-lived child whose handle was never disposed is a candidate for keeping the
loop alive, though it does not by itself explain the *spinning*.

This also reframes occurrence B: a check run that finishes its work and fails to
exit would look exactly like a hung check to every existing observer.

## Disproven — do not re-investigate

1. **Not deterministic.** Killing and retrying usually lets the op land. Earlier
   reasoning that the identical last-8-completed-checks tail proved determinism
   was wrong: under `Promise.all` that tail is just fast-checks-first ordering
   and looks the same in successful runs.
2. **Not catastrophic regex backtracking.** Every regex in the candidate checks
   was audited; `grepCode` applies patterns per-line, not whole-file.
3. **Not a semaphore deadlock.** `createSemaphore` waiters park on a promise at
   0% CPU; the observed process burns a full core.
4. **Not a worker stream EOF-spin.** `runWorker`'s `new Response(proc.stdout).text()`
   awaits correctly.
5. **NOT `orphaned-db-tables` / an unbounded `pg` wait.** This was the previous
   session's stated root cause and it is **wrong**. Occurrence C held **zero**
   Postgres connections and no DB backends existed for its worktree.
   `orphaned-db-tables` appeared as the sole outstanding check in occurrence B
   because it is the slowest check in the set (a DB round-trip), so it is the one
   most likely still in flight when the wedge begins — a victim, not the cause.
   The `pg` timeout work built on that diagnosis has been **reverted**.
6. **The matching `sample` stacks between B and C are weak evidence.** All 12
   frames are Bun runtime event-loop frames, which are identical for *any*
   spinning Bun process. Consistent with one shared bug; proof of nothing.

## Rejected approach: fail-open timeouts

Bounding the DB waits so a frozen check "gives up" was implemented and reverted.
It returned `ok: true` on timeout, which would have made the check **silently
pass while the real wedge continued** — converting a loud freeze into an
invisible wrong answer. Checks must never freeze, but the cure must not hide the
fault.

If any environmental bound is added later, its outcome must be
`{ ok: false, inconclusive: true, … }`. The runner already supports this
(`runner.ts`, `⚠ … inconclusive` branch): not a pass, not a hard failure, never
cached, and visible. No check currently uses it.

## Recent commits in the shared build+check op path (all < 48h)

Prime bisect candidates, newest first:

- `224ace3de` perf(type-check): host-global warm-base pool for .tsbuildinfo
- `b5538a83d` chore(rebase): reconcile durable-sink refactor onto main's op-log
- `423afa587` fix(build): stamp orphaned build_runs with the real terminal instant
- `50027f334` feat(checks): input-keyed check-cache invalidation (stages 0-3)
- `5fa92b82d` feat(op-log): injectable sink on createOpProfiler
- `51db34fc9` feat(profiling): unified op-log (landed Jul 17 23:55 — ~5h before occurrence A)

`423afa587` deserves first look: it is specifically about builds whose terminal
state is never stamped, which is exactly the artefact occurrence C left behind.
`51db34fc9`'s timing relative to occurrence A is also suggestive.

## Instrumentation available now (kept, uncommitted)

`plugins/framework/plugins/tooling/plugins/checks/core/progress-log.ts` plus
instrumentation in `checks/core/runner.ts` and a `--status` flag in
`cli/bin/commands/check.ts`. Writes `~/.singularity/check-progress.jsonl`:

- `run` / `bootstrap-start` / `bootstrap-end` / `selected` / `start` / `end` /
  `pending` (30s heartbeat) / `done`
- `start`/`end` are written synchronously with `appendFileSync`, so they survive
  `SIGKILL`; the culprit is `started − ended`
- the heartbeat also names the in-flight **bootstrap** phase, which revealed that
  bootstrap costs ~32s on this host (`tree-hash` alone 27.4s)

This is what produced occurrence B's durable evidence. It is worth landing on its
own merits regardless of the root cause. **It is not yet deployed to other
worktrees**, which is why occurrence C produced no equivalent record.

## Next steps

1. **Inspect the exit path.** Why does a completed build keep a live, *busy*
   event loop? Look for a handle that is never disposed (the `esbuild` service
   child is a concrete suspect) and for whatever is spinning the loop rather than
   merely holding it open. `why-is-node-running`-style handle enumeration at the
   end of a build would settle it.
2. **Bisect the commits above**, weighting `423afa587` and `51db34fc9`.
3. **Land the progress log and extend the same idea to `build`**, so a build
   records phase start/end and a post-completion hang is named immediately.
4. **Reproduce cheaply**: run `build`/`check --scope tree` in a loop in a scratch
   worktree, outside the push mutex, until it wedges. Occurrence C suggests a
   plain `build` is enough, which is far cheaper to reproduce than a push.
5. Only after the root cause is understood, revisit whether a supervisory bound
   (heartbeat-based, failing loudly) is still wanted as defence in depth.

## Open question worth settling early

Is the wedge **always** post-completion? If occurrence B's check had also
finished all 71 checks and hung on exit, then `orphaned-db-tables` never hung at
all and the entire "which check hangs" framing is wrong. The progress log can
answer this on the next occurrence: if `done` is absent but `started − ended` is
empty, the work finished and the process failed to exit.
