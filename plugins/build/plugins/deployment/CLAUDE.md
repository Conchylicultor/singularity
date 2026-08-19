# deployment

One honest description of what is deployed, from which both the Build button's
chain and the auto-build decision are derived — so a wrong badge and a missed
rebuild are the same bug.

## The model

A **carrier** is a thing that executes repo code and can name the commit it was
materialized from. There are three:

| carrier  | pinned by                                          | moved by |
| -------- | -------------------------------------------------- | -------- |
| `server` | `git rev-parse HEAD` at module eval, re-checked at `onAllReady` | a build + restart |
| `web`    | `.build-commit` / `.build-graph` in the served dist | a build |
| `tab`    | the globals baked into the bundle it is running     | a reload |

`server` and `web` are the **deployable** carriers — the two a build can move.
The `tab` carrier is composed in client-side; the server cannot know it, and it
is deliberately absent from `deployable` so a tab nobody reloads can never mint a
build.

The **target** is this checkout's `HEAD`. No namespace branching: main's checkout
is on `main` and a worktree checkout is on its own branch, so `HEAD` is the target
in both, and git-watcher already tracks both refs.

## Everything else is derived

`core/derive.ts` holds the two answers, both pure and directly unit-testable
without db / config / git singletons (`core/derive.test.ts`):

- `convergenceOf(d)` → `converged | behind | diverged | unknown`
- `wantsBuild(d, lastAttempt)` → the ENTIRE auto-build policy

Two properties live there and nowhere else:

- **Termination.** `lastAttempt.commit === target` ⇒ no build. Without it a
  commit that cannot build rebuilds for ever, because a failed build leaves the
  carriers behind permanently. It is stated as its own fact rather than encoded
  in the choice of what to compare against — that encoding is what produced the
  2026-08-19 incident.
- **Deployable only.** `wantsBuild` ranges over `d.deployable`. A stale tab
  produces a reload affordance, never a build.

Every pin is `Resolvable`. A carrier that cannot name its commit says
`unresolved(reason)` — never a fake sha, never `""`. Three real cases: a release
bundle has no checkout; a dist published before the pin existed; and **mixed
boot**, where the checkout moved during the plugin import wave so the process is
genuinely a mix of two trees and no single commit is honest.

### Termination beats mixed boot — deliberately

An unresolved pin reads as *not converged*, so `convergenceOf` says `behind`.
But if that target has **already been attempted**, termination still wins and no
build is minted. The two properties pull against each other here, and this is how
it is resolved:

- Exempting unresolved pins from termination is an unbounded loop whenever a pin
  is unresolvable for a *persistent* reason — every build restarts the backend,
  the new process fails its module-eval sample again, and it rebuilds for ever.
  Termination is the only thing standing between the reconciler and that loop, so
  it does not get holes.
- The cost: **a mixed-boot server does not self-heal through auto-build.** It
  stays mixed until the target next moves (then it is an unattempted target, and
  it does build). Tolerable because mixed boot requires the checkout to move
  during the import wave, the state is now loudly visible in the chain rather
  than silent, and **a manual Build bypasses `wantsBuild` entirely** — that is
  the escape hatch for a server wedged this way.

If you are here because a backend is stuck reporting mixed boot: press Build.
That is working as designed, not a bug to fix by weakening termination.

## Why it is a leaf

`deployment/**` must NEVER import `build/server`. The reconciler
(`build/server/internal/reconcile.ts`) lives where `triggerBuild` already is and
imports DOWN into this plugin. That direction is what keeps the plugin graph a
DAG. If you find yourself wanting the reverse edge, the thing you want belongs
in the reconciler.

## Where the answer comes from and when it changes

`readDeploymentState()` is the wire payload; `readDeployment()` projects the raw
facts back out of it for the reconciler — **one read, two consumers**, so the
badge and the build decision cannot be computed from different git snapshots.

`deploymentResource` recomputes on exactly two edges — a tracked ref advancing
(`dependsOn: refHeadResource`) and an explicit `notify()` when a build
republishes the dist. Nothing polls it.

**Everything expensive is behind a `createSignedMemo`.** The whole answer is a
function of four cheap inputs (target sha, server pin, `.build-commit`,
`.build-graph`), which is an exact signature — not an over-approximation. That
matters because `refs/heads/main` is tracked in every backend on the host, so one
push to main wakes this loader 100+ times; in all but one the target is that
worktree's own branch, unmoved, and the recompute collapses to the single
`rev-parse` the probe already costs. The same bound signature feeds `revalidate`,
so a resubscribe herd is answered "still current" without a recompute.

