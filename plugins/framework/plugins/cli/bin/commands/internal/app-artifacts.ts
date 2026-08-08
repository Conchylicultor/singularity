import { writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  generateCompositionRegistry,
  regenerateManifestCodegen,
  regenerateRegistryCodegen,
  seedAuthoredOverrides,
  type CodegenStep,
} from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import {
  discoverTscTargets,
  listAllChecks,
  materializeWarmBase,
  publishWarmBase,
  runChecks,
  tsBuildInfoPath,
} from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  compositionFleetSource,
  runWebArtifactsPipeline,
} from "@plugins/framework/plugins/tooling/plugins/web-artifacts/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import {
  flattenManifest,
  resolveComposition,
} from "@plugins/plugin-meta/plugins/closure/core";
import {
  compositionsConfig,
  manifestItemToManifest,
} from "@plugins/plugin-meta/plugins/composition/core";
import { spawnCaptured } from "@plugins/infra/plugins/spawn/core";
import { worktreeArtifacts } from "@plugins/infra/plugins/paths/server";
import { withHostGrant } from "@plugins/infra/plugins/host-admission/server";
import {
  cpuBudget,
  type Grant,
  type GrantHooks,
  type Lane,
} from "@plugins/infra/plugins/host-admission/core";
import { isUnderDuress } from "@plugins/infra/plugins/duress/plugins/latch/server";
import {
  holdThroughValve,
  shouldRequeue,
  type ValveDeps,
} from "../../admission-valve";
import { acquireBuildLock } from "../../build-lock";
import { ensureDeps } from "../../ensure-deps";
import { generateMigration, type MigrationAnswer } from "../../migrations";
import { distStagingPath, publishDistAtomic } from "./dist-publish";
import { stampExperimentalMarker } from "./experimental-marker";

