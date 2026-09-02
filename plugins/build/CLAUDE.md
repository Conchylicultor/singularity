# build

Auto-build is a **convergence loop on "this checkout's HEAD is what is
deployed"**, not a queue of push events: a request that arrives while a build is
in flight is DROPPED — its claiming INSERT loses the in-flight index — so the
request is re-derived rather than remembered. `reconcileDeployment` (`internal/reconcile.ts`) is that
re-derivation, and it **takes no argument** — there is no baseline to carry, so
nothing is lost when a build kills the process that would have carried one.

It runs at five edges: the target moving (`buildRunJob`, on the durable
`refAdvanced` trigger), a build reaching terminal (the build job's `onEnded`,
`internal/run-state.ts`), this backend starting (`onReady`), the
`compositions` config changing (`watchConfig`), and the `build.composition-tick`
cron. The decision is stateless and idempotent,
so an extra edge is free and a missed edge degrades to "converges at the next
edge". `buildRunDebouncedJob` re-derives it again before spawning, which makes
the debounce a coalescing optimisation rather than a correctness mechanism.

The decision itself is NOT here — it is the pure `wantsBuild` in
`plugins/deployment/core`, over the pins that plugin owns, plus the pure
`compositionWantsRebuild` in `internal/composition-trigger.ts` for the served
compositions. `internal/wants-build.ts` only binds them to db/config and to the
main-only scope, in ONE `decideBuilds(now)` so every edge re-derives both halves
from one read. Read `plugins/deployment/CLAUDE.md` before touching any of it.

## The composition arm of the same loop

A served composition drifts: `sonata.localhost:9000` keeps running the dist and
the server tree of whatever commit last happened to build it. So the loop covers
it too, by the same mechanism rather than a new one — the manifest row's `serve`
mode contributes exactly ONE clause, a rate limit, and everything else is the
same `wantsBuild` main's own build runs, with the `composition.json` marker
modelled as the single `web` carrier.

Two things that look like omissions and are not:

- **A marker-less composition is never auto-built.** An automatic trigger may
  not MINT a namespace — claiming one provisions a gateway registry dir, a
  database and a spec dir, and pressing **Serve** is the only thing allowed to do
  that.
- **Main only**, both halves. `refs/heads/main` is tracked by every backend on
  the host, so a per-worktree scope would have every live agent worktree
  rebuilding the same compositions off one push — the fan-out
  `events.refresh-tick` refuses for its own cadence. The explicit Serve /
  Rebuild buttons still work everywhere.

Main's own build wins when both want one: a build claims a single durable
in-flight slot and the claim is target-blind, and the main build's terminal edge
reconciles again, so the composition build follows rather than being lost.

The commit gate answers "has the tree moved", so editing a composition's own
manifest row (contributors, entry points, `extends`) is deliberately NOT an
automatic trigger — **Rebuild now** is, and it is available in every mode for
exactly that reason.

## A run has TARGETS, not a target

`build_runs.targets` is a `text[]` of composition ids: `{singularity}` for a
plain build of this checkout's own app, or the ids of a
`./singularity build --composition a b`. One invocation is one shared build — one
install, one codegen, one checks pass, one transcript, one profile, one verdict —
so it is ONE row with N chips, and the history DataView renders the column as a
`tags` field (match-any filtering comes free). `isMainCompositionBuild(targets)`
(`build/core`) is the one answer to "is this a plain build?", so no surface spells
a literal. The old scalar `target` column is gone: the CLI's ledger INSERT now
names its own columns instead of going through drizzle's `.values()` (which names
EVERY column in the table def), so a column added by this same build no longer
breaks the CLI's write — see `run-ledger/CLAUDE.md`.

`buildJob.enqueue({ trigger, compositions })` is what the Serve button reaches:
it claims the same single in-flight slot and spawns `build --composition a b c`,
which publishes each `<id>.<checkout>.localhost:9000` from THIS checkout. The
field is a SET so N drifted compositions are one shared invocation, not N runs
queued behind each other's `.build.lock`; an empty set is rejected by the input
schema at the enqueue rather than quietly meaning "the main app".

The slot is target-blind on purpose: a live `build --composition sonata` in this
checkout makes a plain auto-build request be dropped. That is correct, not an
oversight — the per-checkout `.build.lock` serializes the two anyway, so the
second would only queue behind the first and then rebuild a tree that has not
moved. Do not "fix" it by scoping the index per target.

## The build is a supervised JOB

