# deployments

The **deployment record**: `(composition × server) → { hostnames, loopbackPort }`.
*Where* a composition is served and under what URL. Design:
[`research/2026-07-29-global-composition-production-deployment.md`](../../../../../../research/2026-07-29-global-composition-production-deployment.md)
(D2b).

## Why this is not repo state

Every field of a deployment is an *operational placement* fact, not a property of
the software: the same composition can be served at many URLs on many surfaces,
and the loopback port is a property of the box it lands on. The composition
itself **is** the software and stays in the `compositions` config. So this plugin
adds nothing to git, and the tradeoff is stated plainly: which composition is
served at which URL is DB state, not reviewable in a diff, and covered by the
`backup` plugin rather than by version control. What stays reproducible is what
the original complaint was about — the *host* is derived from code and the
*artifact* is built from a commit.

## Nothing about the install is stored

`runUser`, `installDir`, the systemd unit, the Caddy site path and the whole dir
layout are **derived from the composition name** in [`core/derive.ts`](./core/derive.ts),
which is the only place they may be spelled. `runUser` is the reason: its one
real requirement is *not root* (embedded Postgres refuses `initdb` as uid 0), and
a configurable field with a default is a field someone can set back to `root`.
Deriving `svc-<composition>` makes "never root" **inexpressible** rather than
merely discouraged — the same move as the uid-0 guard, not a second place to get
it right.

The **platform** is likewise not here. It is read off the server's health probe
(`deploy_servers_ext_health.platform`, D2a) — *discovered* on every reachability
check, never typed by a human, so moving from an x86 box to an ARM box is a fact
about hardware rather than a commit.

## The two unique constraints are the invariants

Both live in [`server/internal/tables.ts`](./server/internal/tables.ts), so
neither needs a `./singularity check` and neither can be lost to a concurrent
write:

- `(compositionId, serverId)` — **one install of a composition per server.** This
  is what buys the single-name property: with no second deployment to
  disambiguate, the composition name alone names the install dir, the systemd
  instance, the runtime namespace and the database. Staging and prod of one
  composition therefore live on different servers. A `slot` discriminator is the
  documented way to lift this if a real need appears.
- `(serverId, loopbackPort)` — the port is the only resource two installs on one
  box contend for.

`internal/constraint-violation.ts` maps each violation back to a 409 naming the
invariant, so "the DB rejected it" is never what a caller sees. Anything it does
not recognise is rethrown untouched — an unmapped DB error stays a loud 500.

## `compositionId` is validated at write time, not by a repo check

The row is runtime data, so a stale composition name must fail loudly **when
someone saves it**, not at the next build. `internal/assert-known-composition.ts`
reads the `compositions` config through its own descriptor (never `config_v2`
paths) and 400s a name that is not live, listing what is known. It matches on the
composition **name** — the identity every derived install name has to agree with,
since `release --composition <name>` takes it, `RELEASE.json.composition` carries
it, and the launcher makes it the runtime namespace.

`category` is deliberately not consulted: it is documented as organisation
metadata the engine never reads, so refusing to deploy a `subsystem` here would
give it engine semantics it disclaims. The honest refusal for a composition that
cannot produce a bundle comes from `ship`, which will not find one.

## The contract lives in `core/`, not `shared/`

The `servers` sibling puts its schemas / endpoints / resource descriptor in
`shared/`, which is plugin-private. This plugin's contract has a consumer outside
the plugin — the `singularity deploy converge` / `ship` CLI — so it lives in
`core/` instead, the same call `release/core/{endpoints,resources}.ts` makes for
the same reason. Nothing here is plugin-private, so there is no `shared/` at all.

`compositionId` / `serverId` are **create-only** (see
`UpdateDeploymentBodySchema`): editing that pair in place would leave the old host
converged and running an install no row describes any more.

## The UI launches the CLI; it does not reimplement it

`POST /api/deploy/deployments/:id/run` spawns exactly
`./singularity deploy converge|ship <composition> --server <serverId>` and streams
its stdout/stderr into the durable **`deploy`** log channel — the split `release`
(CLI) / Studio (UI) already uses. (`update` is a *sequence* of those two spawns —
see below — not a third command.) The endpoint owns two verdicts and no others:

- **404** — no such deployment.
- **409** — a run is already in flight **on this server**. Scoped to the server,
  not the deployment: converge writes `/etc/caddy/Caddyfile` and runs `apt-get`,
  so two of them on one box race even for different compositions. The check and
  the state write happen in one synchronous turn (`startDeployRun`), so there is
  no TOCTOU window between them.

