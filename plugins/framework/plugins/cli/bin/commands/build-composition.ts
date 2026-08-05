import type { Command } from "commander";
import { basename, join, resolve } from "node:path";
import { markBuildInProgress } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { WEB_CORE_RELATIVE, worktreeDataDir } from "@plugins/infra/plugins/paths/server";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { createValveDeps } from "../admission-valve";
import { printStepBlocks } from "../build-output";
import { parseMigrationAnswers } from "../migrations";
import {
  acquireArtifactLock,
  buildAndPublishWebDist,
  fastValidationJobs,
  generateAppSources,
  maxRssLine,
  prepareCompositionSources,
  resolveFrontendMode,
  type ArtifactHooks,
} from "./internal/app-artifacts";
import { sweepDistLeftovers } from "./internal/dist-publish";

/**
 * The HERMETIC half of `./singularity build`: produce the app-artifact set for
 * one composition — filtered registries, generated migration SQL, the web dist —
 * as a deterministic function of (source tree, composition). Nothing here reads
 * or mutates the local dev cluster, so a release can be cut on a bare host from
 * a fresh `git clone`.
 *
 * A thin command over a shared pipeline, exactly like `regen-generated` is over
 * `codegen/core/regen-pipeline.ts`: every ordered step lives in
 * ./internal/app-artifacts.ts, which `build` also calls, so the two callers
 * cannot drift. Design + rationale:
 * research/2026-07-28-cli-hermetic-artifact-phase.md.
 *
 * Deliberately ABSENT, because the deploy they serve does not exist here:
 *   - the branch guard and therefore `--allow-main` (routinising a DANGER flag
 *     on every release from main erodes it; dropping it is a net improvement),
 *   - `--no-restart` / `--skip-checks` (nothing to restart; the fast validation
 *     set is unconditional),
 *   - `ensureHooksPath` / `registerMergeDrivers` / `checkBroadcasts` — git-config
 *     self-heals and an agent-facing message channel, both dev-workstation
 *     concerns nobody watches on a release host,
 *   - Postgres readiness, the worktree DB fork, gateway specs/restarts/health
 *     probes, the compose-serve stage,
 *   - the `build_runs` ledger, worktree-op markers, the build-progress log, the
 *     build profile and the verdict guard. A release already has its own durable
 *     artifact (`release-logs-<id>.json`); emitting build records for a run that
 *     is not a build is what polluted the build Gantt.
 * Consequently `hooks` below are light: `log` still reaches the console (the
 * release streams this process's stdout as its progress), but no span, footprint
 * or step is persisted anywhere.
 *
 * NOT an op command (`orphan-guard.ts`'s `OP_COMMANDS`) on purpose. The original
 * reason was that op commands re-exec'd under `bun --inspect`, which would have
 * inserted a re-exec layer into `release`'s process tree for no benefit; that
 * re-exec was removed 2026-07-28 with the op-wedge watchdog, so membership today
 * would only install the orphan guard. Still left out rather than re-litigated:
 * `release` shells out to this command and owns its lifetime, so the foreground
 * "my invoking shell died" guard is not the lifecycle this process has.
 *
 * ESM-FREEZE CONSTRAINT — load-bearing, see the app-artifacts docblock. This
 * file's transitive import set MUST stay a SUBSET of `build.ts`'s. Bun freezes a
 * module on its first `import()`; `regenerateManifestCodegen` (stage 2) must arm
 * `setPreBarrelImportGuard` BEFORE any plugin barrel is imported, or
 * `generateConfigOrigins` re-imports stale barrels and `pruneOrphanedConfigFiles`
 * DELETES a freshly-authored config override — silent data loss. Keeping the set
 * a subset makes that property INHERITED from the caller that already has it,
 * never re-derived. Every import above is one `build.ts` already makes (directly
 * or through ./internal/app-artifacts.ts); adding one it does not is a
 * correctness change, not a convenience.
 */
