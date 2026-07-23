# release

Reusable engine for the **local composition release lifecycle** (F4): run a
release, observe live progress/logs, see the artifact, and launch/preview it
locally. A sibling of the `build` plugin and modeled on it shape-for-shape
(durable pid-claim, detached `Bun.spawn`, line streaming into a `Log.channel`,
orphan reconcile on boot, a partial unique inflight index). The Studio app is the
first UI consumer; the engine ships no UI of its own. Its web barrel
(`web/index.ts`) is **registration-only** — a side-effect import
(`web/internal/register.ts`) that eagerly pulls `@plugins/release/core` into the
web import graph so the boot-critical `release.previews` ResourceDescriptor
self-registers before first paint. This must live with the resource OWNER: the
descriptor is read only by the Studio release pane, which is lazy-loaded, so
nothing else guarantees eager registration and boot-snapshot would otherwise file
a crash report every boot. (The composition-scoped history now flows through the
non-boot-critical `release.run` per-id resource + `release.history-revision`
tick + the `queryReleaseHistory` keyset endpoint, which need no eager
registration.)

## How it works

- **Targets** (`core/targets.ts`) are a closed list both runtimes import —
  `RELEASE_TARGETS` is the single source of truth (web picker + server validator
  build from it). Not a slot: adding `tauri` (F5) is one line here. The icon stays
  web-only (the server never imports a UI component).
- **Run model** (`server/internal/run-release.ts`) wraps `./singularity release
  --composition <c> --target <t> --dev --out <short-dir>`. It spawns the CLI
  detached and tracks it by OS pid in `release_runs.pid` — the restart-durable
  lock. The inflight unique index is scoped by **(namespace, composition)**:
  concurrent releases of *different* compositions are legitimate; a duplicate
  in-flight release of the *same* composition is rejected (23505 → no-op).
- **`--no-restart` ownership.** The release CLI passes `--no-restart` to its nested
  build, so it does **not** restart this backend (unlike build). The spawning
  backend survives the whole release; pid-liveness + boot reconcile gives
  restart-durability — ownership is *more* stable than build's.
- **Versioned out-dir.** `releaseOutDir` (in `server/internal/out-dir.ts`) roots
  each release at `<SINGULARITY_DIR>/releases/<worktree>/<comp>-<target>/<run-id>/`
  — versioned per run, not overwrite-in-place, so builds are kept and a `latest`
  symlink (written by the CLI) points at the current `<run-id>`. The 104-byte
  Unix-socket cap no longer constrains this path: `launcher/bin/launch.ts` reroots
  the embedded-PG, PgBouncer, and gateway per-worktree backend sockets onto short
  `/tmp` dirs — the PG/PgBouncer sockets to a `/tmp/sgs-XXXXXX` dir via
  `SINGULARITY_PG_SOCKET_DIR`, the backend worktree sockets to a `/tmp/sgw-XXXXXX`
  dir via `SINGULARITY_SOCKETS_DIR` — so a long `<run-id>` is safe even for a
  direct `<out>/launch`. For **preview**, the data root is a `/tmp/sgp-XXXXXX`
  mkdtemp — short by construction.
- **Preview** (`server/internal/preview-manager.ts`) spawns the staged `launch`
  binary with `SINGULARITY_DIR=<tmp>` + `PORT=<free>`, tracked in an in-memory
  Map projected into the `release.previews` external resource. Stop kills the
  process group and removes the data dir. Boot reconcile reaps dead previews.

## Public surface (for the Studio UI)

- `@plugins/release/core` — `RELEASE_TARGETS`, `releaseTargetById`,
  `RELEASE_LOG_CHANNEL` (`"release"`), the endpoints
  (`triggerReleaseEndpoint`, `previewEndpoint`, `stopPreviewEndpoint`,
  `releaseLogsEndpoint`, `queryReleaseHistory` — the composition-scoped
  keyset history query), and the resources/schemas (`ReleaseRun`,
  `releaseRunResource` — per-id run detail, `releaseRunsRevisionResource` —
  the history invalidation tick, `previewStateResource`/`Preview`).

## Discovery

For agent-run / standalone CLI releases, the **canonical filesystem path is the
registry** — there is no DB query. To find releases:

1. List `~/.singularity/releases/<worktree>/` — one `<comp>-<target>/` dir per
   composition+target, each holding versioned `<run-id>/` dirs plus a `latest`
   symlink.
