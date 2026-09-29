# deps

Optional dependencies — a Python env, later a dataset or a built binary —
declared once, **installed on demand** off the event loop into a
content-addressed host-wide cache, with their **state visible**, and **kept
current** by gated updaters. Design: `research/2026-09-29-infra-deps-v2.md`.

## Using it

```ts
// plugins/<feature>/server/internal/deps.ts
export const audioPython = defineDep({
  id: "audio-python",
  owner: "infra/audio-analysis",
  description: "Python audio tools",
  sizeHint: "≈500 MB",
  source: pythonEnv({ project: "plugins/infra/plugins/audio-analysis/python" }),
  // a source with no updater must say `updates: { none: "<why frozen>" }` (tsc)
});
// server/index.ts: contributions: [DepDeclare({ dep: audioPython })]

// in a supervised job's run body (or a CLI command) — never a request handler:
const ready = await ensureDep(audioPython, exec);        // exec: ExecContext
const out = await runPython(ready, { module: "pkg.mod", input, output: Schema, timeoutMs });

// from a request handler:
await requestDep(audioPython);                            // enqueues deps.install, returns at once
const state = await depState(audioPython);               // absent | installing | ready | failed
```

- **`ensureDep` demands an `ExecContext`** (`supervised-job/core`). Only a
  supervised job's `run` body (`ctx.exec`) and a CLI command
  (`cliExecContext`, from the supervised-job `cli` barrel, which no `server/`
  file may import) have one, so a request handler cannot spell the call —
  `types.test.ts` holds the `@ts-expect-error`.
- **`Ready<S>`** is returned only by `ensureDep`; runners take it, so "forgot to
  ensure" is a type error.
- Consumers see only `defineDep` / `DepDeclare` / `ensureDep` / `requestDep` /
  `depState`. The Dependencies view, the CLI, the install job and the sweep
  read the generic `DepDeclare` set and name no dependency.

## Layout on disk

`cache/deps/<id>/<identity>/`: `env/` (the payload), `ready.json` (written
**last** — its presence, plus the kind's optional `isIntact(env)`, is the whole
definition of "installed"), `install.log`, `installing.json` (while the lock is
held), `failed.json`, `last-used`. The lock is `locks/deps/<id>-<identity>.lock`
(a kernel flock: released on death, no pid consulted).

