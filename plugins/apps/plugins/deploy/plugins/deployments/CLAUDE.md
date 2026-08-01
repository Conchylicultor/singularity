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
(CLI) / Studio (UI) already uses. The endpoint owns two verdicts and no others:

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

### Converge's idempotence contract

A converge on an already-correct host must change nothing — re-running it is how
you inspect or repair one. Two rules in the generated script
(`cli/bin/commands/internal/converge-script.ts`) carry that; a new step has to
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

### There is no run table, on purpose

D4 adds no run ledger (see `plugins/release/CLAUDE.md`'s deploy handoff note), and
neither does the UI. A run's live state is an in-memory `Map` projected into the
**`deploy.runs`** push resource — the `release.previews` shape, not the
`release_runs` one — bounded at one entry per deployment row. Two consequences,
both accepted:

- the spawned CLI is **not detached**, so a backend restart takes the run with it
  and the map is empty afterwards. A child that outlived the map would be an
  invisible orphan nothing could report on, which is worse. Long unattended
  deploys belong on the CLI.
- the durable record is the channel's `logs/deploy.jsonl`, which survives that
  restart.

### The derived install names are visible, not editable

The section's DataView carries `runUser` / `installDir` / `unit` / `caddySite` as
fields with **no `onEdit`** — read-only by construction, since each is a pure
function of the composition name. They live in the committed `Install` table view
(`config/apps/deploy/deployments/deploy.deployments.jsonc`) so the model is
inspectable on demand without four read-only strings crowding the row a person
actually edits.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Deployments section of a server's page: this server's deployments as a DataView (composition, hostnames, loopback port, last run, plus the derived install names read-only), an add affordance whose composition picker reads the compositions config, Converge / Ship row actions that launch the CLI, and the live deploy log panel. Owns the deploy_deployments table: where a composition is served and under what URL ((composition × server) → { hostnames, loopbackPort }), its push live resource, and the CRUD endpoints. Also launches `./singularity deploy converge|ship` for a deployment, streaming the CLI's output into the durable `deploy` log channel and its outcome into the in-memory `deploy.runs` resource. The install itself — run user, dir layout, systemd unit, Caddy site — is derived in core/, never stored.
- Web:
  - Slots: `DeploymentItemActions.DeploymentItemActions` ← `apps.deploy.deployments`
  - Contributes:
    - `Deploy.Section` "Deployments" → `DeploymentsSection`
    - `DeploymentItemActions` "converge" → `ConvergeAction`
    - `DeploymentItemActions` "ship" → `ShipAction`
    - `DeploymentItemActions` "delete" → `DeleteDeploymentAction`
  - Uses:
    - `apps/deploy/health.useServerHealth`
    - `apps/deploy/shell.Deploy`
    - `infra/endpoints.EndpointError`
    - `infra/endpoints.getEndpointErrorMessage`
    - `infra/endpoints.useEndpointMutation`
    - `plugin-meta/composition.useManifestItems`
    - `primitives/auto-scroll.JumpToBottomButton`
    - `primitives/auto-scroll.useStickyScroll`
    - `primitives/css/badge.Badge`
    - `primitives/css/bouncing-dots.BouncingDots`
    - `primitives/css/fill.Fill`
    - `primitives/css/pin.Pin`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/css/ui-kit.ControlSizeProvider`
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
    - `primitives/data-view.defineItemActions`
    - `primitives/data-view.FieldDef`
    - `primitives/data-view.ItemActionProps`
    - `primitives/icon-button.IconButton`
    - `primitives/imperative-dialog.openDialog`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.useCombinedResources`
    - `primitives/live-state.useResource`
    - `primitives/networking.useReconnectingWebSocket`
    - `primitives/relative-time.RelativeTime`
    - `primitives/row-actions.RowActionButton`
    - `primitives/section-card.SectionCard`
    - `shell/notifications.toast`
  - Exports (values): `DeploymentItemActions`
- Server:
  - Contributes:
    - `resource.declare` "deploy.deployments"
    - `resource.declare` "deploy.runs"
  - Uses:
    - `apps/deploy/servers._deployServers`
    - `config_v2.getConfig`
    - `database.db`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/paths.REPO_ROOT`
    - `primitives/log-channels.defineLogSink`
  - DB schema: `plugins/apps/plugins/deploy/plugins/deployments/server/internal/tables.ts`
  - Exports (values):
    - `_deployDeployments`
    - `deploymentsServerResource`
  - Resources:
    - `deploy.deployments` (push)
    - `deploy.runs` (push)
  - Routes:
    - `GET /api/deploy/deployments`
    - `POST /api/deploy/deployments`
    - `GET /api/deploy/deployments/:id`
    - `PATCH /api/deploy/deployments/:id`
    - `DELETE /api/deploy/deployments/:id`
    - `POST /api/deploy/deployments/:id/run`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `CreateDeploymentBody`
    - `Deployment`
    - `DeployRun`
    - `DeployVerb`
    - `InstallLayout`
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
    - `DeployRunSchema`
    - `deployRunsResource`
    - `DeployVerbSchema`
    - `deriveInstall`
    - `getDeployment`
    - `INSTALL_ROOT`
    - `listDeployments`
    - `listenAddress`
    - `LOOPBACK_HOST`
    - `releaseAppPath`
    - `releaseDir`
    - `REMOTE_SCRIPT_SHEBANG`
    - `runDeployment`
    - `RunDeploymentBodySchema`
    - `SYSTEMD_INSTANCE`
    - `UNIT_TEMPLATE_PATH`
    - `updateDeployment`
    - `UpdateDeploymentBodySchema`

<!-- AUTOGENERATED:END -->
