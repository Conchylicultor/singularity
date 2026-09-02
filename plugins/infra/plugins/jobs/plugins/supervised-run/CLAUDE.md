# supervised-run

Work that outlives the backend that started it: a build, a release, a deploy.
One primitive owns detach + pid + transcript + reconcile + re-attach.

## The file IS the stream

**The child's stdout and stderr go to a file descriptor, not a pipe**, and the
supervisor publishes by _tailing that file_. Do not add a pipe-shaped "live"
path beside it. A pipe belongs to the process that created it, so a live pipe
forces a second artifact-shaped recovery path — and the recovery path is the one
that rots, because nothing exercises it until something has already gone wrong.
Release proved it: `resolveOrphanExitCode` read an artifact only the _parent_
wrote, so a genuinely orphaned release always got the `-1` sentinel. One path
means a restart is not a special case — the boot tailer is the same code as the
spawn-time tailer.

Change detection is `file-watcher` (the repo bans polling). ONE subscription
serves every live run of every kind, which is why `runs/` is its own directory
rather than files beside the build artifacts.

**stdout and stderr merge** (same fd). Interleaving order survives, the
per-line classification does not — two files with two tailers would invert that
trade, which is worse for a transcript read top to bottom. Cost: log viewers
that tint `stream === "stderr"` red render a supervised run in one colour.
Nothing counts, filters or badges on it.