Deliberately **not** behind `withHeavyReadSlot`: post-memo the compute runs once
per build (or per advance of this checkout's own branch), and its body is two
`merge-base` probes plus a log walk bounded by how far a checkout drifts between
builds. `host-read-pool` leaves cheap interactive git ungated, and this paints
the Build button.

The resource is a scalar `push` resource and is explicitly exempt from the
membership-bounded rule for DB-backed collections — see
`research/2026-07-18-global-bounded-working-set-resource-contract.md:225`, which
names `mainAheadCount` (this resource's direct ancestor) as the precedent.

## `sameCommit` is tolerance for the past, not the mechanism

Both writers of `build_runs.commitHash` now store the FULL sha — the backend's
`getHeadCommit()`, and the CLI's ledger mint, which records the same
`headAtStart` it stamps into the dist as `.build-commit`. Do not "simplify" one
back to `rev-parse --short`: an abbreviated row against a 40-char pin makes the
termination comparison silently always-false, and a commit that cannot build
would rebuild for ever. `sameCommit` stays only because rows written before that
change are still in the column.

## Background

`research/2026-08-19-global-deployment-convergence-carriers.md` — the incident
this replaces (a push landing 13 s before a build finished, three separate
convergence mechanisms all missing it) and the design.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: The client half of the deployment description: `useDeployment()` composes THIS tab's own baked pin in beside the server's two deployable carriers, and `<DeploymentChain/>` renders the four arms — one commit row when converged, the chain with a carrier chip on each carrier's own commit when behind, and the raw pins plus the reason when there is no line to draw. Also eagerly registers the boot-critical build.deployment resource descriptor so boot-snapshot can hydrate it before first paint. The deployment description: this checkout's HEAD (the target) plus a pin per deployable carrier — the backend process and the frontend bundle it serves — and the one derived verdict (converged / behind / diverged / unknown) both the Build button and the auto-build decision read. A leaf: it never imports build/server, so the reconciler that owns triggerBuild can import DOWN into it.
- Server:
  - Contributes: `resource.declare` "build.deployment"
  - Uses:
    - `build/server-build-id.getServerCommit`
    - `build/server-build-id.getServerGraphHash`
    - `infra/git-read-cache.createSignedMemo`
    - `infra/git-watcher.refHeadResource`
    - `infra/paths.currentWorktreeName`
    - `infra/paths.GIT`
    - `infra/paths.REPO_ROOT`
    - `primitives/commit-list.LOG_FORMAT`
    - `primitives/commit-list.parseGitLog`
    - `primitives/commit-list.runGit`
    - `primitives/commit-list.tryRunGit`
    - `primitives/commit-list.WorktreeGoneError`
  - Exports (values):
    - `deploymentResource`
    - `readDeployment`
    - `readDeploymentState`
    - `serverPin`
  - Resources: `build.deployment` (push)
- Web:
  - Uses:
    - `primitives/commit-list.COMMIT_ROW_HEIGHT`
    - `primitives/commit-list.CommitRail`
    - `primitives/commit-list.CommitRowItem`
    - `primitives/css/badge.Badge`
    - `primitives/css/fill.Fill`
    - `primitives/css/inline.Inline`
    - `primitives/css/line.Line`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/rigid.rigidClass`
    - `primitives/css/scroll.Scroll`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
  - Exports (types): `DeploymentReading`
  - Exports (values):
    - `DeploymentChain`
    - `useDeployment`
- Core:
  - Uses:
    - `primitives/commit-list.CommitRowSchema`
    - `primitives/live-state.Resolvable`
    - `primitives/live-state.resolvableSchema`
    - `primitives/live-state.resolved`
    - `primitives/live-state.resourceDescriptor`
    - `primitives/live-state.unresolved`
  - Exports (types):
    - `BuildAttempt`
    - `Carrier`
    - `CarrierId`
    - `ConvergenceKind`
    - `Deployment`
    - `DeploymentState`
  - Exports (values):
    - `CARRIER_IDS`
    - `CarrierIdSchema`
    - `CarrierSchema`
    - `convergenceOf`
    - `deploymentOf`
    - `deploymentResource`
    - `DeploymentStateSchema`
    - `sameCommit`
    - `wantsBuild`
- Cross-plugin:
  - Imported by: `build`

<!-- AUTOGENERATED:END -->