Every other refusal is the CLI's, and reaches the user *after* a 200: the command
exits non-zero, its message lands on the log channel and on the run's `message`,
and the UI repeats it verbatim (`RunFailureNotice`). That is deliberate — the
refusals (never-verified server, non-Linux host, owner-data closure behind a
public hostname, platform mismatch, missing bundle, un-converged host) are the
CLI's to own, and restating any of them here would be a second place to keep
right. The one exception is a *pre*-check the UI can make about its own state: the
row actions disable, with the reason in the tooltip, when the server has no
successful probe — the platform a deploy needs is discovered by that probe, so the
button would certainly be refused.

### `update` — the one verb that is not a CLI subcommand

`{ verb: "update" }` is the app's one primary action, and it is a **sequence of
the two real verbs with an engine release between them**:

```
update := converge → [build a candidate, unless the bundle is already current] → ship --release <runId>
```

It re-implements no refusal, no host mutation and no health gate: both legs are
the same `./singularity deploy` commands the row actions launch, and the
build/no-build decision is `resolveBundle` + `compareToHead` — the same authority
`ship` itself consults, asked one step earlier so nobody has to ask the user. So
"the CLI is the engine" still holds; what lives here is the *ordering*.

Three things are load-bearing about how it is built:

- **The body carries no fields.** The platform is read server-side off
  `deploy_servers_ext_health` and the release run id comes from `resolveBundle`
  after the build, so there is no way to ask for a deploy of the wrong bundle to
  the wrong host. That platform read happens *before* the converge: an update
  that cannot resolve a bundle is going to fail anyway, and failing first means
  the user reads the real reason instead of a converge log to scroll past.
- **The bundle is re-resolved after the build**, never reused from before it — a
  build that just ran moved the `latest-<platform>` pointer, and the whole point
  of pinning by run id is that what was resolved is what goes out.
- **The exclusivity guard holds the server for the whole sequence.** That is
  correct rather than coarse: converge and ship both mutate host-wide state.

`DeployRun.phase` reports which leg is live, as a field rather than something a
UI parses out of the log. It stays pointing at the leg a failed run died on.
The build leg awaits `runRelease` from `@plugins/release/server` — the reason
that engine became awaitable at all — because the build must be recorded in
`release_runs`, which only the engine can do.

### Converge's idempotence contract

A converge on an already-correct host must change nothing — re-running it is how
you inspect or repair one. Two rules in the generated script
(`cli/plugins/deploy/cli/internal/converge-script.ts`) carry that; a new step has to
honour both:

- **Every generated file lands through `put`**, which replaces the target only
  when the bytes differ — so an unchanged file keeps its mtime, and `[=]` is a
  comparison rather than a string the step assumed.
- **The restart is gated on the running process predating `env` / the unit**, not
  on what this run did. That also repairs an install whose last converge wrote a
  new `env` and died before restarting — which a "did I just change it" flag
  never would.

The child inherits `SINGULARITY_WORKTREE`, which is what makes the CLI act on the
same namespace as the app you clicked in: it reads the deployment record over HTTP
from `<worktree>.localhost:9000` and the server row from that worktree's DB fork,
both keyed on `currentWorktreeName()`.

### A run is recorded twice, and the two are not redundant

- **`deploy.runs`** — the **live view**: an in-memory `Map` projected into a push
  resource (the `release.previews` shape), bounded at one entry per deployment
  row, carrying `phase` so a running `update` reports which leg it is on. It is
  empty after a restart, and that is honest rather than lossy: the spawned CLI is
  **not detached**, so the restart took the run with it and nothing is running.
  (A child that outlived the map would be an invisible orphan nothing could
  report on, which is worse. Long unattended deploys belong on the CLI.)
- **`deploy_runs`** — the **record**: one row per launched run, so *what is live
  on this box, and what happened before* survives that restart. Queried back by
  `POST /api/deploy/deployments/:id/runs/query` (keyset, `deploy-history`'s
  section renders it), swept at 90 days.

Both are written by `internal/run-state.ts` and only there, and they share the
run's `id` so the two name one run. Two rules in that file look like fussiness
and are correctness:

- **`startRun` is synchronous and writes no row.** Its claim must sit in the same
  turn as `startDeployRun`'s exclusivity check — an `await` between them is a
  TOCTOU window two clicks walk through — and an INSERT cannot join that turn. So
  `recordRunStarted` opens the row as the first thing the async run body does. A
  ledger write that fails ends the run instead of deploying unrecorded.
- **`finishRun` pushes the live view before writing the row.** Progress must not
  wait on durability, and the history DataView refreshes off the
  `deploy.runs-revision` tick, which fires from the change feed after the row
  commits.