/**
 * Single source of truth for the ordered **app-artifact** pipeline: the part of
 * `./singularity build` that is a deterministic function of (source tree,
 * composition) — filesystem, CPU and network-for-deps only.
 *
 * `build`'s action conflates two jobs: *produce the artifact set* and *deploy it
 * into the live dev cluster*. Only the first is portable; the second needs a
 * provisioned dev box (embedded Postgres, a DB fork, the gateway, the run
 * ledger). Extracting job 1 here is what lets a second, process-isolated caller
 * (`build-composition`, which `release` shells into) cut an artifact on a bare
 * host from a fresh `git clone`, while `build` keeps its exact behaviour: it
 * calls these stages and gains ZERO new conditionals.
 *
 * This is the same shape as
 * `tooling/plugins/codegen/core/regen-pipeline.ts` — which solved the identical
 * problem one level down — including the reason it is split into THREE
 * functions rather than one: build's dev-only steps are *not* contiguous. They
 * interleave between the stages, and the boundaries below fall exactly where
 * nothing crosses:
 *
 *   stage 1  prepareCompositionSources  (deps + registry-level codegen)
 *   ----     build only: central routes manifest, central.json, waitForPg,
 *            waitForWorktreeDatabase, build_runs row mint
 *   stage 2  generateAppSources         (migrations + manifest-level codegen)
 *   ----     build only: propagateConfigToUser
 *   stage 3  buildAndPublishWebDist     (host grant, heavy jobs, atomic publish)
 *
 * Out of scope — deploy concerns, deliberately left in each caller:
 *   - `waitForPg` / `waitForWorktreeDatabase` — live cluster readiness.
 *   - the `build_runs` run-ledger (mint + close) and build-progress log.
 *   - every gateway HTTP call (`writeWorktreeSpec`, restart, health probes).
 *   - worktree-op markers (`markWorktreeOpStart` / `setWorktreeOpPhase`).
 *   - the compose-serve stage.
 *   - `propagateConfigToUser` — same function, different sink per caller (build
 *     targets `~/.singularity/config/<worktree>`, a release targets its own
 *     `config-seed`), so the sink IS the parameterization. Mirrors
 *     regen-pipeline.ts's own out-of-scope note.
 *   - `sweepDistLeftovers` — the caller sweeps its own dist dir right after
 *     `acquireArtifactLock`, before any staging dir is created.
 *   - build's step-log / profile / verdict writers. The module only *produces*
 *     `StepResult[]`; rendering and the failure wording stay in `build.ts`.
 *
 * ORDERING CONSTRAINTS (load-bearing — do not reorder):
 *   - dependencies FIRST (`ensureDeps`, stage 1): vite, drizzle-kit and tsc are
 *     all resolved out of `node_modules`, and a release additionally vendors the
 *     embedded-postgres / pgbouncer natives from there. Including it is what
 *     makes a fresh `git clone` work. Freshness-gated, so for a dev build —
 *     whose `./singularity` bootstrap just ran the same function — it collapses
 *     to a no-op instead of a second 10–25 s install.
 *   - registry codegen BEFORE the composition registry: the filtered
 *     per-composition registries are emitted beside the full committed ones the
 *     registry pass just regenerated.
 *   - stage 1 BEFORE central is spawned by the caller — `plugins.generated.ts`
 *     must be in sync — hence the split at the stage-1 boundary.
 *   - migrations BEFORE manifest codegen (stage 2's internal order): drizzle's
 *     generate is stateful and interleaved with the caller's DB steps, while
 *     `regenerateManifestCodegen` is pure repo-tree codegen.
 *   - `seedAuthoredOverrides` LAST in stage 2: it reads each config origin's
 *     hash + body off disk (written by the origins pass inside
 *     `regenerateManifestCodegen`) and must land before the caller propagates
 *     config, so the user layer never sees a half-seeded git layer. NB it mints
 *     `@review` markers into the checkout — today's behaviour for a release
 *     too, since a release reaches it through this same pipeline.
 *   - stage 3 LAST, under ONE host CPU grant covering every heavy child
 *     (checks, tsc, vite / web-artifacts). Nothing inside re-acquires host-wide.
 *
 * ESM-FREEZE CONSTRAINT (inherited from regen-pipeline.ts): Bun's ESM cache
 * freezes a module on its first `import()`, and a later disk write cannot
 * invalidate it. `regenerateManifestCodegen` (stage 2) regenerates every
 * barrel-reachable manifest and arms `setPreBarrelImportGuard` BEFORE the first
 * barrel import — which only works in a process that has not already imported a
 * plugin barrel. Otherwise `generateConfigOrigins` re-imports stale barrels and
 * `pruneOrphanedConfigFiles` deletes a freshly-authored override. Therefore any
 * NEW caller of `generateAppSources` must keep its transitive import set a
 * SUBSET of `build.ts`'s — the property is inherited, never re-derived. (This is
 * also why `release.ts`, which statically imports plugin barrels, must shell out
 * to a separate process rather than call this module in-process.)
 *
 * LOCK ORDERING (why there is no deadlock): the two locks a caller of this
 * module can hold are acquired in ONE direction only —
 *
 *     `.build.lock`  (acquireArtifactLock, held by the caller for its lifetime)
 *          ↓
 *     `.install.lock` (inside stage 1's `ensureDeps`, released before it returns)
 *
 * — and never the reverse: nothing anywhere acquires the build lock while
 * holding the install lock, so the two can never form a cycle. The install lock
 * is deliberately NOT `.build.lock` itself: sharing them would make a plain
 * `./singularity check` — which installs, but builds nothing — block for the
 * entire duration of a concurrent build in the same checkout.
 *
 * FAILURE IS A TYPE, not a value: stage 3 returns a discriminated
 * `ArtifactBuildResult` — on any failed step it `rm`s its own staging dir first,
 * so a failed artifact build never leaks one (relying on the next run's
 * `sweepDistLeftovers` would be silent cleanup). ONE DOCUMENTED process-exit
 * exception, pre-existing and preserved verbatim because callers depend on the
 * exit code:
 *   - `generateMigration` (stage 2) exits 1 on an invalid name and exits 2 when
 *     drizzle-kit shows rename/create prompts — `release` relies on that code.
 *
 * Stage 1's install used to be a second such exception (`exec` exited 1 on a
 * nonzero `bun install`). It is now `ensureDeps`, which THROWS a message naming
 * the failing phase — strictly better here: both callers route a thrown stage
 * into their own error path (`build`'s verdict guard + `finalizeBuild` still
 * render "aborted before completing", `runCli` sets exit 1), whereas the bare
 * `process.exit(1)` produced the same code with no explanation of which phase
 * died. No caller keys on install-specific exit behaviour.
 */

/**
 * Observability seam. `build` passes its real profiler + console; a hermetic
 * caller passes no-ops. Shaped to `buildProfilerStart` / `pushBuildSpan`
 * EXACTLY so build's spans stay byte-identical — every span id, phase and label
 * this module emits is therefore preserved by construction, not by copying.
 */
export interface ArtifactHooks {
  /** `buildProfilerStart` — opens a span; the returned closure closes it. */
  span: (
    id: string,
    phase: string,
    label: string,
  ) => (info?: { maxRssBytes?: number }) => void;
  /** `pushBuildSpan` — records an already-finished span retroactively. */
  pushSpan: (
    id: string,
    phase: string,
    label: string,
    durationMs: number,
    wallStartMs?: number,
  ) => void;
  log: (line: string) => void;
  /** Routes a phase's peak RSS into the caller's `maxRSS` line collector. */
  recordFootprint: (label: string, maxRssBytes: number | undefined) => void;
}

/** One step of the heavy section, run on the shared host CPU grant. */
export type HeavyJob = (grant: Grant) => Promise<StepResult>;