`./singularity build` is a **supervised job**
(`@plugins/infra/plugins/jobs/plugins/supervised-job`) named
`build.run.supervised`, declared once in `internal/run-build.ts`. There is no
`triggerBuild` any more and nothing calls a spawner directly: every request —
the Build button, the Serve button, the auto-build debounce — is
`buildJob.enqueue({ trigger, compositions? })`.

The wrapper composes `defineJob` + a `supervised-run` kind + `ctx.waitFor`, and
the handler is short at both ends and empty in the middle: claim the row, spawn
the detached child, SUSPEND. `ctx.waitFor` returns from the handler through the
jobs plugin's suspend sentinel, so a 20-minute build holds a worker slot for
milliseconds and the workflow comes back as a fresh dispatch when the child's
exit marker lands. Read `supervised-job/CLAUDE.md` before changing any of it.

What each arm of `internal/run-build.ts` owns, and why the split is where it is:

- **`claim`** — `claimBuildRun`, and the claiming INSERT against
  `build_runs_inflight_uniq` IS the lock. A request that loses returns `null`,
  the handler stops, and nothing is queued: auto-build is a convergence loop, so
  the request is re-derived at the next edge. The `auto` "started" bell is rung
  here, which is the last moment this plugin owns before the child exists.
- **`argv`** — `--allow-main` before `--composition` (commander's variadic is
  greedy up to the next flag), plus the two env overrides that are ADDED to the
  backend's own environment: `SINGULARITY_BUILD_ID`, and
  `SINGULARITY_BUILD_DETACHED`, which is what stops the CLI's orphan guard from
  killing a build whose invoking backend it is about to restart.
- **`closeRow`** — the bare `WHERE finished_at IS NULL` stamp of `finished_at` +
  `exit_code`, and NOTHING else. It runs in the supervised-run reconciler of
  every backend that sees the marker, including one that knows nothing about the
  workflow, and that is what stops a dead workflow from leaving the in-flight
  index held against every future build.
- **`onEnded`** — the terminal WORK, exactly once, in the owning workflow: the
  bell, `deploymentResource.notify()`, and `reconcileDeployment()`. **The row is
  already closed by the time this runs** — the CLI stamps its own row ~100 s
  before its child exits, and failing that `closeRow` runs before the
  announcement that resumes the handler. So nothing here is gated on
  `finished_at IS NULL`; the row is read BACK and the bell describes what the
  ledger carries.

`runAttempts` stays at the default **1**. A failed build stays failed and
visible; whether to build again is the convergence loop's call, made from the
state of the world, not a retry budget. And a non-zero exit code is DATA, not an
exception: the handler records it and returns normally, so a failed build files
no crash report and no dead-letter.

What that buys, and what moved:

- **Nothing waits for a build.** A caller enqueues and returns. Everything that
  used to sit after `await proc.exited` — the bell, the row's terminal stamp,
  `reconcileDeployment` — is now the durable workflow's, resumed by whichever
  backend is alive when the exit marker lands. **This is a repair, not a
  refactor:** the build restarts the backend that spawned it, so the process
  holding that await was routinely killed first. On `main`: 33 `Auto-build
  started` bells against **2** `Build succeeded` bells, ever. The only failures
  that notified were the ones that failed before the deploy step.
- **The in-process `inflight` boolean is gone.** It only ever collapsed two
  clicks inside one process, and the durable claim already does that across all
  of them. So is `failUnstartedBuild`: closing a claimed row whose spawn threw
  is `spawnClaimedRun` in the wrapper now, once for build, release and deploy.
- **The build log keeps scrolling across the restart.** The child's output goes
  to a transcript FILE and the supervisor publishes by tailing it, so the new
  backend re-attaches to a build already in flight. With a pipe it stopped dead
  at the restart and never resumed.
- **`reconcileOrphanBuilds` and `watch-inflight-build.ts` are deleted.** They
  were the two halves of the primitive's one reconciler. So is
  `hasLiveInflightBuild`: the claiming INSERT against `build_runs_inflight_uniq`
  is the lock, and a pre-flight pid probe in front of it was a TOCTOU window plus
  a second copy of the liveness question.
- **`build-logs-<id>.json` did two jobs and only one moved.** Its
  `exitCode` + `finishedAt` were the terminal record — that is the exit marker's
  job now, written by the shim for any command rather than by a CLI that
  remembers to. Its `steps` are structure only the build itself can know, so the
  CLI still writes them and nothing changed there. `recoverBuildArtifacts`, which
  reconstructed a one-step stand-in from the parent's pipe for a hard-killed
  build, is gone: the recovery moved to the READ path, where `build-logs`
  synthesises the same single block from the child's own transcript — which
  exists even when the parent died too, the case the old backstop could not
  cover.

