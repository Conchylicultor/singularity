# release

Reusable engine for the **local composition release lifecycle** (F4): run a
release, observe live progress/logs, see the artifact, and launch/preview it
locally. Every part of "run a detached child and survive a restart" now belongs
to the **supervised-job** wrapper
(`@plugins/infra/plugins/jobs/plugins/supervised-job`), which composes
`defineJob` + a `supervised-run` kind + `ctx.waitFor` — this plugin keeps only
its own ledger, its argv, and what a finished run MEANS. The Studio app is the
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
- **Run model** (`server/internal/release-job.ts`) wraps `./singularity release
  --composition <c> --target <t> --dev --out <short-dir>` as a **supervised
  job**: one `defineSupervisedJob` that claims, spawns detached and suspends, so
  a twenty-minute release holds a worker slot for milliseconds. The primitive
  owns detach, the pid, the transcript, the boot reconcile and the re-attach;
  `server/internal/run-state.ts` is the adapter over `release_runs`
  (`claimRelease` / `listUnfinished` / `setPid` / `closeReleaseRow`), and
  `register: [releaseJob]` mounts both halves — the queue job and its
  supervised-run kind — with one token. The claiming INSERT IS the lock: the partial
  unique index is scoped by **(namespace, composition)**, so concurrent releases
  of *different* compositions are legitimate and a duplicate in-flight release of
  the *same* composition loses with 23505 → `already-running`. There is no
  pre-flight liveness probe and no per-plugin orphan sweep left — both were
  second copies of a question the primitive's one reconciler answers.