export interface StepResult {
  id: string;
  label: string;
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  durationMs: number;
  success: boolean;
}

interface StepOutput {
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  exitCode: number;
  /** Peak RSS of the child (bytes), when the runtime reported rusage. */
  maxRssBytes: number | undefined;
}

/**
 * Returned from inside the host grant when the post-acquire duress re-check
 * fires: the heavy section did NOT run, and `withHostGrant`'s `finally` releases
 * the share on the way out — so the caller can re-hold at the valve and try
 * again. A `unique symbol` so it can never collide with a real `StepResult[]`.
 */
const REQUEUE = Symbol("requeue");

// Lines are rebuilt AFTER exit as stdout-lines then stderr-lines. The old piped
// version interleaved the two streams in arrival order, but that order was a
// nondeterministic pipe race anyway — grouping per stream is the honest framing.
async function execBuffered(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
  background = false,
): Promise<StepOutput> {
  const result = await spawnCaptured(cmd, {
    cwd,
    env: env ? { ...process.env, ...env } : undefined,
    background,
  });
  const lines: StepOutput["lines"] = [];
  for (const line of result.stdout.split("\n")) {
    if (line) lines.push({ text: line, stream: "stdout" });
  }
  for (const line of result.stderr.split("\n")) {
    if (line) lines.push({ text: line, stream: "stderr" });
  }
  return {
    lines,
    exitCode: result.exitCode,
    maxRssBytes: result.resourceUsage.maxRssBytes,
  };
}