For a consumer reading the transcript back (deploy's `verbFailureMessage`): a
scan keyed on line CONTENT survives the merge unchanged — feed it the transcript
lines instead of a stderr-only array. Only a "last non-blank **stderr** line"
fallback degrades, to "last non-blank line".

## The exit code is captured by the SPAWN

Every argv is wrapped in a POSIX shim, so this works for any command and
"forgot to record the exit code" is unspellable:

```sh
trap 'g=TERM; i=1' TERM; trap 'g=INT; i=1' INT; trap 'g=HUP; i=1' HUP
"$@" & c=$!
wait "$c"; s=$?
while [ "$i" = 1 ] && kill -0 "$c" 2>/dev/null; do i=0; wait "$c"; s=$?; done
[ -n "$g" ] || g=-
printf '%s %s\n' "$s" "$g" > "$T.tmp.$$" && mv "$T.tmp.$$" "$T"; exit "$s"
```

Marker body: `<status> <signal-or-dash>`, e.g. `0 -`, `143 TERM`. Signal names
are bare POSIX (no `SIG`). A marker that exists but does not parse **throws**
(`RunMarkerError`) — it is a writer defect, and answering `null` would file it
under "hard-killed" behind a plausible `-1`.

Four clauses look redundant and are not:

- **Background child + `wait`, not a foreground `"$@"`.** SIGTERM's default
  disposition kills the shell outright, so a group signal would leave no marker
  and a _cancelled_ run would be indistinguishable from a hard kill.
- **Traps BEFORE the `&`.** Between them the shell still has the default
  disposition, and a signal landing there loses the marker. Safe because a
  handler-trap is reset to default in the child (only `trap ''` is inherited).
- **One trap per signal recording its NAME**, not a shared `trap :`. The null
  command is enough to make `wait` return but throws away the one fact only the
  shell has — see below.
- **The `wait` retry.** A trapped signal makes `wait` return `128+signo`
  **immediately — the child has not necessarily exited**. Without the retry the
  shim recorded `143 TERM` and exited while a child that handles TERM (what
  `./singularity build` does via `installFatalSignalExit`) was still shutting
  down: reparented, unwatched, real exit code lost. With it, `42 TERM`. The
  `kill -0` guard is required, not defensive — a second `wait` on an
  already-reaped pid returns 127 and prints `wait: pid N is not a child of this
shell` into the transcript. `kill -0` succeeds on a zombie and fails once our
  own `wait` reaped it, and a pid cannot be recycled before it is reaped.

⚠️ **SIGINT does not cancel a run.** POSIX makes a non-interactive shell set
SIGINT to ignore for an asynchronous list's commands, and ignore is inherited
across `exec` — measured, the child ran to completion and exited 0. The shim
traps INT so it does not die and orphan the child, and records
`exitCode: 0, signalCode: "INT"`, which is what actually happened.
`killSupervisedRun` uses SIGTERM; don't reach for INT.

### `signalCode` is observed, never derived

**`128 + signo` cannot tell a kill from a program that chose `exit(143)`** —
they are the same number. That ambiguity is what recorded
`drun-1787890652933-wr3v6d` as `Exited with code 143`, a sentence about a
command that never exited and never refused. So `RunTerminal.signalCode` comes
from the trap having _fired_, and **nothing may re-derive killed-ness from
`exitCode > 128`** — not here, not in a consumer.

In particular the shim deliberately does **not** fall back to
`kill -l $((s-128))` when the trap did not fire. That looks like a free second
source and is the original guess one layer down: it turns a genuine `exit 143`
into `signalCode: "TERM"`. The test pair `a kill and a deliberate exit(143) are
told apart` fails the moment anyone adds it.

The honest cost: a child signalled _individually_, leaving `sh` untouched,
records `null`. Nothing here does that — every kill goes to the process group —
so `null` reads as "not observed as killed", never "exited normally".

**The finish instant is the marker's mtime**, never `new Date()` at reconcile.
Reusing `now` inflates a recovered run's Duration by the whole gap before
something noticed (release does this and is wrong for it).

**No marker ⇒ hard SIGKILL ⇒ the `-1` sentinel, with `signalCode: null`.**
SIGKILL runs no handler, so absence is the only evidence it can leave and there
is no signal name anyone observed; `-1` is a status no child can produce, so the
case stays legible without claiming one.

## The close rule (build's, verbatim)

```
close?  =  !(terminal == null && isPidAlive(pid))
value   =  terminal ?? { exitCode: -1, finishedAt: now }
```

A marker present closes the run even while the pid is alive — the shim writes it
_before_ exiting. Callers claim their ledger row **before** spawning, seeded
with `process.pid`: the claiming INSERT (partial unique index on the kind's
scope `WHERE finished_at IS NULL`) is what wins or loses the race, and the
seeded pid stops the fresh row looking like an orphan.

**The reconciler is registered once, here, not per consumer** — that is where
`reconcileOrphanBuilds` / `reconcileOrphanReleases` died. `register:` token, so
the register phase completes before any `onReady` sees the kind set.

### A stamped row is not a finished process

The reconciler also drops runs the ledger no longer lists — the caller's own CLI
closing its own row, which is the ordinary case. **That drop goes through the
close rule above, never through a bare untrack**, and the difference is not
cosmetic: `./singularity build` stamps its row after the health probe and then
runs for another ~100s of compose-serve tail (measured: 75.8s). Dropping it on
the ledger's say-so stopped the tail mid-run — truncating the live log for every
kind that stamps early — and, once it was the last live run, tore down the
watcher, so the exit marker landed with nobody listening and `finish` was
**never called at all**.

So the condition for leaving the live set is the run having ENDED, not its row
having been stamped. **The set is still bounded by exactly the argument it was
before**: every child either writes a marker (every death but SIGKILL runs the
shim's trap) or its pid dies, and the reconcile pass re-checks both on the same
timer. All that moved is WHEN a run leaves — at the first tick after its child
really ended, rather than the first tick after someone wrote to a table.

`supervisor.test.ts` is the regression guard, driven through the real reconciler
with a fake ledger and real child processes.

## Kill signals the process GROUP

`killSupervisedRun` sends to `-pid`. The shim does not forward signals, so
signalling it alone kills the supervisor and leaves the work running,
reparented. The group exists because the spawn is `detached: true` — itself
load-bearing: the gateway hot-restarts a backend by signalling its whole process
group, which is what killed a running deploy 0.9 s after spawn on 2026-08-28.

## Adding a kind

`defineSupervisedRunKind({ id, channel, listUnfinished, setPid, finish,
onReattach? })`, mounted with `register: [kind]`, then `startSupervisedRun`.
`onReattach` is only for a kind holding an in-memory live view; the tail is
already restarted by the time it is called.

- **`listUnfinished` must be scoped to this namespace.** A worktree DB is a fork
  of main's and inherits its rows; unscoped, this reaps another machine's runs.
- **`finish` means the run ENDED, not "you are the one closing the row".** It is
  called for a run whose row the caller's own CLI stamped minutes earlier (see
  above), because that is the only edge a consumer's terminal work — a
  notification, a convergence reconcile — has to hang from. So: the write must be
  first-writer-wins (`WHERE finished_at IS NULL`), and anything BESIDE the write
  must still be correct against an already-stamped row. Read the row back rather
  than assuming this call closed it.

## Growth bounds

- **Published**: `TRANSCRIPT_CEILING_BYTES` (16 MiB) per run, then one
  "transcript truncated" line and silence. Protects the channel's ring and its
  `.jsonl` sink.
- **On disk**: newest 50 run sets per kind per worktree, trimmed when the next
  run of that kind starts. `defineRetention` does not apply — it is a nightly
  DELETE over a _table_, and these are files.
- **Residual**: one run's transcript file is bounded only by that run. It is a
  kernel fd the child owns; capping it mid-run would race the writer.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Long-running out-of-process work that survives a backend restart: a detached child whose merged output goes to a transcript FILE (published live by tailing it, so there is no pipe-shaped path to lose), a POSIX shim that records any command's exit status into an atomic marker, and ONE boot reconciler over every registered kind that closes the dead and re-attaches the living.
- Server:
  - Uses:
    - `infra/file-watcher.createFileWatcher`
    - `infra/file-watcher.FileWatcher`
    - `infra/paths.currentWorktreeName`
    - `infra/paths.pruneWorktreeRunArtifacts`
    - `infra/paths.RUN_TERMINAL_SUFFIX`
    - `infra/paths.RUN_TRANSCRIPT_SUFFIX`
    - `infra/paths.worktreeArtifacts`
  - Exports (types):
    - `KillOutcome`
    - `StartedRun`
    - `SupervisedRunKind`
    - `SupervisedRunKindSpec`
    - `UnfinishedRun`
  - Exports (values):
    - `assertRegistered`
    - `defineSupervisedRunKind`
    - `isSupervisedSpawnError`
    - `killSupervisedRun`
    - `reconcileSupervisedRuns`
    - `startSupervisedRun`
    - `SupervisedSpawnError`
    - `TRANSCRIPT_CEILING_BYTES`
- Core:
  - Uses:
    - `infra/paths.currentWorktreeName`
    - `infra/paths.worktreeArtifacts`
  - Exports (types): `RunTerminal`
  - Exports (values):
    - `assertRunId`
    - `assertRunKindId`
    - `HARD_KILL_EXIT_CODE`
    - `isPidAlive`
    - `readRunTerminal`
    - `RUN_TERMINAL_ENV`
    - `RunMarkerError`
    - `supervisedArgv`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments`
    - `infra/jobs/supervised-job`

<!-- AUTOGENERATED:END -->