2. Follow `<comp>-<target>/latest` → the current `<run-id>/`.
3. Read `<run-id>/RELEASE.json` — self-describing: `composition`, `target`,
   `platform`, `builtAt`, `port`, `runId`.
4. The shippable bundle lives inside `<run-id>/`:
   - **tauri** → `<run-id>/bundle/<Name>.app` and `<Name>.dmg`
   - **web** → `<run-id>/dist/<comp>-<target>-<platform>` (self-extracting binary)

Standalone CLI releases are **deliberately NOT recorded in `release_runs`** —
that table is the Studio engine's dev/preview history only. Discoverability for
hand-run releases is the path + `latest` symlink + `RELEASE.json`, not a registry
query, keeping the CLI cleanly DB-free.

## Testing a release renders (end-to-end)

A built stack being *up* (processes alive, gateway listening) does **not** prove
the app *renders* — the original desktop bug was "Starting… → black screen": the
backend booted but the SPA never mounted on the bare default-namespace route the
webview navigates to. Always verify the actual render.

**The harness: [`e2e/release-boot-verify.ts`](e2e/release-boot-verify.ts).**
It loads a URL in headless Chromium and asserts the SPA truly mounted — `#root`
has a real tree (>10 nodes, re-checked after a settle window to catch
mount-then-crash), **zero** console/page errors, and no gateway↔backend 502/404
request storm on `/api` `/ws` `/zero`. Exit 0 = PASS.

```bash
bun plugins/release/e2e/release-boot-verify.ts --url http://localhost:<port>/ --settle 15000
```

Always point it at the **bare default-namespace URL** (`http://localhost:<port>/`,
no `.localhost` subdomain) — that is the exact route the Tauri webview uses and
the one that reproduces the desktop path. `<port>` is `RELEASE.json → port`
(default `9100`). Optional `--expect-text "<substr>"` / `--expect-selector <css>`
add content assertions; a wrong selector fails the run even when the app rendered
fine, so pick one that genuinely marks the surface.

**Web target** — stage with `--dev`, run the launcher, verify against it:

```bash
./singularity release --composition <c> --target web --dev   # stages <out>/
<out>/launch &                                                # self-roots data under <out>/data
bun plugins/release/e2e/release-boot-verify.ts --url http://localhost:9100/ --settle 15000
```

**Tauri target** — build the `.app`, launch it, verify the served content **and**
the real window:

```bash
./singularity release --composition <c> --target tauri        # builds <out>/bundle/<Name>.app
open "<out>/bundle/<Name>.app"                                 # brings up the embedded stack on RELEASE.json port
bun plugins/release/e2e/release-boot-verify.ts --url http://localhost:9100/ --settle 15000
```

The harness covers the *served bytes* (identical to what the WKWebView loads,
same origin). To also confirm the **native window** paints — the one thing a
headless browser can't — capture the real WKWebView window on macOS via
CoreGraphics (no Screen-Recording-blocked full-screen grab needed):

```bash
open -a "<Name>"; sleep 2
cat > /tmp/winid.swift <<'SW'
import CoreGraphics; import Foundation
let opts = CGWindowListOption(arrayLiteral: .optionOnScreenOnly, .excludeDesktopElements)
for w in (CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String:Any]] ?? []) {
  let owner = (w[kCGWindowOwnerName as String] as? String) ?? ""
  if (owner.contains("<Name>") || owner.lowercased().contains("equin")),
     (w[kCGWindowLayer as String] as? Int) == 0,
     let n = w[kCGWindowNumber as String] as? Int { print(n); exit(0) }
}
exit(2)
SW
screencapture -o -x -l"$(swift /tmp/winid.swift)" /tmp/app-window.png
```

