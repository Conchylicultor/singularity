# serve-composition

The **serve capability** for a composition: build it into its own frontend dist
and empty database and serve it live at `http://<id>.localhost:9000`. It owns no
surface of its own — it exports the pieces its hosts render:

- `ServeTargetPanel({ item, status })` — the **Serve live** target panel: the
  `Serve`/`Serving` `ToggleChip`, and — only when the composition is genuinely
  served — the live-URL `LinkChip`, its commit + build time, and **Reset**.
- `useServeComposition()` — `{ serve, stop }`. `serve(id)` persists the intent
  (`setAutoBuild(id, true)`) **and** POSTs `serveCompositionEndpoint`
  (`@plugins/build/core`) to kick an immediate main build, so the live URL is
  ready without waiting for the next full build. `stop(id)` is flag-only
  (`setAutoBuild(id, false)`); the composition is simply not served on the next
  full build.
- `useServeStatus(namespace)` — the liveness read (below).

Hosts today: Studio's **Build & serve** section and Compositions list, and the
deploy pane's **Test locally** section
(`apps/deploy/local-serve`).

## Why it lives under `build`, not under Studio

It used to be `apps/studio/compositions/auto-serve`. Nothing about it was ever a
Studio concern: it depends only on `plugin-meta/composition`, `build/core`,
`infra/*` and primitives. When the deploy pane needed the same capability, keeping
it there would have created the repo's **first `apps/X → apps/Y` import edge** —
there are none, and one app reaching into another app's subtree is exactly the
coupling the plugin boundaries exist to prevent.

`build` is where it belongs on the merits: `build` already owns
`POST /api/build/serve` and the CLI's `compose-serve` stage, which is the thing
this plugin's controls start and whose output they report. The move introduces no
cycle — `build` and `plugin-meta` have no edge in either direction — and the
routes moved with it (`/api/build/serve/{status,reset}`), so no path claims a
Studio namespace it no longer belongs to. Design:
[`research/2026-08-05-global-deploy-pane-test-locally-and-one-button-deploy.md`](../../../../research/2026-08-05-global-deploy-pane-test-locally-and-one-button-deploy.md)
(Phase B).

To keep the import graph a DAG this plugin still imports none of its hosts; the
edges all run inward (`studio/compositions → serve-composition`,
`studio/compositions/release → serve-composition`,
`deploy/local-serve → serve-composition`).

## Intent is not liveness

`autoBuild` is a **declared intent** stored in main's `compositions` config. The
truth is the `composition.json` **marker** `compose-serve` writes into the
namespace dir before it composes anything, and sweeps on deactivation. The two
disagree routinely — the enabling build has not run yet, or it failed, or the
toggle was flipped from a worktree whose config has not landed on main — and a
surface that reads `autoBuild` as liveness offers a link to a namespace that
502s.

So `GET /api/build/serve/status?composition=<namespace>` reads the marker and
answers two questions at once:

- `liveness` — `{ served: false }` or `{ served: true, commit, builtAt }`. A
  discriminated union, so a missing commit cannot be read as a live serve. The
  marker is on the shared filesystem, so **any** backend can answer this.
- `canServe` — whether a serve build can be *started here*. `compose-serve` reads
  MAIN's config inside MAIN's build, so every other namespace can only observe.
  Server truth (`isMain()`), not a hostname the client sniffs, so a surface
  refuses up front rather than after a POST that would be refused anyway.

`canServe` **disables the toggle here**; only its refusal *sentence* is the
host's to place (the deploy pane leads with it, Studio's caption already states
the rule — hence not printed twice). A control that cannot succeed must not be
pressable, the same argument that makes an `upcoming` step inert; leave that to
hosts and two surfaces end up disagreeing about one fact.

`useServeStatus` returns that as a discriminated `ServeStatus`
(`pending | error | ready`) — a failed read is a state a host renders, never an
absence that reads as "not served". Freshness is push-based: it refetches when
the newest terminal `build.history` run for this namespace (or for `main`, which
hosts the compose-serve stage) changes. Nothing polls.

`commit` comes from the marker, which `compose-serve` stamps with the build's
`buildCommit`. Markers written before that field existed carry none and report
`null` — unknown, never guessed.

`ServeTargetPanel` takes `status` as a **prop** rather than calling the hook, so
a host that already needs the answer for an affordance of its own (a list row's
serve shortcut) asks once and hands the same snapshot to the panel.

## Reset to first-launch