export function registerBuildComposition(program: Command) {
  program
    .command("build-composition")
    .description(
      "Produce the hermetic app artifact set for a composition — filtered registries, " +
        "generated migrations, and the web dist — without touching the local dev cluster " +
        "(no Postgres, no DB fork, no gateway, no run ledger). The phase `release` runs; " +
        "shared with `build` via commands/internal/app-artifacts.ts.",
    )
    .requiredOption(
      "--composition <name>",
      "Composition to produce artifacts for (required — this command exists only for the composition/release path).",
    )
    .option(
      "--migration-name <slug>",
      "Name for a new migration (required if any plugin schema has changed)",
    )
    .option(
      "--reset-migration",
      "Drop branch-local SCHEMA migration files (those absent from origin/main, that carry a drizzle snapshot) before generating. Recovers from snapshot-chain Y-forks after rebasing onto main. Data/backfill migrations (snapshot-less) are preserved.",
    )
    .option(
      "--custom-migration",
      "Create a snapshot-less DATA/BACKFILL migration (DML only). Generates an empty SQL file with no drizzle snapshot; edit it to add UPDATE/INSERT/DELETE before the next build applies it.",
    )
    .option(
      "--migration-answers <json>",
      'JSON array of answers for drizzle-kit rename/create prompts. Each entry is {"action":"create"} or {"action":"rename","from":"<source_name>"}. Run without this flag first to see detected prompts.',
    )
    .option(
      "--no-minify",
      "Skip esbuild minification (debugging). The minify flag is an artifact-hash input.",
    )
    .action(
      async (opts: {
        composition: string;
        migrationName?: string;
        resetMigration?: boolean;
        customMigration?: boolean;
        migrationAnswers?: string;
        minify: boolean;
      }) => {
        // Mark this process as a build: dist-comparing checks (map-in-sync) skip
        // while the dist they'd inspect is the one this run replaces. True for an
        // artifact-only run too — it rewrites exactly that dist.
        markBuildInProgress();

        const root = await getWorktreeRoot();
        const name = basename(root);

        // Composition builds are always monolithic; passing `composition` makes
        // that unconditional inside the shared resolver rather than asserted here.
        const artifactsMode = resolveFrontendMode({
          composition: opts.composition,
          env: process.env,
          log: (line) => console.log(line),
        }).artifacts;

        // A release is NOT a build run, so `SINGULARITY_BUILD_ID` is deliberately
        // neither read nor written here: reading it would make a release adopt the
        // id of whatever build spawned it (and, through the profiler/log writers,
        // append to that build's artifacts); writing it would leak this id into
        // every child. The id exists only to be baked into the bundle
        // (VITE_BUILD_ID) and written to `dist/.build-id`, so bundle and server
        // agree by construction.
        const shortCommitProc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
          cwd: root,
          stdout: "pipe",
        });
        const shortCommit = shortCommitProc.stdout.toString().trim();
        const buildId = `${shortCommit || "nocommit"}-${Date.now()}`;

        // The per-checkout artifact lock. REQUIRED, and the one non-obvious
        // hermetic step: it is the only thing serializing this run against a
        // concurrent `./singularity build` in the same checkout — both rewrite the
        // committed registries and publish over the same `dist`. A plain
        // filesystem symlink, so it works on a bare host. Sweeping the dist dir's
        // leftovers is the caller's job (see the app-artifacts docblock) and must
        // happen before any staging dir exists.
        const webDir = resolve(root, WEB_CORE_RELATIVE);
        await acquireArtifactLock(webDir);
        await sweepDistLeftovers(resolve(webDir, "dist"));

        // Light observability seam: console only. No build profile, no
        // build-progress log, no footprint step — see the module docblock.
        const hooks: ArtifactHooks = {
          span: () => () => undefined,
          pushSpan: () => undefined,
          log: (line) => console.log(line),
          recordFootprint: (label, maxRssBytes) => {
            const line = maxRssLine(label, maxRssBytes);
            if (line !== null) console.log(line);
          },
        };

        // Stage 1 — dependencies + registry-level codegen + the filtered
        // composition registries.
        await prepareCompositionSources({ root, composition: opts.composition, hooks });

        // Stage 2 — migrations + manifest-level codegen + the mandatory
        // config-override seed. MAY TERMINATE THE PROCESS on a migration prompt
        // (exit 2) or a missing --migration-name (exit 1); `release` relies on
        // that exit code.
        await generateAppSources({
          root,
          worktreeName: name,
          migration: {
            name: opts.migrationName,
            reset: opts.resetMigration,
            custom: opts.customMigration,
            answers: opts.migrationAnswers
              ? parseMigrationAnswers(opts.migrationAnswers)
              : undefined,
          },
          hooks,
        });

        // The `--skip-checks` validation set — always-run checks (incl.
        // `schema-files-loadable`, the net that catches a silently-dropped table
        // in this run's migration set) plus one incremental tsc per runtime
        // entrypoint. Shared with `build`, so neither can drift on what a fast
        // artifact build still proves. Unconditional: the full checks pass is
        // build-specific observability and a release is downstream of it.
        const companions = await fastValidationJobs({
          root,
          checkLogFile: join(worktreeDataDir(name), "check.log"),
          background: false,
          hooks,
        });

        // Stage 3 — the heavy section under ONE host CPU grant, then the atomic
        // dist publish. Interactive lane: a human or the release engine is
        // blocked on this, and there is no agent-branch fan-out to demote.
        // `gated: false` — the duress valve gates background-lane builds only, so
        // the hold would be inert anyway; saying so explicitly beats relying on
        // it. Real valve deps regardless, so the shape is never a test double.
        const artifact = await buildAndPublishWebDist({
          root,
          webDir,
          buildId,
          composition: opts.composition,
          artifactsMode,
          minify: opts.minify,
          // A release artifact is never experimental — it is the shipped app.
          experimental: false,
          lane: "interactive",
          background: false,
          companions,
          admission: { gated: false, deps: createValveDeps() },
          onSteps: (steps) => printStepBlocks(steps),
          hooks,
        });

        if (!artifact.ok) {
          // Stage 3 already removed its staging dir, so nothing was published and
          // there is nothing left to reclaim. The step blocks were printed by
          // `onSteps` above; this is the roster that names the failure.
          console.error(
            `\nARTIFACT BUILD FAILED — ${artifact.failedLabels.join(", ")}\n` +
              `  ${artifact.steps.map((s) => `${s.label} ${s.success ? "✓" : "✗"}`).join("   ")}\n` +
              `Nothing was published; ${resolve(webDir, "dist")} still resolves to the previous release.`,
          );
          process.exit(1);
        }

        console.log(
          [
            "",
            `Composition artifacts ready for "${opts.composition}":`,
            `  web dist:   ${artifact.livePath} → ${artifact.stagingPath}`,
            `  build id:   ${buildId}`,
            `  commit:     ${artifact.buildCommit || "(unknown)"}`,
          ].join("\n"),
        );
      },
    );
}
