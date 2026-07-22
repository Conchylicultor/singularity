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
  (2>&1; `result.stderr === ""`). The result's `exitCode` **≠ 0 is a
  legitimate result** — the caller branches. `stdout`/`stderr` are lazy cached
  utf8 decodes of `stdoutBytes`/`stderrBytes` (the raw bytes exist for
  byte-offset parsers like `git cat-file --batch` framing).
  `resourceUsage.maxRssBytes` is the child's true peak RSS, read after exit.
- **`spawnExpectOk(argv, opts?)`** — the same, but THROWS `SpawnFailedError`
  (carrying argv/exitCode/signalCode/stdout/stderr) on non-zero exit, so a
  failed command can never be read as empty success.
- **`spawnPassthrough(argv, { cwd, env, background, onSpawn }?)`** —
  exec-shaped spawn: stdout/stderr `"inherit"`, stdin `"ignore"`. `onSpawn`
  exposes `{ pid, kill }` synchronously for signal forwarding (inspect.ts's
  self re-exec). Returns `{ exitCode, signalCode, resourceUsage }`.
- **`getWorktreeRoot(cwd?)` / `getMainRepoRoot(cwd?)`** — THE canonical git
  root helpers (`git rev-parse --show-toplevel` /
  `dirname(resolve(git rev-parse --git-common-dir))`), collapsing the ~51-file
  `getRoot()` copy-paste epidemic. Memoized per resolved cwd
  (`Map<resolvedCwd, Promise<string>>` — one spawn per process, concurrent
  first callers share it). Outside a git repo they **throw** — the old copies
  absorbed that to `""`, a latent path bug (repo fail-loud rule).

## Deliberate non-goals

- **No `timeoutMs`** — fleet protection against a truly hung child is
  op-wedge-watchdog's job; a per-call timeout would just absorb hangs.
- **No `maxOutputBytes`** — a silent output cap is an absorbed failure.
- **No sync variant** — `Bun.spawnSync` / `execFileSync` buffer natively (no
  JS streams, no wedge). The few existing sync sites are untouched and
  rule-legal; a loop-blocking sync spawn is fine for the CLI, revisit
  server-side in Stage 2.

## Exception policy

A genuinely interactive/streaming child — one that must be parsed live while
being written to — cannot use after-exit temp files. There is exactly ONE:
`cli/bin/migrations-interactive.ts` (drizzle-kit's create-vs-rename prompt
parser). New legitimate streaming sites get a file entry in `lint/index.ts`'s
`ignores` with a written justification (intended review pressure, mirroring
git-grep-safety), never an inline disable.

## Stage 2

`plugins/**/server/**` (~65 sites, 38 files) is temporarily lint-ignored and
migrates in batches once Stage 1 demonstrably stops the field `cli-op-wedge`
reports — see the plan doc's deferred annex. Each batch shrinks the server
ignore glob. The `pg_dump → pg_restore` stdin chaining is the known streaming
exception there (stays piped or moves to a fifo/file handoff).

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
  - Exports: Types: `SpawnedChild`, `SpawnOptions`, `SpawnPassthroughOptions`, `SpawnPassthroughResult`, `SpawnResult`; Values: `getMainRepoRoot`, `getWorktreeRoot`, `spawnCaptured`, `spawnExpectOk`, `SpawnFailedError`, `spawnPassthrough`
- Cross-plugin:
  - Imported by: `framework/tooling/boundaries`, `framework/tooling/checks`

<!-- AUTOGENERATED:END -->