// One greppable line per measured build phase, e.g. "vite build: maxRSS 3.5 GB"
// (console + build.log). The calibration input for host-admission's per-holder
// footprint constants (@plugins/infra/plugins/host-admission/core PER_UNIT_BYTES)
// and any future per-build memory budget.
//
// Units are DECIMAL (1 GB = 1e9 B, 1 MB = 1e6 B) — deliberately, because
// PER_UNIT_BYTES is decimal (2.7e9). Dividing by 2**30 and labelling the result
// "GB" (as this did) understates the true byte count by ~7 %, which silently
// corrupts anyone calibrating the constant by reading these lines.
export function maxRssLine(
  label: string,
  maxRssBytes: number | undefined,
): string | null {
  if (maxRssBytes == null) return null;
  const gb = maxRssBytes / 1e9;
  const amount =
    gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(maxRssBytes / 1e6)} MB`;
  return `${label}: maxRSS ${amount}`;
}

/**
 * Per-step wrapper for the shared codegen pipeline: keeps the caller's per-step
 * profiler granularity while the ordered call list lives in codegen core (shared
 * with `regen-generated`). `pluginDocs` historically lived under the
 * `build:validation` phase; every other codegen step under `build:codegen` —
 * DERIVED here, from `hooks.span`, so the two callers cannot drift on it.
 */
function codegenStepFor(hooks: ArtifactHooks): CodegenStep {
  return async (id, label, run) => {
    const phase = id === "pluginDocs" ? "build:validation" : "build:codegen";
    const end = hooks.span(id, phase, label);
    try {
      await run();
    } finally {
      end();
    }
  };
}

/**
 * The per-checkout artifact lock. Serializes artifact production (codegen +
 * dist publish) against any other build/release in the same checkout — a plain
 * filesystem symlink, so it works on a bare host. Callers sweep their own dist
 * leftovers immediately after this returns.
 */
export async function acquireArtifactLock(webDir: string): Promise<void> {
  // `acquireBuildLock` resolves to a release closure; the lock is deliberately
  // held for the whole process lifetime (its own exit hook releases it), which
  // is exactly what build does today — so the closure is dropped here too.
  await acquireBuildLock(resolve(webDir, ".build.lock"));
}

/**
 * Stage 1 — dependencies + registry-level repo-tree codegen + (when building a
 * composition) that composition's filtered registries.
 */
export async function prepareCompositionSources(opts: {
  root: string;
  /**
   * The composition being built, or `null` for a plain build. Kept explicit
   * (not optional) so a caller states which it is rather than defaulting into
   * one: the two callers are `build` (always null) and `build-composition`
   * (always a name), and stage 1 does the same deps + registry codegen either
   * way. `null` no longer TRIGGERS anything — it just skips the filtered
   * registries.
   */
  composition: string | null;
  hooks: ArtifactHooks;
}): Promise<void> {
  const { root, composition, hooks } = opts;
  const codegenStep = codegenStepFor(hooks);

  // 1. Install dependencies. Required before the gateway can find the
  // platform-specific embedded-postgres binaries under
  // plugins/infra/plugins/database/node_modules/@embedded-postgres/.
  //
  // Through `ensureDeps` — the repo's ONE install chokepoint (freshness-gated,
  // serialized on `.install.lock`, loud on failure), the same function the
  // `./singularity` bootstrap already ran moments ago. So for a dev build this
  // is normally a ~140 ms no-op reporting `installed: false`, and the old
  // double 10–25 s install per build (wrapper, then here) is gone. The call
  // stays because `build-composition` on a bare host from a fresh `git clone`
  // is the caller that genuinely needs the install, and stage 1 is where the
  // ordering constraint above puts it.
  //
  // `ensureDeps` OWNS every in-flight line of this phase (the lock-wait notice,
  // and the install child's passed-through output) — it is the only side that
  // knows an install is about to happen. This caller therefore announces
  // nothing up front and reports RETROSPECTIVELY, from `installed`: a
  // pre-emptive "Installing dependencies..." would be a plain false statement
  // on the normal fresh-skip path, and even on the install path it would land
  // after bun's own output, since the passthrough completes before the call
  // returns. Past tense for the same ordering reason.
  let endSpan = hooks.span("bunInstall", "build:setup", "bun install");
  const deps = await ensureDeps({ root, log: hooks.log });
  hooks.log(
    deps.installed
      ? "Installed dependencies."
      : "Dependencies already up to date.",
  );
  // No footprint to report: the install usually does not RUN here (fresh-skip),
  // and when it does it is `ensureDeps`' own passthrough child, whose rusage it
  // does not surface. Both sinks take `number | undefined`, so pass `undefined`
  // — `maxRssLine` then prints nothing — rather than attributing a peak this
  // phase did not measure. The seam stays wired for the day it can measure again.
  endSpan({ maxRssBytes: undefined });
  hooks.recordFootprint("bun install", undefined);

  // 1b–2a. Registry-level repo-tree codegen: barrel-import auto-stubs (from
  // .d.ts files) then the plugin registry. Must happen before central is
  // spawned so its plugins.generated.ts is in sync. Shared with the push-time
  // `regen-generated` normalize step via the codegen core pipeline so a full
  // build after a push reproduces the exact same tree. Per-step profiler
  // spans are threaded through `onStep` so build keeps its granularity.
  hooks.log("Generating plugin registry...");
  await regenerateRegistryCodegen({ root, onStep: codegenStep });

  // 2a'. Composition build-gating. With a composition, emit gitignored
  // filtered registries (the bundle's hard closure) beside the committed
  // full ones, keyed by the composition NAME; the web/server import seams
  // select the filtered file by that name. Without one there is nothing to do:
  // every filtered registry is per-name, so it belongs to another namespace and
  // is never selected under this checkout's own worktree name. The committed
  // `<dir>.generated.ts` files are never touched either way, so the build stays
  // byte-identical.
  endSpan = hooks.span(
    "compositionRegistry",
    "build:codegen",
    "composition registry",
  );
  if (composition) {
    const items = compositionsConfig.fields.manifests.defaultValue;
    const item = items.find((m) => m.id === composition);
    if (!item)
      throw new Error(
        `Unknown composition "${composition}". Known: ${items.map((m) => m.id).join(", ")}`,
      );
    const allManifests = items.map(manifestItemToManifest);
    const flat = flattenManifest(manifestItemToManifest(item), allManifests);
    const tree = await buildPluginTree(join(root, "plugins"), {
      skipBarrelImport: true,
      facets: true,
    });
    const bundle = resolveComposition(tree, flat).bundle;
    await generateCompositionRegistry({ root, bundle, name: composition });
    hooks.log(
      `Composition "${composition}": ${bundle.size} plugins in closure.`,
    );
  }
  endSpan();
}

/**
 * Stage 2 — DB migration generation + manifest-level repo-tree codegen +
 * the mandatory-override seed.
 *
 * MAY TERMINATE THE PROCESS: `generateMigration` exits 1 on an invalid
 * `--migration-name` and exits 2 when drizzle-kit shows rename/create prompts
 * (printing the structured prompt JSON). That contract is unchanged and
 * `release` depends on the exit code — see the module docblock.
 */
export async function generateAppSources(opts: {
  root: string;
  worktreeName: string;
  migration: {
    name?: string;
    reset?: boolean;
    custom?: boolean;
    answers?: MigrationAnswer[];
  };
  hooks: ArtifactHooks;
}): Promise<void> {
  const { root, worktreeName, hooks } = opts;
  const codegenStep = codegenStepFor(hooks);

  // 3. Regenerate DB migrations from plugin schema files
  let endSpan = hooks.span(
    "generateMigration",
    "build:database",
    "generate migrations",
  );
  hooks.log("Generating DB migrations...");
  const migration = await generateMigration({
    root,
    worktreeName,
    migrationName: opts.migration.name,
    resetMigration: opts.migration.reset,
    customMigration: opts.migration.custom,
    migrationAnswers: opts.migration.answers,
  });
  endSpan({ maxRssBytes: migration.maxRssBytes });
  hooks.recordFootprint("drizzle generate", migration.maxRssBytes);

  // 4–4b. Manifest-level repo-tree codegen: plugin docs → reorderable-slots
  // → data-views → token-group-vars → config-origins. Run AFTER migrations
  // (DB-stateful, interleaved by the caller) but as ONE ordered pipeline shared
  // with the push-time `regen-generated` normalize step (codegen core), so a
  // full build after a push reproduces the exact same tree. The load-bearing
  // ordering constraints (docs first → reusable enriched tree; slots/views
  // before origins → they register the config_v2 directives origins depend
  // on; token-group-vars before the CSS single-owner checks; origins LAST)
  // live in the pipeline module as the authoritative record. Per-step
  // profiler spans are threaded through `onStep`.
  hooks.log("Generating plugins doc...");
  await regenerateManifestCodegen({ root, onStep: codegenStep });

  // 4b'. Seed / re-mark the MANDATORY config overrides (descriptors that set
  // `requiresAuthoredOverride`). Runs after the origin pass above (it reads
  // each origin's hash + body off disk) and before propagation, so the user
  // layer never sees a half-seeded git layer. Deliberately NOT part of the
  // shared repo-tree codegen pipeline: it mints `@review` markers, and that
  // pipeline also runs from `regen-generated` inside push's amend path — see
  // regen-pipeline.ts.
  endSpan = hooks.span(
    "seedAuthoredOverrides",
    "build:codegen",
    "seed authored config overrides",
  );
  const seedResult = await seedAuthoredOverrides({ root });
  endSpan();
  for (const rel of seedResult.seeded) {
    hooks.log(
      `[config-v2] seeded required override config/${rel} (marked @review)`,
    );
  }
  for (const rel of seedResult.remarked) {
    hooks.log(
      `[config-v2] re-marked stale override config/${rel} (marked @review)`,
    );
  }
}

/**
 * The `--skip-checks` validation set, shared by both callers so neither can
 * drift on what a fast artifact build still proves.
 *
 * Cheap, structural checks opt into running even on the fast path, so
 * codegen-coupled obligations — e.g. a newly-reorderable slot that still owes an
 * authored override — fail at build instead of slipping silently to `push`.
 * Selected generically via the `alwaysRun` flag (never by naming a check).
 * Plus one incremental tsc per runtime entrypoint, since the full `typescript`
 * check (which covers them) did not run.
 *
 * NB the registry reads (`listAllChecks`, `discoverTscTargets`) happen HERE, when
 * the job list is built — i.e. before the host grant, not inside it. Both are
 * cheap filesystem scans that emit no span and no output; only the heavy work
 * they describe runs on the grant.
 */
export async function fastValidationJobs(opts: {
  root: string;
  /** The run these checks belong to — the runner derives `check-<runId>.log` from it. */
  checkLogRun: { worktree: string; runId: string };
  background: boolean;
  hooks: ArtifactHooks;
}): Promise<HeavyJob[]> {
  const { root, checkLogRun, background, hooks } = opts;
  const jobs: HeavyJob[] = [];

  const alwaysRunIds = (await listAllChecks())
    .filter((c) => c.alwaysRun)
    .map((c) => c.id);
  // Guard: runChecks([]) falls through to running ALL checks.
  if (alwaysRunIds.length > 0) {
    jobs.push(async (grant) => {
      const lines: StepResult["lines"] = [];
      const start = performance.now();
      const ok = await runChecks(alwaysRunIds, {
        grant,
        logRun: checkLogRun,
        onCheckDone: (id, durationMs, wallStartMs) => {
          hooks.pushSpan(
            `check:${id}`,
            "build:checks",
            id,
            durationMs,
            wallStartMs,
          );
        },
        log: (line, stream) => {
          lines.push({ text: line, stream });
        },
      });
      return {
        id: "checks",
        label: "checks (always-run)",
        lines,
        durationMs: Math.round(performance.now() - start),
        success: ok,
      };
    });
  }

  for (const target of discoverTscTargets(root).filter(
    (t) => t.hasEntrypoint,
  )) {
    jobs.push(async (grant) => {
      const end = hooks.span(
        `tsc:${target.name}`,
        "build:validation",
        `tsc ${target.name}`,
      );
      const start = performance.now();
      // Identical flags to the `typescript` check so both share one
      // `.tsbuildinfo` per target without options-hash churn.
      const buildInfo = tsBuildInfoPath(root, target.name);
      // Feed and read the same host-global warm-base pool the
      // `type-check` check uses, so the fast path is not a second,
      // divergent incremental lineage.
      materializeWarmBase(root, target.name);
      // Spend a grant unit per runtime tsc — a heavy child like a
      // type-check worker — so the fast-path (--skip-checks) fan-out
      // is bounded by the same grant as everything else.
      const output = await grant.run(() =>
        execBuffered(
          [
            process.execPath,
            "x",
            "tsc",
            "--noEmit",
            ...target.args,
            "--incremental",
            "--tsBuildInfoFile",
            buildInfo,
          ],
          target.dir,
          undefined,
          background,
        ),
      );
      end({ maxRssBytes: output.maxRssBytes });
      // Only a clean exit is a trustworthy base here: unlike the
      // check's workers, a nonzero tsc exit covers crashes and bad
      // invocations as well as plain diagnostics, so we cannot tell a
      // valid program state from a torn one.
      if (output.exitCode === 0) publishWarmBase(root, target.name);
      const rss = maxRssLine(`tsc ${target.name}`, output.maxRssBytes);
      if (rss) output.lines.push({ text: rss, stream: "stdout" });
      return {
        id: `tsc:${target.name}`,
        label: `tsc ${target.name}`,
        lines: output.lines,
        durationMs: Math.round(performance.now() - start),
        success: output.exitCode === 0,
      };
    });
  }

  return jobs;
}

export type ArtifactBuildResult =
  | {
      ok: true;
      steps: StepResult[];
      /** The staging dir, already renamed into the published release. */
      stagingPath: string;
      /**
       * The published dist for `opts.target` — the live symlink now resolving
       * to the fresh release. Equal to `webDistPath(opts.target)`.
       */
      livePath: string;
      /** `git rev-parse HEAD` at publish time; `""` when git could not answer. */
      buildCommit: string;
    }
  | { ok: false; steps: StepResult[]; failedLabels: string[] };

/**
 * WHICH dist this build produces — an IDENTITY, never a path. The path module
 * (`worktreeArtifacts`) owns the layout; a caller names what it is building and
 * gets the one location that identity maps to, so no two producers can be
 * pointed at the same tree by two independent path expressions. That is exactly
 * how a `release` came to publish over the checkout's live served dist.
 */
export type WebDistTarget =
  /**
   * The dist the gateway SERVES at `<name>.localhost:9000`. `name` is a
   * *namespace*: a worktree slug or an auto-served composition id. Published
   * atomically because a live reader exists.
   */
  | { kind: "served"; name: string }
  /**
   * A release's scratch dist — copied into a shippable bundle and served by
   * nobody. Keyed by *(the worktree that BUILT it, composition)*: a release has
   * no namespace of its own, and keying by the building checkout is what makes
   * the existing per-checkout `.build.lock` sufficient to serialize it.
   */
  | { kind: "release"; worktree: string; composition: string };

/**
 * The ONE mapping from a dist identity to its live path. Exported because a
 * caller must sweep its own dist dir's leftovers (`sweepDistLeftovers`) before
 * stage 3 creates a staging dir — and sweeping a *different* path than the one
 * about to be published is precisely the drift this seam exists to prevent, so
 * the caller resolves its `target` through here rather than spelling a path.
 *
 * Both arms live under `~/.singularity/worktrees/`: no dist is written into a
 * checkout any more, so a checkout carries no build output and the served tree
 * survives operations on the checkout (a `git clean`, a worktree re-checkout).
 * It takes no checkout path at all — a build's `webDir` is the `.build.lock`'s
 * home and nothing else.
 */
export function webDistPath(target: WebDistTarget): string {
  return target.kind === "release"
    ? worktreeArtifacts.releaseWebDist(target.worktree, target.composition)
    : worktreeArtifacts.webDist(target.name);
}

export interface BuildWebDistOptions {
  root: string;
  /**
   * The web-core dir, used for ONE thing: the `.build.lock` beside it
   * (`acquireArtifactLock`). The lock is per-checkout by necessity — it guards
   * the registry codegen this pipeline writes *into* the checkout — which is a
   * different question from where the dist lands. The dist location comes from
   * `target` alone; do not re-conflate the two.
   */
  webDir: string;
  /** WHICH dist to publish. Derives `livePath`; see {@link WebDistTarget}. */
  target: WebDistTarget;
  buildId: string;
  composition: string | null;
  minify: boolean;
  /**
   * Copy each artifact out of the shared content-addressed store instead of
   * symlinking it, so the produced dist is SELF-CONTAINED. Only the release
   * path (`build-composition`) wants this: its dist is `cpSync`'d into a
   * shippable bundle, and symlinks into `~/.singularity/web-artifacts/` would
   * ship as dangling links on any other machine.
   *
   * Materializing HERE rather than dereferencing at the copy site is deliberate:
   * the release dist is written in release phase 1 (a `build-composition` child
   * process, which releases `.build.lock` when it exits) and read in phase 3, so
   * in that unlocked window a concurrent build's store pruning can dangle the
   * links — a `cpSync({ dereference: true })` in phase 3 would then fail or ship
   * a hole. A materialized dist has no window: it never referenced the store.
   */
  materialize: boolean;
  /**
   * Stamp the served `index.html` as an experimental (agent-worktree) deploy —
   * the red frame. Only `./singularity build` from a non-main worktree says
   * true; every other producer of a dist is clean. See ./experimental-marker.ts.
   */
  experimental: boolean;
  lane: Lane;
  /** Demote heavy children (tsc, vite) to the background scheduling class. */
  background: boolean;
  /**
   * Heavy jobs that share this section's ONE host grant but are not artifact
   * production — validation. Started BEFORE the frontend job, in order, exactly
   * as build's own array did.
   */
  companions: HeavyJob[];
  admission: { gated: boolean; deps: ValveDeps; grantHooks?: GrantHooks };
  /**
   * Fires the instant the heavy section completes — BEFORE the failure check
   * and before anything is published — with the same array the result carries.
   * Exists so a caller's transcript ordering (step blocks, step log) is
   * independent of what this function does afterwards.
   */
  onSteps?: (steps: StepResult[]) => void;
  hooks: ArtifactHooks;
}

/**
 * Stage 3 — the heavy section under ONE host CPU grant, then the atomic dist
 * publish.
 *
 * Validation (`companions`) and the frontend build are independent: checks read
 * source files, the frontend compiles into a staging dir. On failure the staging
 * dir is removed here and nothing is published, so a failed artifact build never
 * leaks one.
 */
export async function buildAndPublishWebDist(
  opts: BuildWebDistOptions,
): Promise<ArtifactBuildResult> {
  // `opts.webDir` is deliberately NOT destructured: since S4 the dist location
  // comes from `opts.target` alone, and this body has no use for the checkout
  // path. It survives on the options object as the `.build.lock`'s home, which
  // `acquireArtifactLock` — a caller's concern, not this function's — consumes.
  const { root, buildId, composition, companions, hooks } = opts;

  const livePath = webDistPath(opts.target);
  const stagingPath = distStagingPath(livePath);

  hooks.log(
    "Running checks, type-checking, and building frontend in parallel...",
  );

  const webArtifactsJob: HeavyJob = async (grant) => {
    // Per-plugin artifact pipeline, in-process, into a staging dir the
    // atomic publish below then swaps in.
    // Grant-gated like the vite build it replaced: the pipeline's
    // internal fan-out (per-plugin vite builds on a cold store) is the
    // same class of heavy work, so it spends a unit of the build's CPU
    // budget rather than running on top of it.
    const end = hooks.span("viteBuild", "build:frontend", "web artifacts");
    const start = performance.now();
    const lines: StepResult["lines"] = [];
    let success = true;
    try {
      // WHAT the fleet is planned from. Without a composition the pipeline
      // defaults to the committed FULL registry; with one it MUST be told, or
      // it composes a green bundle containing every plugin in the repo instead
      // of the composition's closure — a silently wrong artifact, not a build
      // failure. The per-name `web.composition.<name>.generated.ts` this reads
      // was emitted by stage 1 moments ago.
      //
      // `vendors` is deliberately NOT passed. compose-serve reuses main's
      // full-fleet vendor set via `readFleetVendorMeta`, and copying that here
      // is the obvious wrong optimization: `readFleetVendorMeta` THROWS unless
      // the full non-composition fleet is already in this host's artifact store,
      // which is exactly what a hermetic release host (fresh `git clone`, cold
      // store) does not have. Omitted, the pipeline resolves the vendor set from
      // this fleet's own requests — correct on any host.
      const source = composition
        ? await compositionFleetSource({ root, name: composition })
        : undefined;
      const result = await grant.run(() =>
        runWebArtifactsPipeline({
          root,
          stagingDir: stagingPath,
          minify: opts.minify,
          buildId,
          source,
          materialize: opts.materialize,
          log: (line) => lines.push({ text: line, stream: "stdout" }),
          onStage: async (id, label, run) => {
            const endStage = hooks.span(id, "build:frontend", label);
            try {
              return await run();
            } finally {
              endStage();
            }
          },
        }),
      );
      lines.push({
        text:
          `web artifacts: ${result.builtArtifacts} built, ${result.reusedArtifacts} reused ` +
          `(${result.webArtifacts} web + ${result.coreArtifacts} core), ` +
          `${result.vendorSpecs} vendors, ${result.preloads} preloads`,
        stream: "stdout",
      });
    } catch (err) {
      success = false;
      const message =
        err instanceof Error ? (err.stack ?? err.message) : String(err);
      for (const line of message.split("\n")) {
        lines.push({ text: line, stream: "stderr" });
      }
    }
    end();
    return {
      id: "viteBuild",
      label: "web artifacts",
      lines,
      durationMs: Math.round(performance.now() - start),
      success,
    };
  };

  // The heavy section itself: everything the host CPU grant covers (checks +
  // tsc + the artifact fleet), running on the grant it is handed. Extracted so
  // the acquire around it can be a retry loop (below) without the body moving.
  //
  // buildId is baked into the bundle (VITE_BUILD_ID) and written to
  // dist/.build-id below — bundle and server agree by construction (no
  // chicken-and-egg).
  const runHeavySection = async (grant: Grant): Promise<StepResult[]> => {
    const parallel: Array<Promise<StepResult>> = [];
    for (const job of companions) parallel.push(job(grant));
    parallel.push(webArtifactsJob(grant));
    return await Promise.all(parallel);
  };

  // Gate this heavy section (eslint + tsc + vite) behind a host CPU GRANT so
  // concurrent builds across worktrees don't thrash the machine. A main build
  // takes the interactive lane (its reserved floor is unreachable by agent
  // work, so it's never blocked by agent builds); an agent build takes the
  // background lane. The grant's `units` are subdivided across everything the
  // build fans out into (type-check workers, tsc, vite) — nothing re-acquires
  // host-wide. See @plugins/infra/plugins/host-admission.
  //
  // Duress admission valve: a background-lane build is held BEFORE it
  // queues for the host grant while the host duress latch is fresh, so no
  // new heavy work starts into a memory/congestion storm (event-driven
  // wait, 30-min sticky fail-open). Interactive (main), push, and the
  // detached auto-build are never held. See ../../admission-valve.ts and
  // research/2026-07-11-global-fleet-memory-admission-duress-valve.md.
  //
  // That hold covers only the PRE-QUEUE window. A build that entered the
  // grant's flock queue while the host was CALM can sit parked in it while
  // duress trips, and would otherwise walk straight into the storm — so the
  // acquire is a retry loop whose re-check happens INSIDE the grant, the
  // moment the slots are actually held. On a hit the closure returns
  // REQUEUE, `withHostGrant`'s `finally` releases the share, and we re-hold
  // at the valve. Barging is documented behaviour of the pool, so there is
  // no FIFO position to lose. `shouldRequeue` skips the re-check after a
  // fail-open hold — without that the loop would spin forever, since a
  // failed-open valve returns immediately while duress is still fresh. See
  // gap (a) in research/2026-07-12-global-host-admission-memory-dimension.md.
  const acquireAndRunHeavySection = async (): Promise<StepResult[]> => {
    // Profile the full admission wait (valve holds + grant queueing, across
    // requeues) — without a span this wait is an unexplained hole in the
    // build Gantt (a contended build once sat here ~5 min, unattributed).
    // The op record splits what this single span necessarily merges: one
    // `host-grant` wait per requeue cycle, each distinct from the valve's.
    const endGrantWait = hooks.span(
      "acquireHostGrant",
      "build:setup",
      "wait for host CPU grant",
    );
    for (;;) {
      const outcome = await holdThroughValve(
        { gated: opts.admission.gated },
        opts.admission.deps,
      );
      const result = await withHostGrant<StepResult[] | typeof REQUEUE>(
        {
          lane: opts.lane,
          max: cpuBudget().B,
          hooks: opts.admission.grantHooks,
        },
        async (grant) => {
          if (shouldRequeue(opts.admission.gated, outcome, isUnderDuress()))
            return REQUEUE;
          endGrantWait();
          return await runHeavySection(grant);
        },
      );
      if (result !== REQUEUE) return result;
      hooks.log(
        "build admission: duress tripped while queued for the host grant — " +
          "released the grant, re-holding at the valve...",
      );
    }
  };

  const steps = await acquireAndRunHeavySection();
  opts.onSteps?.(steps);

  const failedLabels = steps.filter((r) => !r.success).map((r) => r.label);
  if (failedLabels.length > 0) {
    await rm(stagingPath, { recursive: true, force: true });
    return { ok: false, steps, failedLabels };
  }

  // Write the commit hash at build time so the server can report drift.
  const commitProc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
  });
  const buildCommit = commitProc.stdout.toString().trim();
  if (buildCommit) {
    writeFileSync(resolve(stagingPath, ".build-commit"), buildCommit + "\n");
  }

  // The build id baked into the bundle, so the server can detect stale tabs.
  writeFileSync(resolve(stagingPath, ".build-id"), buildId + "\n");

  // The experimental frame, stamped into the staged index.html by the producer
  // that knows this is an agent-worktree deploy — not guessed from the hostname
  // by the browser, which cannot tell a worktree namespace from a composition
  // or a release preview.
  if (opts.experimental) stampExperimentalMarker(stagingPath);

  // Gapless publish via a `dist` → `dist.live.<pid>` symlink swap — see
  // ./dist-publish.ts for the mechanics (this supersedes the earlier
  // move-aside scheme, which left a real gap between two renames).
  const endPublish = hooks.span(
    "atomicPublish",
    "build:frontend",
    "atomic publish",
  );
  await publishDistAtomic({ dir: livePath, stagingPath });
  endPublish();

  return { ok: true, steps, stagingPath, livePath, buildCommit };
}