### Why the convergence loop still terminates

The loop is `onEnded → reconcileDeployment → build.run.debounced →
buildJob.enqueue → onEnded`, so the question is whether a finished build can
immediately ask for itself again. It cannot, and the reason is an ORDERING that
the migration preserves by construction: `closeRow` writes `finished_at` +
`exit_code` **before** the `runEnded` announcement that resumes the workflow, so
by the time `onEnded` reconciles, `lastClosedAttempt` already sees this build's
own commit as an attempt and `wantsBuild` answers no. (Before the migration the
same ordering held for a different reason — `finishBuild` stamped the row as its
first statement and reconciled as its last.)

The two other edges of the same argument:

- A build whose SPAWN failed never reaches `onEnded` at all, so it never
  reconciles — while `spawnClaimedRun` still closes its row with the hard-kill
  sentinel. The attempt is recorded, `ok` is false, and the loop does not
  re-derive it into a five-second retry storm.
- A request that arrives mid-build is dropped by the claim, not queued, so N
  edges firing during one build produce N cheap `instant` dispatches and one
  build.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Trigger `./singularity build` from the toolbar.
- Web:
  - Slots:
    - `BuildDetailSlots.Section` ← `build.build-commits`, `build.build-fix`, `build.build-info`, `build.build-logs`, `build.build-profiling`
    - `buildPane.Actions` ← `primitives.pane`
    - `buildDetailPane.Actions` ← `primitives.pane`
  - Contributes:
    - `ActionBar.Item` → `BuildButton`
    - `Pane.Register` "build"
    - `Pane.Register` "build-detail"
    - `DebugApp.Sidebar` "Builds" → `component`
    - `ConfigV2.WebRegister` "config"
  - Uses:
    - `apps-core/tabs.navigate`
    - `apps/debug/shell.DebugApp`
    - `build/deployment.DeploymentChain`
    - `config_v2.ConfigV2`
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `primitives/app-shell.sidebarNavItem`
    - `primitives/auto-scroll.JumpToBottomButton`
    - `primitives/auto-scroll.useStickyScroll`
    - `primitives/css/pin.Pin`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Stack`
    - `primitives/css/spinner.Spinner`
    - `primitives/css/text.Text`
    - `primitives/css/text.textVariantClass`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.cn`
    - `primitives/css/ui-kit.ControlSizeProvider`
    - `primitives/detail-sections.defineDetailSections`
    - `primitives/icon-button.IconButton`
    - `primitives/live-state.useNotificationsChannelStatuses`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/log-channels.clientLog`
    - `primitives/networking.useReconnectingWebSocket`
    - `primitives/networking.wsUrl`
    - `primitives/pane.openPane`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/popover.InlinePopover`
    - `primitives/tooltip.WithTooltip`
    - `runs.RunsDataView`
    - `shell/action-bar.ActionBar`
    - `shell/notifications.toast`
  - Exports (values):
    - `buildDetailPane`
    - `BuildDetailSlots`
    - `buildPane`
    - `useStaleFrontend`
