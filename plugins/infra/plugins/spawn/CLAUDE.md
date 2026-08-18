# spawn

The wedge-proof child-process primitive: every async spawn routes through here
so **piped child stdio cannot exist** outside one owned chokepoint.

## The bug this exists for

bun 1.3.13 (unfixed through 1.4-canary) has a race where a `Bun.spawn` child
with piped stdio exiting **during a pending stream pull** wedges the event loop
in a permanent native microtask storm: ~100% CPU, kevent starved, children
zombify, the op never completes. Every field `./singularity build/check/push`
wedge was this bug. Producer chain symbolicated from live specimens:
`research/2026-07-22-global-cli-op-wedge-symbolication.md`,
`research/2026-07-22-global-cli-op-wedge-producer-fingerprint.md`; plan:
`research/2026-07-22-global-spawn-plugin-wedge-mitigation.md`.

Load-bearing fact (empirically verified on 1.3.13): a bare `Bun.spawn(cmd)`
defaults stdout to **`"pipe"`** — even option-less calls are exposed. That is
why the `spawn-safety/no-raw-bun-spawn` lint rule (contributed by this plugin's
`lint/`) is a chokepoint ban on the member expression itself.

## Mechanics

`spawnCaptured` removes the stream instead of racing it: per call,
`mkdtempSync(os.tmpdir(), "sg-spawn-")` → write the stdin buffer to a file if
given → `openSync` numeric fds for in/out/err (`mergeStderr` reuses the out fd)
→ `Bun.spawn(argv, { stdin: inFd ?? "ignore", stdout: outFd, stderr: errFd })`
→ `await proc.exited` → capture rusage → close fds, read the files, `rmSync`
in `finally`. Raw numeric fds are a plain kernel dup2 — **zero JS stream
machinery in either direction**, so there is nothing for the exit-during-pull
race to wedge. Temp files orphaned by a hard crash are reclaimed by the OS
tmpdir sweep (repo convention).

## API (`@plugins/infra/plugins/spawn/core`)

- **`spawnCaptured(argv, opts?) → Promise<SpawnResult>`** — capture-shaped
  spawn. `opts`: `cwd`, `env` (FULL replacement, same contract as `Bun.spawn`),
  `stdin` (whole `string | Uint8Array` buffer, EOF at the end), `background`
  (argv := `backgroundArgv(argv)` from `spawn-priority/core`), `mergeStderr`
  (2>&1; `result.stderr === ""`), plus the two bounds `timeoutMs` and `signal`
  (see below). The result's `exitCode` **≠ 0 is a
  legitimate result** — the caller branches. `stdout`/`stderr` are lazy cached
  utf8 decodes of `stdoutBytes`/`stderrBytes` (the raw bytes exist for
  byte-offset parsers like `git cat-file --batch` framing).
  `resourceUsage.maxRssBytes` is the child's true peak RSS, read after exit.
  `timedOut` is `true` iff OUR deadline fired and we killed the child (never
  inferred from `signalCode` — anyone can SIGTERM a child).
- **`spawnExpectOk(argv, opts?)`** — the same, but THROWS `SpawnFailedError`
  (carrying argv/exitCode/signalCode/stdout/stderr) on non-zero exit, so a
  failed command can never be read as empty success.
