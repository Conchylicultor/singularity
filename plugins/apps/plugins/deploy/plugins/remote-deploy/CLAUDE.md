# remote-deploy

**One button** that puts a new version of one composition on its server. Design:
[`research/2026-08-05-global-deploy-pane-test-locally-and-one-button-deploy.md`](../../../../../../research/2026-08-05-global-deploy-pane-test-locally-and-one-button-deploy.md)
(Phase A). Supersedes the four-step Converge → Build → Rehearse → Ship surface of
[`2026-08-03-global-deploy-release-candidate-pipeline.md`](../../../../../../research/2026-08-03-global-deploy-release-candidate-pipeline.md).

This plugin contributes `deploy` + `output` into `DeploymentDetail.Section` and
`release` into `Deployments.Fields`. It owns **no** sequencing: pressing Deploy
POSTs `{ verb: "update" }` and everything after that is the `deployments`
sibling's server-side orchestrator.

## Why the four steps collapsed into one

The pipeline was a faithful rendering of a real constraint chain — `ship` refuses
on an un-converged host, and refuses without a packed, platform-matched bundle. It
*exposed* the chain because at the time nothing sequenced it. Two facts made it
automatable:

1. **Converge is genuinely a no-op the second time.** Every file write goes
   through a content-comparing `put` and the unit restart is gated on the running
   process predating its configuration, so running it before every ship costs a
   warm host nothing and repairs drift on a cold one.
2. **The bundle question already had one authority.** `resolveBundle` +
   `compareToHead` answer *"is there a shippable bundle for this (composition,
   platform), and was it built from clean HEAD"* — so "do I need to build?" is a
   computed answer, not a question to ask the user.

The steps did not disappear; they became the **phases of one run**, reported as
they happen. `Steps`/`Step` is still what renders them, now purely as a **report**
— nothing inside a step is clickable, because the sequence belongs to the server.
A failed run leaves `phase` at the leg it died on, which is what makes the strip
worth keeping on screen after the run ends.

**The ship confirm dialog is gone.** It existed to make *"you never rehearsed
this"* deliberate. A confirm on the app's one primary action is friction, not
safety; `ship`'s remote health gate and its automatic revert are the real
protection and are untouched.

## Nothing here re-derives shippability

`GET /api/release/candidate` returns the exact `BundleResolution` that
`./singularity deploy ship` acts on; refusals render through
`bundleRefusalMessage()` **verbatim**. The platform is never a picker — it comes
from the server's health probe, the same argument that keeps `runUser` derived.
The copy of it read here only *labels* the button: the orchestrator reads the
same fact server-side, so no client can name a platform.

A refusal is **not** a blocker for the button. Deploy builds what is missing, so
the refusal is rendered as *what Deploy would have to start from*, not as a wall.

## Two questions, gated together

`useReleaseInfo` reports `state: null` until both land, so a half-loaded snapshot
never paints as a state:

- **filesystem** — the candidate endpoint, refetched on the
  `release.history-revision` tick (a per-composition live resource would be
  unbounded, which the working-set contract forbids);
- **DB** — the newest run of that composition, the only way to know a build is
  running or that the last one failed. The engine's in-flight uniqueness is
  `(namespace, composition)`, so a staged Studio run really does block a
  candidate build here.

## The Output tab follows the phase

An `update`'s middle leg writes to the `release` channel while the two around it
write to `deploy`. A fixed tab would therefore go silent for the longest part of
the run, and the user would need to know the channel topology to find the output.
So the switcher's active tab follows `DeployRun.phase` **until the user picks a
tab by hand** — after which the choice is theirs for the rest of the mount.

## The inspect links

`publicUrls(deployment.hostnames)` from `deployments/core/derive.ts` — the
declared owner of remote-host facts — mirrors what the CLI prints at the end of a
successful ship. A deployment with no hostname renders `loopbackOnlySentence()`
instead of nothing: "no public URL" is an answer about the deployment, and a
blank region answers it by implication.

## The `Release` column states what Deploy would pick up

```
building → failed (ONLY when no bundle exists at all) → none
→ platform-mismatch → stale → built
```

A build that failed while a good bundle still exists does **not** read `failed` —
ship would still pick the older bundle, so the failure belongs on the run, where
the log is. `unknown` staleness (dirty build / absent sha) is **not** `stale`:
unprovable is not out-of-date, and in an active worktree most candidates read
unknown.

It reaches the list through `Deployments.Fields`, so `deployments` never names
this feature. A field extension mounts once per surface but the answer is per
`(composition, platform)` — hence one headless `CandidateProbe` per row folding
into a map that `value` reads synchronously, so filter/group/sort agree with the
chips instead of trailing them by a render.

## What this still does not claim

Nothing local ever runs the bytes that ship (a `linux-x64` binary cannot execute
on this host). The **Test locally** section above it
([`local-serve`](../local-serve/CLAUDE.md)) serves the composition's namespace on
the shared gateway, which checks composition membership and closure — not the
packed artifact. The only thing that exercises the artifact is `ship`'s own
remote health gate.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Deploy one composition to its remote server: a single Deploy button launching the `update` sequence (converge → build a platform-pinned candidate unless one is already current → ship that pinned run id), the three-phase report of the running deploy, what is currently built and how it relates to HEAD, the public URLs to inspect the deployed app, the phase-following deploy/build log output section, and the `Release` column contributed into the deployments list.
- Web:
  - Contributes:
    - `DeploymentDetail.Section` "Deploy to server" → `RemoteDeploySection`
    - `DeploymentDetail.Section` "Output" → `OutputSection`
    - `Deployments.Fields` "release" → `ReleaseField`
  - Uses:
    - `apps/deploy/deployments.DeploymentDetail`
    - `apps/deploy/deployments.Deployments`
    - `apps/deploy/deployments.useBlockedReason`
    - `apps/deploy/health.useServerHealth`
    - `apps/deploy/health.useServerHealthMap`
    - `infra/endpoints.useEndpoint`
    - `infra/endpoints.useEndpointMutation`
    - `primitives/css/badge.Badge`
    - `primitives/css/bouncing-dots.BouncingDots`
    - `primitives/css/cluster.Cluster`
    - `primitives/css/link-chip.LinkChip`
    - `primitives/css/placeholder.Placeholder`
    - `primitives/css/spacing.Stack`
    - `primitives/css/status-dot.StatusDot`
    - `primitives/css/text.Text`
    - `primitives/css/ui-kit.Button`
    - `primitives/live-state.matchResource`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useCombinedResources`
    - `primitives/live-state.useResource`
    - `primitives/loading.Loading`
    - `primitives/log-channels.LiveLogChannel`
    - `primitives/relative-time.RelativeTime`
    - `primitives/setup-steps.Step`
    - `primitives/setup-steps.StepNote`
    - `primitives/setup-steps.Steps`
    - `primitives/setup-steps.StepState`
    - `primitives/view-switcher.useActiveViewId`
    - `primitives/view-switcher.ViewSwitcher`
- Core:
  - Exports (types):
    - `ReleaseState`
    - `ReleaseStateInput`
  - Exports (values):
    - `RELEASE_STATE_OPTIONS`
    - `releaseStateLabel`
    - `resolveReleaseState`
    - `shortSha`
    - `stalenessChipLabel`
    - `stalenessSentence`

<!-- AUTOGENERATED:END -->