`commit_sha` comes from the pinned bundle's own manifest at the instant it
resolves, and is null wherever it genuinely is not (a converge; a bare `ship`,
whose bundle the CLI picks inside its own process). HEAD is never substituted.

The `deploy` log channel's `logs/deploy.jsonl` is still the deeper archive — the
full transcript, where the ledger holds the one-line outcome.

### The row is a list row; the record lives in the pane

The list row carries only what a person scans — composition, last run, and the
contributed `Release` state. The record's editable fields (hostnames, loopback
port) and the derived install names (`runUser` / `installDir` / `unit` /
`caddySite`, each a pure function of the composition name and therefore never
editable) live in the `overview` section of the row's own pane
(`dep/:deploymentId`), which is also where the `remote-deploy` section acts. The
pane is where a deploy is read and launched; the row's rigid trailing region only
holds the single-verb shortcuts, so the row navigates instead of growing.

There is deliberately **no log panel on the server page**: the pane's Output
section subscribes to the same `deploy` channel, and a second live subscription
to one channel — under a heading, on a page that no longer hosts the actions —
was duplication rather than a view. The channel replays its ring buffer on
subscribe, so the pane shows the last run's tail on open.

`DeploymentDetail` (sections) and `Deployments.Fields` (extra columns) are the
two slots that make that pane and that row extensible without this plugin naming
any consumer — the `Servers.Fields` ← `health.StatusField` precedent.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Deployments section of a server's page: this server's deployments as a DataView (composition, last run, plus contributed columns), an add affordance whose composition picker reads the compositions config, Converge / Ship row actions that launch the CLI, and the per-deployment pane whose sections (overview, plus contributed ones) carry the record, its derived install and the remote-deploy surface. Owns the deploy_deployments table: where a composition is served and under what URL ((composition × server) → { hostnames, loopbackPort }), its push live resource, and the CRUD endpoints. Also launches `./singularity deploy converge|ship` for a deployment — and orchestrates the `update` sequence (converge → build a candidate unless one is already current → ship that pinned run id) over the awaitable release engine — streaming the CLI's output into the durable `deploy` log channel, each run's phase and outcome into the in-memory `deploy.runs` live view, and every run into the durable `deploy_runs` ledger it serves back as a keyset history — the record that survives the restart the live view does not. The install itself — run user, dir layout, systemd unit, Caddy site — is derived in core/, never stored.
- Web:
  - Slots:
    - `DeploymentDetail.Section` ← `apps.deploy.composition`, `apps.deploy.deploy-history`, `apps.deploy.deployments`, `apps.deploy.local-serve`, `apps.deploy.remote-deploy`
    - `Deployments.Fields` ← `apps.deploy.remote-deploy`
    - `DeploymentItemActions` ← `apps.deploy.deployments`, `apps.deploy.local-serve`
    - `deploymentDetailPane.Actions` ← `primitives.pane`
  - Contributes:
    - `ServerDetail.Section` "Deployments" → `DeploymentsSection`
    - `Pane.Register` "deploy-deployment-detail"
    - `DeploymentDetail.Section` "Overview" → `DeploymentOverview`
    - `DeploymentItemActions` "converge" → `ConvergeAction`
    - `DeploymentItemActions` "ship" → `ShipAction`
    - `DeploymentItemActions` "delete" → `DeleteDeploymentAction`
  - Uses:
    - `apps/deploy/health.useServerHealth`
    - `apps/deploy/servers.ServerDetail`
    - `apps/deploy/servers.serverDetailPane`
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.fetchEndpoint`
    - `infra/endpoints.getEndpointErrorMessage`
    - `infra/endpoints.useEndpointMutation`
    - `plugin-meta/composition.useManifestItems`
    - `primitives/css/badge.Badge`
    - `primitives/css/bouncing-dots.BouncingDots`
    - `primitives/css/fill.Fill`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.DialogDescription`
    - `primitives/css/ui-kit.DialogTitle`
    - `primitives/css/ui-kit.Input`
    - `primitives/css/ui-kit.Select`
    - `primitives/css/ui-kit.SelectContent`
    - `primitives/css/ui-kit.SelectItem`
    - `primitives/css/ui-kit.SelectTrigger`
    - `primitives/css/ui-kit.SelectValue`
    - `primitives/data-view.CreateOption`
    - `primitives/data-view.DataView`
    - `primitives/data-view.defineDataView`
    - `primitives/data-view.defineFieldExtensions`
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.FieldDef`
    - `primitives/data-view.ItemActionProps`
    - `primitives/detail-sections.defineDetailSections`
    - `primitives/editable-field.useEditableField`
    - `primitives/icon-button.IconButton`
    - `primitives/imperative-dialog.openDialog`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useCombinedResources`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/pane.Pane`
    - `primitives/pane.PaneChrome`
    - `primitives/pane.useOpenPane`
    - `primitives/relative-time.RelativeTime`
  - Exports (values):
    - `DeploymentDetail`
    - `deploymentDetailPane`
    - `DeploymentItemActions`
    - `Deployments`
    - `useBlockedReason`
- Server:
  - Contributes:
    - `resource.declare` "deploy.deployments"
    - `resource.declare` "deploy.runs"
    - `resource.declare` "deploy.runs-revision"
  - Uses:
    - `apps/deploy/health.serverHealth`
    - `apps/deploy/servers._deployServers`
    - `config_v2.getConfig`
    - `database.db`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/paths.REPO_ROOT`
    - `infra/retention.defineRetention`
    - `primitives/data-view/server-query.augmentServerQuery`
    - `primitives/data-view/server-query.compileWhere`
    - `primitives/data-view/server-query.FieldColumnMap`
    - `primitives/data-view/server-query.OperatorSqlResolver`
    - `primitives/keyset.buildSortKeys`
    - `primitives/keyset.keyValuesOf`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
    - `primitives/log-channels.defineLogSink`
    - `release.runRelease`
    - `release/bundles.compareToHead`
    - `release/bundles.resolveBundle`
  - DB schema: `plugins/apps/plugins/deploy/plugins/deployments/server/internal/tables.ts`
  - Exports (values):
    - `_deployDeployments`
    - `_deployRuns`
    - `deploymentsServerResource`
  - Register: `defineJob('retention.deploy_runs')`
  - Resources:
    - `deploy.deployments` (push)
    - `deploy.runs` (push)
    - `deploy.runs-revision` (push)
  - Routes:
    - `GET /api/deploy/deployments`
    - `POST /api/deploy/deployments`
    - `GET /api/deploy/deployments/:id`
    - `PATCH /api/deploy/deployments/:id`
    - `DELETE /api/deploy/deployments/:id`
    - `POST /api/deploy/deployments/:id/run`
    - `POST /api/deploy/deployments/:id/runs/query`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `CreateDeploymentBody`
    - `Deployment`
    - `DeployPhase`
    - `DeployRun`
    - `DeployRunRecord`
    - `DeployVerb`
    - `InstallLayout`
    - `QueryDeployRunsBody`
    - `RunDeploymentBody`
    - `UpdateDeploymentBody`
  - Exports (values):
    - `CADDY_SITES_DIR`
    - `createDeployment`
    - `CreateDeploymentBodySchema`
    - `currentAppPath`
    - `DEFAULT_LOOPBACK_PORT`
    - `deleteDeployment`
    - `DEPLOY_LOG_CHANNEL`
    - `DeploymentSchema`
    - `deploymentsResource`
    - `DeployPhaseSchema`
    - `DeployRunRecordSchema`
    - `DeployRunSchema`
    - `deployRunsResource`
    - `deployRunsRevisionResource`
    - `DeployVerbSchema`
    - `deriveInstall`
    - `getDeployment`
    - `INSTALL_ROOT`
    - `listDeployments`
    - `listenAddress`
    - `LOOPBACK_HOST`
    - `loopbackOnlySentence`
    - `publicUrls`
    - `queryDeployRuns`
    - `QueryDeployRunsBodySchema`
    - `QueryDeployRunsResponseSchema`
    - `releaseAppPath`
    - `releaseDir`
    - `REMOTE_SCRIPT_SHEBANG`
    - `runDeployment`
    - `RunDeploymentBodySchema`
    - `SYSTEMD_INSTANCE`
    - `UNIT_TEMPLATE_PATH`
    - `updateDeployment`
    - `UpdateDeploymentBodySchema`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/composition`
    - `apps/deploy/deploy-history`
    - `apps/deploy/deployments/runs-arm`
    - `apps/deploy/local-serve`
    - `apps/deploy/remote-deploy`
- Sub-plugins:
  - **`runs-arm`** — The deploy arm's presence on the merged run surface: the kind's label, its eight own columns (verb, failed phase, server / deployment / composition / release-run / commit ids, exit code) as real filterable and sortable SQL dimensions, and the list row that renders the CLI's refusal text verbatim beside the leg of an update that died. Contributes no row activation — see the plugin's CLAUDE.md. The deploy arm of the unified run space: binds deploy_runs into the runs union — status folded into the shared outcome vocabulary through a typed map, a label naming the composition and the server it went to, the verb as both the shared trigger and its own enum dimension, and the CLI's refusal text as the shared message. Reads null for namespace: a deploy targets a remote server, not a worktree.

<!-- AUTOGENERATED:END -->