- **`spawnPassthrough(argv, { cwd, env, background, stdin, onSpawn }?)`** —
  exec-shaped spawn: stdout/stderr `"inherit"`, stdin `"ignore"` unless
  `stdin: "inherit"` (only for a child that must be indistinguishable from the
  parent — the CLI's post-install re-exec). `onSpawn` exposes `{ pid, kill }`
  synchronously for signal forwarding. Returns
  `{ exitCode, signalCode, resourceUsage }`.
- **`getWorktreeRoot(cwd?)` / `getMainRepoRoot(cwd?)`** — THE canonical git
  root helpers (`git rev-parse --show-toplevel` /
  `dirname(resolve(git rev-parse --git-common-dir))`), collapsing the ~51-file
  `getRoot()` copy-paste epidemic. Memoized per resolved cwd
  (`Map<resolvedCwd, Promise<string>>` — one spawn per process, concurrent
  first callers share it). Outside a git repo they **throw** — the old copies
  absorbed that to `""`, a latent path bug (repo fail-loud rule).

## The two bounds: `timeoutMs` and `signal` (`SpawnBound`)

Both run the same escalation — SIGTERM, SIGKILL after 2s, timers cleared in the
existing `finally` — through one `escalateKill()`, so setting both cannot leak a
timer. They differ in how the kill is reported, deliberately:

- **`timeoutMs` returns `timedOut: true`.** It is the CALLER's own deadline, so
  the caller classifies it. Whatever the child wrote first is still captured.
- **`signal` THROWS `signal.reason`.** An abort is ambient ("everything you are
  doing has been abandoned"); as a result field it would be absorbed by a caller
  that maps a failed probe to a conservative default and then runs a hundred more
  spawns. `spawnExpectOk` needs no special case — the abort propagates before the
  exit-code check. Edges: an abort beats `timedOut` in either order, and an abort
  after a clean exit still throws, discarding a good result.

Both are still optional. Set a bound wherever the caller owns a deadline, and
**always where a host-wide lock/slot is held** — an unbounded child under the
`worktree-mutate` flock stops worktree checkouts on every backend on the box (the
2026-08-17 outage). Without one there is no other ceiling: the fleet-level
watchdog was retired 2026-07-28 as an all-false-positive instrument
(`research/2026-07-28-global-retire-op-wedge-watchdog.md`), so an unbounded hung
child hangs until a human notices. `research/2026-08-17-global-reap-stale-cost-and-bounded-execution.md`
plans making a bound required.

## Deliberate non-goals

- **No `maxOutputBytes`** — a silent output cap is an absorbed failure.
- **No sync variant** — `Bun.spawnSync` / `execFileSync` buffer natively (no
  JS streams, no wedge). The few existing sync sites are untouched and
  rule-legal; a loop-blocking sync spawn is fine for the CLI, revisit
  server-side in Stage 2.

## Exception policy

A genuinely streaming or long-lived child — parsed live, written to live, or
meant to outlive the call — cannot use after-exit temp files. Those get a file
entry in `lint/index.ts`'s `ignores` **with a written justification** (intended
review pressure, mirroring git-grep-safety), never an inline disable.

## Stage 2 — in progress

The blanket "every plugin server tree" glob is gone. `lint/index.ts` now lists
the exempt server files individually, split into a permanent streaming/long-lived
group and a **temporary backlog of 21 plain capture sites**, each a mechanical
`spawnCaptured` conversion. Delete an entry as you migrate its file; Stage 2 is
done when the backlog group is empty.

The gate that held this back has flipped. `spawn/CLAUDE.md` used to set the
criterion as "the absence of an observed field wedge, diagnosed by hand" — a
field wedge has now been observed **twice**, including the 2026-08-17 outage,
where an unbounded `git worktree remove` under the host-wide `worktree-mutate`
flock blocked worktree checkouts fleet-wide.

Note the migration is worth doing even ignoring timeouts: the pre-migration
pattern (`{stdout: "pipe"}` then `await proc.exited` with stdout never read) is a
plain >64KB pipe-buffer deadlock on top of the bun race.

## Boundaries

**`core/` here means runtime-neutral Node, not web-safe** — it reaches
`node:fs` / `node:path` and composes `spawn-priority/core` for demotion. It
must never be imported from `web/`. `server/` is the plugin's server-runtime
presence only — **no re-exports**; import from `core/`.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Wedge-proof child-process primitive: spawnCaptured/spawnExpectOk capture stdout/stderr via temp-file fds (no piped stdio, so bun 1.3.13's exit-during-stream-pull race has nothing to wedge), spawnPassthrough inherits the parent's streams, and getWorktreeRoot/getMainRepoRoot are the memoized canonical git-root helpers. Node-only (no db/jobs) so a CLI process can import it; the spawn-safety lint rule routes every raw Bun.spawn here.
- Core:
  - Uses: `packages/spawn-priority.backgroundArgv`
  - Exports (types):
    - `SpawnBound`
    - `SpawnedChild`
    - `SpawnOptions`
    - `SpawnPassthroughOptions`
    - `SpawnPassthroughResult`
    - `SpawnResult`
  - Exports (values):
    - `getMainRepoRoot`
    - `getWorktreeRoot`
    - `spawnCaptured`
    - `spawnExpectOk`
    - `SpawnFailedError`
    - `spawnPassthrough`
- Cross-plugin:
  - Imported by:
    - `framework/tooling/boundaries`
    - `framework/tooling/checks`
    - `framework/tooling/format`

<!-- AUTOGENERATED:END -->