- **The spawning backend is never restarted.** Phase 1 of the release CLI shells
  into `./singularity build --hermetic --composition <c>`, the *hermetic*
  posture of `build`: it
  produces the artifact set (filtered registries, migration SQL, web dist) and
  structurally cannot deploy — no gateway spec, no restart, no health probe, no
  `build_runs` row. (It used to be `build --composition --no-restart
  --skip-checks --allow-main`, i.e. a full dev build with the deploy suppressed
  by a flag; a release no longer has to routinise `--allow-main`, and no longer
  shows up in the build Gantt as a build that isn't one.) So the spawning backend
  survives the whole release; pid-liveness + boot reconcile gives
  restart-durability — ownership is *more* stable than build's.
- **Versioned out-dir.** `releaseOutDir` (in `plugins/bundles/server`, which is
  DB-free so the CLI shares it) roots
  each release at `<SINGULARITY_DIR>/releases/<worktree>/<comp>-<target>/<run-id>/`
  — versioned per run, not overwrite-in-place, so builds are kept and a
  `latest-<platform>` symlink (written by the CLI once a run is PACKED) points at
  the current `<run-id>`. The 104-byte
  Unix-socket cap no longer constrains this path: `launcher/bin/launch.ts` reroots
  the embedded-PG, PgBouncer, and gateway per-worktree backend sockets onto short
  `/tmp` dirs — the PG/PgBouncer sockets to a `/tmp/sgs-XXXXXX` dir via
  `SINGULARITY_PG_SOCKET_DIR`, the backend worktree sockets to a `/tmp/sgw-XXXXXX`
  dir via `SINGULARITY_SOCKETS_DIR` — so a long `<run-id>` is safe even for a
  direct `<out>/launch`. For **preview**, the data root is a `/tmp/sgp-XXXXXX`
  mkdtemp — short by construction.
- **Preview** (`server/internal/preview-manager.ts`) spawns the staged `launch`
  binary with `SINGULARITY_DIR=<tmp>` + `SINGULARITY_LISTEN=:<free>`, tracked in an in-memory
  Map projected into the `release.previews` external resource. Stop kills the
  process group and removes the data dir. Boot reconcile reaps dead previews.

## Starting a release, and waiting for one

There are exactly two verbs, and they are deliberately not the same call:

- **`enqueueRelease(opts): Promise<string>`** — request one release, get back the
  id of the run it will be. It returns as soon as the job row is in the queue.
- **`awaitRelease(ctx, { releaseId, composition, name }): Promise<ReleaseEnded>`**
  — wait for one, **durably**, from inside a job handler.

`runRelease` is gone, and so is `internal/driving.ts`. A supervised run's outcome
does not come back from the call that started it — it arrives at the kind's
`finish`, driven by a file watcher — and that map existed to hand the terminal
back to the promise the starting process was holding. It worked only while that
process lived, which is precisely what the Deploy app's `update` could not rely
on: it `await`ed a release in-process for tens of minutes between its converge
and ship legs, and an unrelated `./singularity build` ended both. `ctx.waitFor`
is that mechanism now and it is durable, so the map is deleted rather than
generalised.

**The run id is minted by the CALLER**, in `enqueueRelease`, before anything is
claimed. That is the one thing about the input worth arguing for: a sequencing
caller has to name the run it will wait on, because `supervisedRun.ended` is
filtered on `(kindId, runId)`. Naming a run is not claiming it — the LOCK is
still the job's claiming INSERT, so two enqueues of one composition both get an
id and the second one's claim loses.

`ReleaseEnded` is a **discriminated result, not a throw**, for the same reason
`ReleaseOutcome` was: *another release of this composition is already running* is
a legitimate outcome a sequencer branches on, and it must be distinguishable from
"the build ran and failed" and from an actual bug. The `failed` arm's `message`
is literally `release_runs.error`, so a caller reporting it and a user opening the
run detail read one sentence.

**`awaitRelease` resolves against the LEDGER, not the exit marker**, which is the
one place it differs from every other supervised wait. `closeRow` writes the row
before the announcement, so the row is always the complete answer by the time
anything can wake — and unlike a marker it also states the two things a marker
cannot: whether the run was ever claimed at all, and what sentence to show. A
release whose claim lost the race writes no marker and has no pid, so
`supervised-job`'s own `awaitSupervisedRun` would read it as a hard kill; the
`never-started` arm here names the run that actually holds the lock instead.

## `closeRow` stamps the row; `onEnded` says so

The kind's two arms split by WHAT they do, not by which one runs:

- **`closeReleaseRow`** (`run-state.ts`) — the bare terminal write, first-writer-
  wins (`WHERE finished_at IS NULL`), reached from the supervised-run reconciler
  in every backend. No log line, no enqueue. It is the backstop that keeps a
  dead workflow from holding the composition's in-flight lock forever.
- **`onEnded`** (`release-job.ts`) — the one log line saying how it went, read
  back off the now-closed row so the sentence a user sees and the text stored on
  the row are identical by construction.

`finished_at` is the exit marker's **mtime**, so a run recovered after a restart
reports the duration it actually took rather than the gap until something
noticed.

`failUnstartedRelease` is gone: closing the row after a spawn that never started
is `supervised-job`'s `spawnClaimedRun`, once, for every kind.

## Intent: what a run is FOR

`enqueueRelease({ composition, target, intent })` takes a `ReleaseIntent`, and
that value is the only thing that changes the argv:

| intent | argv | `release_runs.kind` |
| --- | --- | --- |
| `{ kind: "staged" }` | `--dev` (host platform) | `staged` |
| `{ kind: "candidate", platform }` | `--platform <tag>`, **no** `--dev` | `candidate` |

A union, not `{ dev?, platform? }`, so **"a candidate always names its platform"**
is unrepresentable-otherwise. `intent` is `.optional()` on the endpoint body
(resolved to `STAGED_INTENT` in `handleRelease`, the one place) rather than
`.default()`: `defineEndpoint` types the client body from the schema's *output*,
so a zod default would make `intent` **required** for every existing caller.

`kind` is stamped at claim time from the request — what a run was FOR is decided
by the caller, never inferred later from what happens to be on disk.

## Logs: the transcript IS the record

`release-logs-<id>.json` is gone. It was written by the PARENT, from lines it had
accumulated off the CLI's pipe, and only when the run failed — so it existed
exactly when the parent survived the run (the case that never needed it) and was
absent for every genuinely orphaned release (the case it was written for). That
is why `resolveOrphanExitCode` always fell through to the `-1` sentinel.

`GET /api/release/runs/:id/logs` now reads the supervised run's transcript file,
which the CHILD writes for every run whatever becomes of it. Two consequences:
a **successful** finished run now has a readable log pane (it used to be empty),
and every line reads as `stdout`, because a supervised child's stdout and stderr
share one descriptor — the interleaving survives, the classification does not.
The live view of the same bytes already says `stdout` (the log channel defaults
an unclassified line to it), so the two views now agree.

## `GET /api/release/candidate?composition&platform`

*What would `ship` pick here, and where did it come from?* →
`{ resolution, run, staleness }`. **The filesystem says whether a shippable
bundle exists and matches; the DB says where it came from.** `resolution` is the
EXACT `BundleResolution` `resolveBundle` returns — the same value
`./singularity deploy ship` acts on — so a consumer renders
`bundleRefusalMessage(resolution.refusal)` verbatim and **never re-derives
shippability**. `run` is legitimately `null` (hand-run CLI releases are
deliberately absent from `release_runs`). `staleness` compares the **manifest's**
provenance, not the row's: they agree by construction, but the manifest always
exists.

Owned here, not by deploy: the only deploy-specific input is the platform, so
this adds no server-side edge from deploy toward release.

A `dedupe: true` GET, **not** a live resource — a per-composition collection
resource would be unbounded. Consumers refetch on the `release.history-revision`
tick.

## `GET /api/release/latest?composition=<name>`

*What is the newest run of this composition, whatever its state?* →
`{ run: ReleaseRun | null }`.

**Both endpoints exist because neither can answer the other's question.** The
candidate asks the **filesystem** — *what would `ship` pick* — a resolved bundle,
so it is blind by construction to a build still running or one that just failed.
This asks the **DB** — *what is the newest run*, any status. A pipeline needs
both, gated together. Scoped `(namespace, composition) ORDER BY started_at DESC
LIMIT 1`, exactly the `release_runs_ns_comp_started_idx` prefix.

`run` is wrapped in an object, not a top-level `ReleaseRunSchema.nullable()`:
`implement()` turns a `null` return into **204** and `fetchEndpoint` turns 204
into `undefined`, indistinguishable from still-loading. Applies to any
`implement()` handler whose absence is meaningful.

**Never borrow `queryReleaseHistory` to fetch one row.** It is a
server-delegated DataView source whose augmentors key off `dataViewId`; an
invented surface id works only until an augmentor matches it.

`internal/wire-columns.ts` is the one `release_runs` projection all four read
paths select; add a column there, not per-site.

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

1. List `~/.singularity/state/releases/<worktree>/` — one `<comp>-<target>/` dir per
   composition+target, each holding versioned `<run-id>/` dirs plus one
   `latest-<platform>` symlink per platform ever packed.
2. Follow `<comp>-<target>/latest-<platform>` → the current packed `<run-id>/`.
   A `--dev` (staged-only) or tauri run claims NO pointer — so a pointer always
   names a shippable bundle. See `plugins/bundles/`.
3. Read `<run-id>/RELEASE.json` — self-describing: `composition`, `target`,
   `platform`, `builtAt`, `port`, `runId`, `commitSha`, `commitDirty`.
4. The shippable bundle lives inside `<run-id>/`:
   - **tauri** → `<run-id>/bundle/<Name>.app` and `<Name>.dmg`
   - **web** → `<run-id>/dist/<comp>-<target>-<platform>` (self-extracting binary)

Standalone CLI releases are **deliberately NOT recorded in `release_runs`** —
that table is the Studio engine's dev/preview history only. Discoverability for
hand-run releases is the path + `latest-<platform>` symlink + `RELEASE.json`, not a registry
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
./singularity run plugins/release/e2e/release-boot-verify.ts --url http://localhost:<port>/ --settle 15000
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
./singularity run plugins/release/e2e/release-boot-verify.ts --url http://localhost:9100/ --settle 15000
```

**Tauri target** — build the `.app`, launch it, verify the served content **and**
the real window:

```bash
./singularity release --composition <c> --target tauri        # builds <out>/bundle/<Name>.app
open "<out>/bundle/<Name>.app"                                 # brings up the embedded stack on RELEASE.json port
./singularity run plugins/release/e2e/release-boot-verify.ts --url http://localhost:9100/ --settle 15000
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

The engine's run model, target registry, and `enqueueRelease` are
**remote-flow-ready**. The Deploy app consumes this as designed: its `update`
verb enqueues a release for the build leg — because that build must be recorded
in `release_runs`, which only the engine can do — waits for it through
`awaitRelease`, and owns the transport and where the artifact lands. That wait is
a suspended workflow, not an in-process promise, which is what makes an `update`
survive the backend restart it used to die of. The lifecycle stays here; nothing
remote is built here.

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
    - `database/sql-column.parsedText`
    - `fields/server-capabilities-loader`
    - `fields/server-capabilities.resolveFieldFilterSql`
    - `infra/endpoints.HttpError`
    - `infra/endpoints.implement`
    - `infra/jobs/supervised-job.defineSupervisedJob`
    - `infra/jobs/supervised-job.runEnded`
    - `infra/jobs/supervised-job.RunEndedPayload`
    - `infra/launcher.gatewayPidFile`
    - `infra/launcher.isRunning`
    - `infra/launcher.teardownSelfContainedApp`
    - `infra/paths.currentWorktreeName`
    - `infra/paths.REPO_ROOT`
    - `infra/paths.worktreeArtifacts`
    - `primitives/data-view/server-query.augmentServerQuery`
    - `primitives/data-view/server-query.compileWhere`
    - `primitives/data-view/server-query.FieldColumnMap`
    - `primitives/data-view/server-query.OperatorSqlResolver`
    - `primitives/keyset.buildSortKeys`
    - `primitives/keyset.keyValuesOf`
    - `primitives/keyset.orderByClauses`
    - `primitives/keyset.seekPredicate`
    - `primitives/log-channels.defineLogSink`
    - `release/bundles.compareToHead`
    - `release/bundles.newReleaseRunId`
    - `release/bundles.releaseOutDir`
    - `release/bundles.resolveBundle`
  - DB schema: `plugins/release/server/internal/tables.ts`
  - Exports (types):
    - `ReleaseEnded`
    - `TriggerReleaseOptions`
  - Exports (values):
    - `_releaseRuns`
    - `awaitRelease`
    - `collectReleaseEnv`
    - `enqueueRelease`
    - `Release`
  - Register: `defineSupervisedJob('release.run.supervised')`
  - Resources:
    - `release.history-revision` (push)
    - `release.previews` (push)
    - `release.run` (push)
  - Routes:
    - `POST /api/release`
    - `GET /api/release/candidate`
    - `GET /api/release/latest`
    - `POST /api/release/runs/:id/preview`
    - `POST /api/release/runs/:id/preview/stop`
    - `GET /api/release/runs/:id/logs`
    - `POST /api/release/history/query`
- Core:
  - Uses:
    - `infra/endpoints.defineEndpoint`
    - `primitives/data-view.FilterGroupSchema`
    - `primitives/live-state.resourceDescriptor`
    - `release/bundles.ReleaseManifestSchema`
  - Exports (types):
    - `PlatformTag`
    - `PlatformTagResult`
    - `Preview`
    - `QueryReleaseHistoryBody`
    - `ReleaseCandidateResponse`
    - `ReleaseIntent`
    - `ReleaseLatestRunResponse`
    - `ReleaseLogLine`
    - `ReleaseLogsResponse`
    - `ReleaseRun`
    - `ReleaseTarget`
  - Exports (values):
    - `bunCompileTarget`
    - `BundleResolutionSchema`
    - `goEnvFor`
    - `hostPlatformTag`
    - `isLinuxTag`
    - `isPlatformTag`
    - `PLATFORM_TAGS`
    - `platformTagFor`
    - `platformTagFromUname`
    - `PlatformTagSchema`
    - `previewEndpoint`
    - `PreviewSchema`
    - `previewStateResource`
    - `queryReleaseHistory`
    - `QueryReleaseHistoryBodySchema`
    - `QueryReleaseHistoryResponseSchema`
    - `RELEASE_LOG_CHANNEL`
    - `RELEASE_TARGETS`
    - `releaseCandidateEndpoint`
    - `ReleaseCandidateResponseSchema`
    - `ReleaseIntentSchema`
    - `releaseLatestRunEndpoint`
    - `ReleaseLatestRunResponseSchema`
    - `releaseLogsEndpoint`
    - `ReleaseLogsResponseSchema`
    - `releaseRunResource`
    - `ReleaseRunSchema`
    - `releaseRunsRevisionResource`
    - `releaseTargetById`
    - `SortRuleSchema`
    - `STAGED_INTENT`
    - `StalenessSchema`
    - `stopPreviewEndpoint`
    - `triggerReleaseEndpoint`
- Cross-plugin:
  - Imported by:
    - `apps/deploy/deployments`
    - `auth/apple-signing`
    - `release/runs-arm`
- Sub-plugins:
  - **`bundles`** — The on-disk release-bundle registry: run-dir layout, the `latest-<platform>` pointer, resolveBundle()'s discriminated verdict, git provenance + staleness, and run-dir retention. Strictly DB-free so a CLI process can import it.
  - **`runs-arm`** — The release arm's presence on the merged run surface: the Release kind (whose rows open the Studio release run-detail pane), plus the composition / target / platform / provenance columns only a release row has. The release arm of the merged run space: binds `release_runs` into the runs union, mapping its own three-way status onto the shared outcome axis through a typed-total record, and contributing the composition / target / platform / provenance columns only a release row has — `release.kind` namespaced so the ledger's own kind column cannot shadow the run-kind discriminator.

<!-- AUTOGENERATED:END -->