- Server:
  - Contributes:
    - `ConfigV2.Register` "config"
    - `resource.declare` "build.history"
    - `trigger` "build.run"
  - Uses:
    - `build/deployment.deploymentResource`
    - `build/deployment.readDeployment`
    - `build/run-ledger._buildRuns`
    - `config_v2.ConfigV2`
    - `config_v2.getConfig`
    - `config_v2.watchConfig`
    - `database.db`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/events.Trigger`
    - `infra/git-watcher.refAdvanced`
    - `infra/jobs.defineJob`
    - `infra/jobs/supervised-job.defineSupervisedJob`
    - `infra/paths.checkoutRef`
    - `infra/paths.currentWorktreeName`
    - `infra/paths.isMain`
    - `infra/paths.REPO_ROOT`
    - `infra/query-resource.queryResource`
    - `infra/worktree.readCompositionMarker`
    - `primitives/log-channels.Log`
    - `shell/notifications.recordNotification`
  - Register:
    - `defineJob('build.run')`
    - `defineJob('build.run.debounced')`
    - `defineJob('build.composition-tick')`
    - `defineSupervisedJob('build.run.supervised')`
  - Resources: `build.history` (keyed)
  - Routes:
    - `POST /api/build`
    - `POST /api/build/serve`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `infra/namespace.MAIN_COMPOSITION_ID`
    - `infra/query-resource.queryResourceDescriptor`
    - `primitives/pane.defineRoute`
  - Exports (types): `BuildRun`
  - Exports (values):
    - `buildDetailRoute`
    - `buildHistoryResource`
    - `buildRoute`
    - `BuildRunSchema`
    - `isMainCompositionBuild`
    - `serveCompositionEndpoint`
    - `triggerBuildEndpoint`
- Cross-plugin:
  - Imported by:
    - `build/build-commits`
    - `build/build-fix`
    - `build/build-info`
    - `build/build-logs`
    - `build/build-profiling`
    - `build/runs-arm`
    - `debug/reports`
    - `shell/global-action-bar`
- Shared:
  - Exports (types): `BuildRun`
  - Exports (values):
    - `buildConfig`
    - `buildHistoryResource`
    - `BuildRunSchema`
    - `isMainCompositionBuild`
- Sub-plugins:
  - **`build-commits`** — Commits included since the previous build, shown in the build detail pane. Per-run commit list data endpoint.
  - **`build-fix`** — Launch-agent button in the build detail pane for failed builds.
  - **`build-info`** — Status, trigger, commit hash, and timing section in the build detail pane.
  - **`build-logs`** — Live log stream section in the build detail pane. Per-run build log data endpoint.
  - **`build-profiling`** — Per-run build profiling Gantt section in the build detail pane. Per-run build profiling data endpoint.
  - **`build-status`** — Single source of truth for build-run status display metadata — label, badge variant, and dot color per BuildStatus.
  - **`build-termination`** — Per-run termination endpoint: what the host-global signal-origin sink recorded about the death of one build run (which signal, and who sent it).
  - **`deployment`** — The client half of the deployment description: `useDeployment()` composes THIS tab's own baked pin in beside the server's two deployable carriers, and `<DeploymentChain/>` renders the four arms — one commit row when converged, the chain with a carrier chip on each carrier's own commit when behind, and the raw pins plus the reason when there is no line to draw. Also eagerly registers the boot-critical build.deployment resource descriptor so boot-snapshot can hydrate it before first paint. The deployment description: this checkout's HEAD (the target) plus a pin per deployable carrier — the backend process and the frontend bundle it serves — and the one derived verdict (converged / behind / diverged / unknown) both the Build button and the auto-build decision read. A leaf: it never imports build/server, so the reconciler that owns triggerBuild can import DOWN into it.
  - **`run-ledger`** — Lean build-runs ledger leaf: the build_runs table def + the CLI build-run recorder, importable by the `./singularity build` CLI without the heavy build barrel (which pulls config_v2/notifications).
  - **`runs-arm`** — The build arm's presence on the merged run surface: the Build kind (whose rows open the existing build run-detail pane), the six-way build status dot as the list row's leading indicator, and the status / targets / commit / exit-code columns only a build row has. The build arm of the merged run space: binds `build_runs` into the runs union, mapping the six-way BuildStatus taxonomy onto the shared outcome axis while keeping it whole as the `build.status` arm field, plus the targets, commit and exit code only a build row has.
  - **`serve-composition`** — Serve capability for a composition: the live-serve toggle panel, the enable→build hook (a `build --composition <id>` of THIS checkout), the served-liveness read (the server-resolved namespace plus the composition.json marker, not the autoBuild intent), and the delete flow — which asks what the composition owns across every checkout, names it in a confirm dialog, and reclaims it before the manifest row goes. Consumed by Studio's Build & serve section and compositions list, and by the deploy pane's Test locally section. Serve-liveness read for a composition: WHERE this backend's checkout serves it (the server-resolved namespace + url) and whether anything is actually there (the composition.json marker), plus the reset-to-first-launch endpoint — wipes ONLY that namespace's DB + config back to what a serve build provisions on a fresh serve, then restarts its backend. Never touches the checkout's own app. Also answers what a composition owns across EVERY checkout that has served it (the marker scan behind the delete confirmation) and reclaims that whole set, per-namespace outcomes reported individually.
  - **`server-build-id`** — Served-bundle pin leaf: reads the .build-commit (the tree the bundle was built from) and .build-graph (content identity of the served web graph) trailers out of the served dist, fresh on every call. A leaf so the deployment description and stale-tab detection read them without importing the heavy build barrel (which pulls git-watcher/worktree).

<!-- AUTOGENERATED:END -->