Once a composition is served, the panel also shows a destructive **Reset** button
next to the serve-URL chip. It opens a confirm dialog and, on confirm, `POST`s
`resetCompositionData` (`/api/build/serve/reset`), which wipes *only that one
composition's* Postgres DB `<id>` and config dir `~/.singularity/config/<id>/`
back to exactly what `compose-serve` provisions on a fresh serve, then restarts
its backend — so the author sees the genuine new-user experience. It is a
**narrower `reapAttempt`**: the spec + dist + code are kept (the app stays
served); only DB + config are reset.

The config is **re-propagated**, not merely deleted: a bare `rm -rf` would fall
back to *code* defaults, whereas re-running `propagateConfigToUser` restores the
shipped **git-layer** first-launch defaults `serveOne` installs.

**Main is never touched.** `server/internal/reset.ts` gates on four checks, and
throws `CompositionResetError` (nothing touched) if any fails:

1. `assertServableCompositionNamespace(id)` — rejects the reserved
   `{central, singularity, main}` namespaces. The explicit "never main" gate.
2. `hasCompositionMarker(id)` — the `composition.json` provenance marker must
   exist (proves compose-serve owns this namespace).
3. `namespaceCollision(id, probeNamespace(root, id)) === null` — no real git
   worktree dir / branch / marker-less spec dir of that name.
4. `id` is currently `autoBuild: true` in **main's** resolved config
   (belt-and-suspenders; deactivation sweeps the marker, so 2 already implies it).

### In scope vs out of scope

- **In scope:** the composition's DB `<id>` and its config dir. Both are named by
  the composition id, so the reset is provably confined to that one namespace.
- **Out of scope (deliberately ignored):** central secrets / auth tokens. They
  live in one global encrypted store (`~/.singularity/secrets.json.enc`) shared by
  every namespace under the single-instance-per-user architecture
  ([ADR](../../../../research/2026-07-02-global-adr-single-instance-per-user.md)),
  carry no per-composition dimension, and are not part of this reset. Documented,
  not worked around.

Both endpoint contracts live in `shared/endpoints.ts` (imported by both this
plugin's own web and server); the tolerant gateway restart (404 = not running,
gateway-down = fine) mirrors `compose-serve`'s, minus the CLI-only
`getAdminPool().end()`.

## The namespace is the item's `id`, never its name

`compose-serve` owns `worktrees/<item.id>/` and the gateway serves it at
`<item.id>.localhost:9000`. For UI-created compositions `id` is a uuid while
`name` is whatever the user typed, so the two genuinely diverge — every consumer
of this plugin must resolve to the **item**, and pass its `id`. The deploy app,
which is name-keyed throughout, looks the item up by `name` and then hands the
`id` here.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Serve capability for a composition: the live-serve toggle panel, the enable→build hook, and the served-liveness read (the composition.json marker, not the autoBuild intent). Consumed by Studio's Build & serve section and compositions list, and by the deploy pane's Test locally section. Serve-liveness read for a composition namespace (is it actually served, and can this backend start one) plus the reset-to-first-launch endpoint: wipes ONLY that composition's DB + config back to what compose-serve provisions on a fresh serve, then restarts its backend. Never touches main.
- Web:
  - Uses:
    - `infra/endpoints.useEndpoint`
    - `infra/endpoints.useEndpointMutation`
    - `plugin-meta/composition.useManifestActions`
    - `primitives/css/badge.Badge`
    - `primitives/css/link-chip.LinkChip`
    - `primitives/css/spacing.Stack`
    - `primitives/css/text.Text`
    - `primitives/css/toggle-chip.ToggleChip`
    - `primitives/css/ui-kit.Button`
    - `primitives/imperative-dialog/confirm.confirmDialog`
    - `primitives/live-state.ResourceResult`
    - `primitives/live-state.useResource`
    - `primitives/relative-time.RelativeTime`
    - `shell/toast.showToast`
  - Exports (types): `ServeStatus`
  - Exports (values):
    - `ServeTargetPanel`
    - `useServeComposition`
    - `useServeStatus`
- Server:
  - Uses:
    - `database/admin.databaseExists`
    - `database/admin.dropDatabase`
    - `database/admin.ensureDatabase`
    - `database/zero/cache-service.dropZeroReplicationArtifacts`
    - `infra/endpoints.implement`
    - `infra/paths.isMain`
    - `infra/paths.MAIN_WORKTREE_NAME`
    - `infra/paths.SINGULARITY_DIR`
    - `infra/worktree.ensureMainWorktreeRoot`
    - `infra/worktree.hasCompositionMarker`
    - `infra/worktree.namespaceCollision`
    - `infra/worktree.probeNamespace`
    - `infra/worktree.readCompositionMarker`
  - Routes:
    - `POST /api/build/serve/reset`
    - `GET /api/build/serve/status`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/local-serve`
    - `apps/studio/compositions`
    - `apps/studio/compositions/release`

<!-- AUTOGENERATED:END -->