- **Identity** = sha256 of the kind plus every declared input the kind reports
  (`identityInputs(root)`: lock hashes, the installer's own version). Nothing is
  typed in by hand; a changed input is a new identity, so a new install.
  Worktrees on one identity share an install; a worktree trialling a bump gets
  its own.
- **Install in place, not temp-dir-then-rename.** A venv is not relocatable
  (its scripts and `pyvenv.cfg` name its own path), so the kind fills the final
  `env/` under the lock, after removing any partial one. `ready.json` last keeps
  "interrupted reads as absent" exactly as a rename would.
- **Once per machine.** Slow path: take the flock (waiting re-tries `flockTry`
  every 500 ms — only ever in an out-of-process context), re-check, install
  under one background unit of `withHostGrant`.
- **Sweep.** Daily `deps.sweep` (main-only by its schedule) removes an identity
  that is current for no checkout `git worktree list` knows AND unused for 14
  days, never one whose lock is held.

## State

`depState(dep)` reads the files above (safe on the event loop). The
`deps.states` live value (external source) pushes every declared dep's row; a
`file-watcher` on `cache/deps` (payloads ignored) notifies while anyone is
subscribed. Settings → Dependencies (`web/`) is a DataView over it with
Install / Remove row actions. An identity that cannot be derived (uv missing)
is `failed`, never `absent`.

## CLI

`./singularity deps list | install <id> | remove <id> | upgrade <updater> [--only a,b]`.
Every verb boots this checkout's backend in `exec` mode (`runExec`): the
declared deps and updaters are server contributions, collected only by a boot —
so the checkout must have been built once. A verb loads its server-barrel
imports only INSIDE the exec body (a relative `await import("./…-body")` —
plugin-boundaries R9 bans a dynamic `import("@plugins/…")` of another plugin):
evaluating one before `runExec` declares the runtime namespace throws (config_v2
resolves its dir at module eval).

## Sub-plugins

- `updates` — the `Updater` contract (`core/`) and the generic runner (its
  `cli/` barrel, shared CLI machinery: baseline gates →
  move → candidate gates → retry-to-confirm → verdict `current | upgraded |
  regressed`, files put back on anything but `upgraded`), lifted from
  `plugins/toolchain`. The `UpdaterDeclare` registry and the daily
  `deps.detect-outdated` job (one auto-started task per outdated updater with no
  open task of its own author `deps.<id>`, Dependencies category). The receipt
  is `deps-upgrade-<updater>.json` in the worktree data dir.
- `mise` — the toolchain as the first updater (`toolchain upgrade` is its
  alias; `toolchain:resolved` stays in `plugins/toolchain`).
- `python` — the `python` kind (`pythonEnv`, `runPython`, `PythonEntryError`),
  its `cache/uv` + `cache/uv-python` dirs, and the `uv` updater (every
  `python/` project's `uv.lock`, 3-day `exclude-newer` cooldown).
- `hello-python` — a tiny real `python/` project (numpy); delete it once the
  audio pipeline lands as the first real consumer.

## Not done yet (by design, follow-ups)

- **`at-install` deps.** A provision step runs at `bun install`, before any
  build, and its boundary row reaches only `core` and other `provision`
  barrels — it cannot see server-side declarations without a static registry.
  Chromium's move onto `infra/deps` is where that gets designed; until then every
  dep is on demand.
- `download` and `build` kinds, and the `npm` updater.

## Traps

- **`mise install` in a worktree whose `mise.toml` declares a tool the lock
  lacks WRITES `mise.lock`** (mise 2026.9.10 appended the whole `[[tools.uv]]`
  entry). The mise updater computes the new lock from the text it read before
  installing and overwrites whatever mise wrote.
- **`UV_NO_CONFIG` also ignores the project's own `pyproject.toml` `[tool.uv]`
  and `.python-version`** — never set it.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Settings → Dependencies: a DataView over every declared optional dependency (state, size, identity, last used, the install's latest log line) with Install / Remove row actions, pushed live from deps.states. Optional dependencies installed on demand: defineDep declares one (an installer kind's source, and how it stays current), ensureDep installs it off the event loop (it demands an ExecContext) under a host flock into a content-addressed cache (`ready.json` written last), requestDep enqueues the deps.install supervised job from a request, depState and the pushed deps.states live value say absent / installing / ready / failed, and a daily deps.sweep removes identities no checkout declares that sat unused for 14 days.
- Web:
  - Slots:
    - `item-actions` ← `infra.deps`
    - `dependencies.actions` ← `primitives.pane`
  - Contributes:
    - `Pane.Register` "dependencies"
    - `Settings.Sidebar` "Dependencies"
    - `item-actions` "install" → `InstallDepAction`
    - `item-actions` "remove" → `RemoveDepAction`
  - Uses:
    - `apps/settings/shell.Settings`
    - `infra/endpoints.useEndpointMutation`
    - `network/live.useLive`
    - `primitives/css/badge.Badge`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.FieldDef`
    - `primitives/data-view.ItemActionProps`
    - `primitives/icon-button.IconButton`
    - `primitives/live-state.foldResource`
    - `primitives/pane.defineRoute`
    - `primitives/pane.openPane`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/relative-time.RelativeTime`
- Server:
  - Contributes: `resource.declare` "deps.states"
  - Uses:
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/file-watcher.createFileWatcher`
    - `infra/host/host-admission.withHostGrant`
    - `infra/jobs.defineJob`
    - `infra/jobs/supervised-job.defineSupervisedJob`
    - `infra/worktree.listWorktreePaths`
    - `network/live.serveValue`
    - `primitives/log-channels.defineLogSink`
    - `primitives/log-channels.Log`
  - Exports (types):
    - `DefineDepSpec`
    - `Dep`
    - `DepSource`
    - `EnsureOptions`
    - `InstallContext`
    - `Ready`
    - `RemoveOutcome`
  - Exports (values):
    - `declaredDep`
    - `declaredDeps`
    - `defineDep`
    - `DepDeclare`
    - `depState`
    - `ensureDep`
    - `removeDep`
    - `requestDep`
    - `UnknownDepError`
  - Register:
    - `defineSupervisedJob('deps.install')`
    - `defineJob('deps.sweep')`
  - Resources: `deps.states` (push)
  - Routes:
    - `POST /api/deps/install`
    - `POST /api/deps/remove`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `network/live.liveValue`
  - Exports (types):
    - `DepRow`
    - `DepState`
    - `DepUpdates`
  - Exports (values):
    - `DepRowSchema`
    - `depsStates`
    - `DepStateSchema`
    - `DepUpdatesSchema`
    - `installDepEndpoint`
    - `removeDepEndpoint`
- Cli:
  - Uses:
    - `framework/server-core.runExec`
    - `infra/deps/updates.upgradeThisWorktree`
    - `infra/jobs/supervised-job.cliExecContext`
- Cross-plugin:
  - Imported by: `infra/deps/hello-python`
- Test helpers:
  - Server: `@plugins/infra/plugins/deps/server/testing`
    - `readyForTests`
- Sub-plugins:
  - **`hello-python`** — hello-python: a tiny real `python/` uv project (numpy only) declared as an on-demand dependency — the python kind's end-to-end proof, until the audio pipeline replaces it.
  - **`mise`** — The mise toolchain as an updater: contributes `mise` to the updater registry, so the daily deps.detect-outdated job files its upgrade task and `./singularity deps upgrade mise` (alias: `toolchain upgrade`) moves mise.lock through the gated runner.
  - **`python`** — The python installer kind of infra/deps: pythonEnv({ project }) declares a dependency on one uv project (a plugin's `python/` folder) — identity = hash of pyproject.toml + uv.lock + .python-version + the uv version, installed with `uv sync --frozen` into its own env with a uv-downloaded CPython (never the system Python) — and runPython(ready, { module, input, output }) runs one of its modules with JSON in and one JSON document out. Contributes the `uv` updater, which moves every python/ project's uv.lock under a 3-day release cooldown.
  - **`updates`** — The updater registry (UpdaterDeclare) and the daily deps.detect-outdated job: for each updater with something newer than its lock records and no open task, files one auto-started task (Dependencies category) whose agent runs `./singularity deps upgrade <updater>` and pushes on an `upgraded` verdict.

<!-- AUTOGENERATED:END -->