A **fresh** release boots an empty app-data DB, so data-backed surfaces are
legitimately empty — distinct from a config-driven surface, which now renders its
committed defaults. Two release-completeness gaps that once left config-driven
surfaces (the worked example was Sonata's Library view tabs → "No views
configured") empty are both **closed** — verified end-to-end by cutting a Sonata
release and confirming the Cards/All/Longest/Composed tabs + toolbar render:

1. **config_v2 defaults are vendored + reachable.** `release.ts` step 3.6 ships
   the git-layer `config/` tree and a `propagateConfigToUser`-resolved
   `config-seed/`; `launch.ts` points `SINGULARITY_REPO_CONFIG_DIR` at the former
   and seeds the latter into `<data>/config/<worktree>` (copy-if-absent) on first
   boot. So `config-v2.values` resolves the real defaults at runtime (verified: the
   full value, e.g. the 4 Library views, reaches the browser over the WS sub-ack).
2. **DataView renderers are in the composition closure.** A `<DataView>`'s
   view-type + per-field cell/editor renderers are `DataViewSlots.*` contributions
   nothing hard-imports, so a filtered release closure omits them and the surface
   fail-soft-skips every config-authored view row → "No views configured" *despite*
   the config shipping. Any app hosting a DataView now `extends` the **`data-views`**
   composition pack (`plugin-meta/composition/core/config.ts`). **Residual
   follow-up:** the `DataViewSlots.{Filter,ValueCodec,ColumnConfig}` contributors
   are not yet composition-selectable (the closure classifier does not surface them
   as soft-option edges, so `composition-closure` rejects selecting them), so a
   released DataView's Filter pill / typed value-codecs degrade to fail-soft.

## Deploy handoff note

The engine's run model, target registry, and `triggerRelease` are
**remote-flow-ready**. When the Deploy app later adds remote deploy, it should add
a remote *transport* over the same `_releaseRuns` table + `RELEASE_TARGETS`
registry rather than forking the lifecycle — keep the run model here, let Deploy
own where the artifact lands. Remote deploy is explicitly **out of F4 scope**;
nothing remote is built here.

<!-- AUTOGENERATED:BEGIN — do not edit; regenerated by `./singularity build` -->

## Plugin reference

- Description: Release engine web presence: eagerly registers the boot-critical release.history / release.previews resource descriptors so boot-snapshot can hydrate them before first paint, independent of the (lazy) Studio release UI. Local composition release lifecycle engine: run, observe, preview F4 artifacts.
- Server:
  - Contributes:
    - `resource.declare` "release.run"
    - `resource.declare` "release.history-revision"
    - `resource.declare` "release.previews"
  - Uses:
    - `database.db`
    - `fields/server-capabilities-loader`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/launcher.gatewayPidFile`
    - `infra/launcher.isRunning`
    - `infra/launcher.teardownSelfContainedApp`
    - `infra/paths.currentWorktreeName`
    - `infra/paths.pruneWorktreeReleaseArtifacts`
    - `infra/paths.REPO_ROOT`
    - `infra/paths.SINGULARITY_DIR`
    - `infra/paths.worktreeArtifacts`
    - `infra/paths.worktreeDataDir`
    - `primitives/data-view/server-query.augmentServerQuery`
    - `primitives/data-view/server-query.compileWhere`
    - `primitives/data-view/server-query.FieldColumnMap`
    - `primitives/data-view/server-query.OperatorSqlResolver`
    - `primitives/keyset.buildSortKeys`
    - `primitives/keyset.keyValuesOf`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
    - `primitives/log-channels.defineLogSink`
  - DB schema: `plugins/release/server/internal/tables.ts`
  - Exports (values):
    - `_releaseRuns`
    - `collectReleaseEnv`
    - `newReleaseRunId`
    - `Release`
    - `releaseOutDir`
    - `triggerRelease`
  - Resources:
    - `release.history-revision` (push)
    - `release.previews` (push)
    - `release.run` (push)
  - Routes:
    - `POST /api/release`
    - `POST /api/release/runs/:id/preview`
    - `POST /api/release/runs/:id/preview/stop`
    - `GET /api/release/runs/:id/logs`
    - `POST /api/release/history/query`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
    - `primitives/live-state.resourceDescriptor`
  - Exports (types):
    - `Preview`
    - `QueryReleaseHistoryBody`
    - `ReleaseLogLine`
    - `ReleaseLogsResponse`
    - `ReleaseRun`
    - `ReleaseTarget`
  - Exports (values):
    - `previewEndpoint`
    - `PreviewSchema`
    - `previewStateResource`
    - `queryReleaseHistory`
    - `QueryReleaseHistoryBodySchema`
    - `QueryReleaseHistoryResponseSchema`
    - `RELEASE_LOG_CHANNEL`
    - `RELEASE_TARGETS`
    - `releaseLogsEndpoint`
    - `ReleaseLogsResponseSchema`
    - `releaseRunResource`
    - `ReleaseRunSchema`
    - `releaseRunsRevisionResource`
    - `releaseTargetById`
    - `SortRuleSchema`
    - `stopPreviewEndpoint`
    - `triggerReleaseEndpoint`
- Cross-plugin:
  - Imported by: `auth/apple-signing`
- Shared:
  - Exports (types): `ReleaseStatus`

<!-- AUTOGENERATED:END -->
