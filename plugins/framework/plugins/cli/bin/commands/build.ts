import type { Command } from "commander";
import os from "node:os";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { rename, rm } from "fs/promises";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { adaptiveTimeoutMs } from "./adaptive-timeout";
import { acquireBuildLock } from "../build-lock";
import { distStagingPath, publishDistAtomic, sweepDistLeftovers } from "./internal/dist-publish";
import { runComposeServeStage } from "./internal/compose-serve";
import { WEB_CORE_RELATIVE } from "@plugins/infra/plugins/paths/server";
import { basename, join, resolve } from "path";
import { generateMigration, type MigrationAnswer } from "../migrations";
import { collectAllPlugins, propagateConfigToUser, regenerateRegistryCodegen, regenerateManifestCodegen, generateCompositionRegistry, clearCompositionRegistries, COMPOSITION_NAME_RE, type CodegenStep } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { resolveComposition, flattenManifest } from "@plugins/plugin-meta/plugins/closure/core";
import { compositionsConfig, manifestItemToManifest } from "@plugins/plugin-meta/plugins/composition/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { routesFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";
import { checkBroadcasts } from "../broadcasts";
import { getMainRepoRoot } from "../git/main-repo-root";
import { registerMergeDrivers } from "../git/register-merge-drivers";
import { runChecks, listAllChecks, discoverTscTargets, tsBuildInfoPath, materializeWarmBase, publishWarmBase, markBuildInProgress } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { runWebArtifactsPipeline } from "@plugins/framework/plugins/tooling/plugins/web-artifacts/core";
import { listDatabases, forkTempPrefix } from "@plugins/database/plugins/admin/server";
import {
  libpqEnv,
  readDatabaseConfig,
  worktreeDataDir,
  worktreeArtifacts,
  PG_LOG_FILE,
  SINGULARITY_DIR,
} from "../paths";
import { buildProfilerStart, pushBuildSpan, writeBuildProfile } from "../profiler";
import { openBuildProgress, finishBuildProgress } from "../build-progress";
import { withHostGrant } from "@plugins/infra/plugins/host-admission/server";
import { cpuBudget, type Grant, type Lane } from "@plugins/infra/plugins/host-admission/core";
import { isUnderDuress } from "@plugins/infra/plugins/duress/plugins/latch/server";
import { createValveDeps, holdThroughValve, shouldRequeue, valveGates, type ValveDeps } from "../admission-valve";
import { laneFor, publishLane } from "../lane";
import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/server";
import { pushBuildStepLog, writeBuildLogs } from "../build-logs-writer";
import { renderStepBlock, orderStepsForDisplay, renderVerdict, emitVerdict, installVerdictGuard, type Verdict } from "../build-output";
import { createOpProfiler } from "@plugins/debug/plugins/profiling/plugins/op-log/server";
import { markWorktreeOpStart, setWorktreeOpPhase, clearWorktreeOp, writeWorktreeSpec } from "@plugins/infra/plugins/worktree/server";
import { zeroCacheSpec } from "@plugins/infra/plugins/launcher/server";

// Worktree names are gateway namespaces — same rule as composition ids (the
// canonical TS copy lives in codegen's plugin-registry-gen.ts).
const NAME_REGEX = COMPOSITION_NAME_RE;
const CENTRAL_ROUTES_FILE = join(SINGULARITY_DIR, "central-routes.json");

function parseMigrationAnswers(raw: string): MigrationAnswer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    console.error(
      `Error: --migration-answers is not valid JSON.\n` +
        `Expected: '[{"action":"create"},{"action":"rename","from":"old_name"}]'\n`,
    );
    process.exit(1);
  }
  if (!Array.isArray(parsed)) {
    console.error(
      `Error: --migration-answers must be a JSON array.\n` +
        `Expected: '[{"action":"create"},{"action":"rename","from":"old_name"}]'\n`,
    );
    process.exit(1);
  }
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (entry.action === "create") continue;
    if (entry.action === "rename" && typeof entry.from === "string") continue;
    console.error(
      `Error: --migration-answers[${i}] is invalid: ${JSON.stringify(entry)}\n` +
        `Each entry must be {"action":"create"} or {"action":"rename","from":"<source_name>"}.\n`,
    );
    process.exit(1);
  }
  return parsed as MigrationAnswer[];
}

interface CentralRoutesManifest {
  backend: string;
  routes: string[];
}

/**
 * Runtime-level routes registered by `central-core/bin/index.ts` itself rather
 * than by any plugin's barrel. The build pipeline can't see these via plugin
 * scanning, so they're hard-coded baseline entries on the manifest.
 */
const CENTRAL_RUNTIME_ROUTES: ReadonlyArray<string> = [
  "/ws/central-notifications",
  "/api/central-resources/",
];

/**
 * Collect path prefixes from every plugin's `central/index.ts`, plus the
 * runtime-level routes above. HTTP route keys are method-prefixed
 * (`"GET /api/auth/state"`); we strip the method and truncate at the first
 * `/:param` to get a forward-routable prefix. WS routes are taken as-is
 * (literal paths).
 */
async function collectCentralRoutes(root: string): Promise<string[]> {
  const out = new Set<string>(CENTRAL_RUNTIME_ROUTES);
  for (const p of await collectAllPlugins(root)) {
    const data = getFacet(p, routesFacetDef);
    if (!data) continue;
    for (const r of data.routes) {
      if (r.runtime !== "central") continue;
      if (r.type === "http") {
        const space = r.route.indexOf(" ");
        const path = space >= 0 ? r.route.slice(space + 1) : r.route;
        const colon = path.indexOf("/:");
        out.add(colon >= 0 ? path.slice(0, colon + 1) : path);
      } else {
        out.add(r.route);
      }
    }
  }
  return Array.from(out).sort();
}

async function writeCentralRoutesManifest(root: string): Promise<void> {
  const manifest: CentralRoutesManifest = {
    backend: "central",
    routes: await collectCentralRoutes(root),
  };
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  const tmp = `${CENTRAL_ROUTES_FILE}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n");
  await rename(tmp, CENTRAL_ROUTES_FILE);
}

async function exec(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<{ maxRssBytes: number | undefined }> {
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
    env: env ? { ...process.env, ...env } : undefined,
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    process.exit(1);
  }
  return { maxRssBytes: proc.resourceUsage()?.maxRSS };
}


interface StepOutput {
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  exitCode: number;
  /** Peak RSS of the child (bytes), when the runtime reported rusage. */
  maxRssBytes: number | undefined;
}

async function execBuffered(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<StepOutput> {
  const lines: StepOutput["lines"] = [];
  const proc = Bun.spawn(cmd, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: env ? { ...process.env, ...env } : undefined,
  });

  async function collect(
    stream: ReadableStream<Uint8Array> | null,
    type: "stdout" | "stderr",
  ) {
    if (!stream) return;
    const decoder = new TextDecoder();
    let partial = "";
    for await (const chunk of stream) {
      const text = partial + decoder.decode(chunk, { stream: true });
      const parts = text.split("\n");
      partial = parts.pop()!;
      for (const line of parts) {
        if (line) lines.push({ text: line, stream: type });
      }
    }
    if (partial) lines.push({ text: partial, stream: type });
  }

  await Promise.all([
    collect(proc.stdout, "stdout"),
    collect(proc.stderr, "stderr"),
  ]);
  const exitCode = await proc.exited;
  return { lines, exitCode, maxRssBytes: proc.resourceUsage()?.maxRSS };
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
function maxRssLine(label: string, maxRssBytes: number | undefined): string | null {
  if (maxRssBytes == null) return null;
  const gb = maxRssBytes / 1e9;
  const amount = gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(maxRssBytes / 1e6)} MB`;
  return `${label}: maxRSS ${amount}`;
}

interface StepResult {
  id: string;
  label: string;
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  durationMs: number;
  success: boolean;
}

/**
 * Returned from inside the host grant when the post-acquire duress re-check
 * fires: the heavy section did NOT run, and `withHostGrant`'s `finally` releases
 * the share on the way out — so the caller can re-hold at the valve and try
 * again. A `unique symbol` so it can never collide with a real `StepResult[]`.
 */
const REQUEUE = Symbol("requeue");

function printStepResults(results: StepResult[]): void {
  for (const result of orderStepsForDisplay(results)) {
    for (const { text, stream } of renderStepBlock(result)) {
      if (stream === "stderr") process.stderr.write(`${text}\n`);
      else process.stdout.write(`${text}\n`);
    }
  }
}

async function getWorktreeRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("Not in a git repository");
    process.exit(1);
  }
  return output.trim();
}

async function getCurrentBranch(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("Could not determine current branch");
    process.exit(1);
  }
  return output.trim();
}

// Self-heal `core.hooksPath`. `.githooks/prepare-commit-msg` is how each
// commit gets its Singularity-Conversation trailer, which in turn is how
// push-watcher attributes commits back to the originating task. Drift here
// is silent — no error, just orphaned pushes — so check on every build and
// reset to the tracked value.
async function ensureHooksPath(): Promise<void> {
  const read = Bun.spawn(["git", "config", "--get", "core.hooksPath"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const current = (await new Response(read.stdout).text()).trim();
  await read.exited;
  if (current === ".githooks") return;
  const write = Bun.spawn(["git", "config", "core.hooksPath", ".githooks"], {
    stdout: "pipe",
    stderr: "inherit",
  });
  const exitCode = await write.exited;
  if (exitCode !== 0) {
    console.error(
      `Failed to set core.hooksPath=.githooks (was ${current ? `"${current}"` : "unset"}).`,
    );
    process.exit(1);
  }
  console.log(
    `Fixed core.hooksPath: was ${current ? `"${current}"` : "unset"}, now ".githooks"`,
  );
}

// Returns true once the forked DB exists. With atomic-publish forks (temp DB +
// rename as the last step — see plugins/database/plugins/admin/server/internal/fork.ts),
// the canonical name appears only when the fork fully completed, so an
// existence check against pg_database is sufficient — no need to probe table
// contents to distinguish a half-baked DB.
async function databaseReady(name: string): Promise<boolean> {
  // Use a direct pg client instead of `psql`: psql is not bundled by
  // embedded-postgres, and we'd rather not depend on the user's PATH for
  // routine readiness checks. Connect to `postgres` (the target may not exist
  // yet) and query pg_database for the target.
  const env = libpqEnv();
  const { Client } = await import("pg");
  const c = new Client({
    host: env.PGHOST!,
    port: parseInt(env.PGPORT!, 10),
    user: env.PGUSER!,
    database: "postgres",
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    const r = await c.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    return (r.rowCount ?? 0) > 0;
  } catch (err) {
    // Any pg connection / query error means the DB is not ready yet.
    if (!(err instanceof Error)) throw err;
    return false;
  } finally {
    try {
      await c.end();
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {}
  }
}

/**
 * Wait for the database to be reachable. Skipped when no managed services
 * are configured (externally managed DB, assumed ready).
 */
async function waitForPg(): Promise<void> {
  const config = readDatabaseConfig();
  if (config.services.length === 0) return;
  const env = libpqEnv();
  const { Client } = await import("pg");
  let lastErr: string | null = null;
  await retryUntil(
    async (attempt) => {
      const c = new Client({
        host: env.PGHOST,
        port: parseInt(env.PGPORT!, 10),
        user: env.PGUSER,
        database: "postgres",
        connectionTimeoutMillis: 1500,
      });
      try {
        await c.connect();
        await c.query("SELECT 1");
        await c.end();
        return true;
      // eslint-disable-next-line promise-safety/no-absorbed-failure -- readiness-probe retry: null signals "not ready yet, keep retrying" (lastErr captured for the deadline message); a genuine failure surfaces loudly via onDeadline → process.exit(1)
      } catch (err) {
        lastErr = err instanceof Error ? err.message : String(err);
        // eslint-disable-next-line promise-safety/no-bare-catch
        try { await c.end(); } catch {}
        if (attempt === 0) console.log("Waiting for embedded Postgres to be ready...");
        return null;
      }
    },
    {
      delay: fixed(500),
      deadline: 60_000,
      onDeadline: () => {
        console.error(
          `ERROR: embedded Postgres did not become ready within 60s (last: ${lastErr ?? "no response"}).`,
        );
        console.error(`Check ${PG_LOG_FILE} for details.`);
        process.exit(1);
      },
    },
  );
}

async function waitForWorktreeDatabase(name: string): Promise<void> {
  if (await databaseReady(name)) return; // standard path, ~always already done

  const inFlight = (await listDatabases()).some((d) =>
    d.startsWith(forkTempPrefix(name)),
  );

  if (inFlight) {
    // A fork is actively restoring (temp DB exists). Be patient.
    const done = await retryUntil(
      async (attempt) => {
        if (await databaseReady(name)) return true;
        if (attempt === 0) console.log(`DB fork for "${name}" in progress; waiting…`);
        return null;
      },
      { delay: fixed(1_000), deadline: 120_000, onDeadline: () => false },
    );
    if (done) return;
    console.error(
      `ERROR: DB fork for "${name}" did not finish within 120s. The database.fork ` +
        `job may be dead — check /api/jobs on the main app.`,
    );
    process.exit(1);
  }

  // No DB and no restore in flight. Either a standard-path job is still queued/
  // gated, or this worktree was created outside Singularity and has no job at
  // all. Grace-poll briefly for the queued case, then fail actionably.
  const done = await retryUntil(
    async (attempt) => {
      if (await databaseReady(name)) return true;
      if (attempt === 0) console.log(`Waiting for DB fork "${name}"…`);
      return null;
    },
    { delay: fixed(1_000), deadline: 20_000, onDeadline: () => false },
  );
  if (done) return;
  console.error(
    [
      `ERROR: no database for "${name}" and no fork in flight.`,
      "",
      "If this worktree was created outside Singularity (git worktree add),",
      "create its database with:",
      "",
      "    ./singularity db fork",
      "",
      "Then re-run ./singularity build.",
    ].join("\n"),
  );
  process.exit(1);
}

// Reads the gateway's authoritative state for one worktree. Returns null when
// the gateway is unreachable (connection refused / timeout) or the worktree is
// absent from the snapshot. Only connection/timeout errors are swallowed;
// anything unexpected is rethrown so it fails loudly.
async function getWorktreeState(
  name: string,
): Promise<{ state: string; lastSpawnErr: string } | null> {
  try {
    const resp = await fetch("http://localhost:9000/gateway/worktrees", {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return null;
    const entries = (await resp.json()) as Array<{
      name?: string;
      state?: string;
      lastSpawnErr?: string;
    }>;
    if (!Array.isArray(entries)) return null;
    const entry = entries.find((e) => e.name === name);
    if (!entry) return null;
    return { state: entry.state ?? "", lastSpawnErr: entry.lastSpawnErr ?? "" };
  } catch (err) {
    // Gateway not running (TypeError/connection refused) or request timed out
    // (DOMException AbortError). Anything else is unexpected — rethrow.
    if (!(err instanceof TypeError) && !(err instanceof DOMException)) throw err;
    return null;
  }
}

// Per-process identity of the backend currently served for `name`, or null when
// nothing is serving yet (cold start) or it's unreachable. The gateway only ever
// routes to a backend past its ready barrier, so a change in this value across a
// restart proves the NEW (ready) backend took over — not the stale old one.
async function readHealthStartedAt(name: string): Promise<number | null> {
  try {
    const resp = await fetch(`http://${name}.localhost:9000/api/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    if (!resp.ok) return null;
    const body = (await resp.json()) as { startedAt?: unknown };
    return typeof body.startedAt === "number" ? body.startedAt : null;
  } catch (err) {
    if (!(err instanceof TypeError) && !(err instanceof DOMException)) throw err;
    return null;
  }
}

// Verifies the freshly-restarted backend actually took over. `previousStartedAt`
// is the per-process identity of the backend serving BEFORE the restart POST
// (null on a cold start, where nothing was serving yet). On a hot restart the
// gateway is blue/green: it swaps `w.active` to the new backend only once that
// backend clears its ready barrier, so a served `startedAt` greater than
// `previousStartedAt` proves the NEW (ready) backend is live. Reading only
// `resp.ok` is not enough — a failed hot-restart leaves the OLD backend
// answering `{ok:true}` with stale code and the build would falsely pass.
// `restartError` carries the gateway's 500 body, if any, for the failure message.
// Returns a soft-degrade note when the server was still booting under host load
// but the artifacts are valid (folded into the success verdict), or null on a
// clean pass. An unambiguous deploy failure (a hot restart whose new backend
// never took over) routes through `onDeployFailure`, which never returns.
async function probeHealth(
  name: string,
  previousStartedAt: number | null,
  restartError: string | null,
  onDeployFailure: (reason: string[]) => never,
): Promise<string | null> {
  const isRestart = previousStartedAt != null;
  const deadline = adaptiveTimeoutMs(20_000, 120_000);
  console.log(`Probing /api/health... (deadline ${Math.round(deadline / 1000)}s)`);
  const url = `http://${name}.localhost:9000/api/health`;
  const site = `http://${name}.localhost:9000`;
  let lastStatus: number | string = "no response";
  const result = await retryUntil<true, Promise<string | null>>(
    async () => {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5_000) });
        if (resp.ok) {
          // Cold start: any healthy backend is the one we just built.
          if (!isRestart) return true;
          // Hot restart: the gateway swaps `w.active` to the new backend only
          // after it passes `waitReady`, so a served `startedAt` past the old
          // one proves the new backend is live AND ready. Without this a failed
          // hot-restart leaves the old backend answering ok and the build
          // falsely passes.
          // eslint-disable-next-line promise-safety/no-absorbed-failure -- health-probe body read; null means "no/unparseable startedAt", handled below as "stale backend, keep polling" — not a data result the caller trusts
          const body = (await resp.json().catch(() => null)) as { startedAt?: unknown } | null;
          const startedAt = typeof body?.startedAt === "number" ? body.startedAt : null;
          if (startedAt != null && startedAt > previousStartedAt) return true;
          lastStatus = `stale backend (startedAt ${startedAt} <= ${previousStartedAt})`;
          return null;
        }
        lastStatus = resp.status;
      } catch (err) {
        // A per-attempt abort (DOMException) is just a slow request — record it
        // and let retryUntil try again like any other failed attempt.
        lastStatus = err instanceof Error ? err.message : String(err);
      }
      return null;
    },
    {
      delay: fixed(250),
      deadline,
      // On deadline we ask the gateway for the worktree's authoritative state
      // instead of blindly declaring a crash. A stopwatch expiring is not the
      // same as a boot failure under host load.
      onDeadline: async () => {
        // A hot restart whose new backend never became the served backend is an
        // unambiguous deploy failure: the gateway SIGKILLed it (state reverts to
        // "running", never "broken") and is still serving the previous backend's
        // stale code. There is no lenient interpretation for this path — fail the
        // build. finalizeBuild runs via the process.on("exit") handler.
        if (isRestart) {
          const detail = restartError ? `Gateway restart error: ${restartError}` : "";
          onDeployFailure([
            `NOT DEPLOYED. ${site} still serves the previous backend (stale code).`,
            `The freshly-built backend never became ready within ${Math.round(deadline / 1000)}s — ` +
              `it failed its onReadyBlocking ready barrier (last: ${lastStatus}).`,
            ...(detail ? [detail] : []),
            `Inspect the backend log at ${join(worktreeDataDir(name), "logs")} for the throw.`,
          ]);
        }
        const load1 = Math.round((os.loadavg()[0] ?? 0) * 10) / 10;
        const info = await getWorktreeState(name);
        if (!info) {
          console.warn(
            `Server didn't respond on /api/health within ${Math.round(deadline / 1000)}s ` +
              `(last: ${lastStatus}) and the gateway is unreachable. ` +
              `Build artifacts are valid; not blocking the build.`,
          );
          return "server still booting (gateway unreachable)";
        }
        switch (info.state) {
          case "broken":
            return onDeployFailure([
              `Server crashed during boot (state: broken): ${info.lastSpawnErr || "no error reported"}.`,
              `NOT DEPLOYED. ${site} still serves the previous build.`,
              `Inspect the backend log at ${join(worktreeDataDir(name), "logs")} for the throw.`,
            ]);
          case "running":
            console.log("Server is up.");
            return null;
          case "starting":
          case "restarting":
          case "idle":
            console.warn(
              `Server still booting after ${Math.round(deadline / 1000)}s under host load ` +
                `(load avg ${load1}). Build artifacts are valid; the gateway will finish ` +
                `bringing it up on demand. Not blocking the build.`,
            );
            return "server still booting under host load";
          default:
            console.warn(
              `Server didn't respond on /api/health within ${Math.round(deadline / 1000)}s ` +
                `(gateway state: ${info.state || "unknown"}, last: ${lastStatus}). ` +
                `Build artifacts are valid; not blocking the build.`,
            );
            return "server still booting";
        }
      },
    },
  );
  return result === true ? null : result;
}

// `/gateway/worktrees` is the gateway's own API and exists on every gateway
// version — a 200 here proves the gateway is alive. Central's own readiness
// is covered by the gateway's waitReady on its Unix socket; no separate
// central-side liveness probe.
async function probeGatewayHealth(): Promise<string | null> {
  console.log("Probing gateway /gateway/worktrees...");
  const url = "http://localhost:9000/gateway/worktrees";
  let lastStatus: number | string = "no response";
  const result = await retryUntil<true, string | null>(
    async () => {
      try {
        const resp = await fetch(url);
        if (resp.ok) return true;
        lastStatus = resp.status;
      } catch (err) {
        lastStatus = err instanceof Error ? err.message : String(err);
      }
      return null;
    },
    {
      delay: fixed(250),
      deadline: 10_000,
      onDeadline: () => {
        console.warn(
          `Gateway did not become healthy within 10s (last: ${lastStatus}). ` +
            `Build artifacts are valid; gateway will retry on next request.`,
        );
        return "gateway still starting";
      },
    },
  );
  return result === true ? null : result;
}

export function registerBuild(program: Command) {
  program
    .command("build")
    .description(
      "Build the frontend and register the worktree with the gateway",
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
      "Create a snapshot-less DATA/BACKFILL migration (DML only). Generates an empty SQL file with no drizzle snapshot; edit it to add UPDATE/INSERT/DELETE before the next build applies it. The file is re-hashed on each build and enforced DML-only by the data-migration-dml-only check. Stays out of the snapshot chain, so it never Y-forks and is push-safe.",
    )
    .option(
      "--migration-answers <json>",
      'JSON array of answers for drizzle-kit rename/create prompts. Each entry is {"action":"create"} or {"action":"rename","from":"<source_name>"}. Run without this flag first to see detected prompts.',
    )
    .option("--no-restart", "Skip asking the gateway to restart the backend")
    .option(
      "--skip-checks",
      "Skip the post-build runChecks() pass (faster dev iteration; checks still gate `push`).",
    )
    .option(
      "--allow-main",
      "DANGER: allow running build from the main branch. Agents MUST NOT pass this flag without explicit user approval in the current conversation.",
    )
    .option(
      "--composition <name>",
      "Build THIS checkout as the named composition (filtered singleton registry, monolithic frontend) — the release path. Unrelated to the auto-serve stage; see --serve-composition.",
    )
    .option(
      "--serve-composition <name>",
      "Force ONE composition through the compose-serve stage regardless of its autoBuild toggle (main checkout only; artifact mode only; skips the deactivation sweep). Composes a per-composition dist + empty DB served at http://<name>.localhost:9000.",
    )
    .option(
      "--monolith",
      "Force the monolithic vite build instead of the default per-plugin web artifacts (rollback escape hatch; also SINGULARITY_WEB_MONOLITH=1). Composition/release builds are always monolithic.",
    )
    .option(
      "--artifacts",
      "Accepted no-op: per-plugin web artifacts are the DEFAULT (kept so pre-flip invocations, incl. SINGULARITY_WEB_ARTIFACTS=1, don't break). Never active for --composition/release builds.",
    )
    .option(
      "--no-minify",
      "Artifact mode only: skip esbuild minification (debugging). The minify flag is an artifact-hash input.",
    )
    .action(async (opts: { migrationName?: string; resetMigration?: boolean; customMigration?: boolean; migrationAnswers?: string; restart: boolean; skipChecks?: boolean; allowMain?: boolean; composition?: string; serveComposition?: string; artifacts?: boolean; monolith?: boolean; minify: boolean }) => {
      // Mark this process as a build: dist-comparing checks (map-in-sync) skip
      // while the dist they'd inspect is the one this build replaces.
      markBuildInProgress();

      // Frontend mode. Per-plugin web artifacts are the DEFAULT for normal
      // (agent-branch and main) builds; the monolithic vite build is the
      // rollback escape hatch. Precedence: explicit flag > env > default.
      // Composition builds are ALWAYS monolithic regardless of flags/env — the
      // release pipeline shells out to `build --composition <name>`, so this
      // unconditional branch is its hard guard. `--artifacts` /
      // SINGULARITY_WEB_ARTIFACTS=1 remain accepted no-ops from the opt-in
      // phase, except where explicitly contradictory (fail loudly).
      if (opts.artifacts && opts.composition) {
        console.error(
          "ERROR: --artifacts cannot be combined with --composition (release/composition builds stay monolithic).",
        );
        process.exit(1);
      }
      if (opts.artifacts && opts.monolith) {
        console.error("ERROR: --artifacts and --monolith are contradictory.");
        process.exit(1);
      }
      const frontendMode: { artifacts: boolean; why: string } = opts.composition
        ? { artifacts: false, why: "composition/release builds are always monolithic" }
        : opts.monolith
          ? { artifacts: false, why: "--monolith" }
          : opts.artifacts
            ? { artifacts: true, why: "--artifacts" }
            : process.env.SINGULARITY_WEB_MONOLITH === "1"
              ? { artifacts: false, why: "SINGULARITY_WEB_MONOLITH=1" }
              : { artifacts: true, why: "default" };
      const artifactsMode = frontendMode.artifacts;
      console.log(
        `Frontend mode: ${artifactsMode ? "web artifacts" : "monolithic vite build"} (${frontendMode.why})`,
      );

      // Per-step wrapper for the shared codegen pipeline: keeps build's per-step
      // profiler granularity while the ordered call list lives in codegen core
      // (shared with `regen-generated`). `pluginDocs` historically lived under
      // the `build:validation` phase; every other codegen step under
      // `build:codegen` — preserve that mapping.
      const codegenStep: CodegenStep = async (id, label, run) => {
        const phase = id === "pluginDocs" ? "build:validation" : "build:codegen";
        const end = buildProfilerStart(id, phase, label);
        try {
          await run();
        } finally {
          end();
        }
      };

      let endSpan = buildProfilerStart("ensureHooksPath", "build:preflight", "ensureHooksPath");
      await ensureHooksPath();
      endSpan();

      endSpan = buildProfilerStart("registerMergeDrivers", "build:preflight", "registerMergeDrivers");
      await registerMergeDrivers(await getWorktreeRoot());
      endSpan();

      endSpan = buildProfilerStart("branchGuard", "build:preflight", "branch guard");
      const branch = await getCurrentBranch();
      if (branch === "main" && !opts.allowMain) {
        console.error(
          [
            "ERROR: refusing to build from the main branch.",
            "",
            "Agents should work in a worktree, not directly on main.",
            "If you are inside a worktree conversation, make sure you are running",
            "this command from the worktree directory, not the main repo.",
            "",
            "To override (only with explicit user permission): ./singularity build --allow-main",
          ].join("\n"),
        );
        process.exit(1);
      }
      endSpan();

      endSpan = buildProfilerStart("checkBroadcasts", "build:preflight", "checkBroadcasts");
      await checkBroadcasts("build");
      endSpan();

      const root = await getWorktreeRoot();
      const name = basename(root);

      // Open the durable, crash-safe build-progress log now that `name` (the same
      // basename(root) key the op marker and writeBuildProfile use) is known. Every
      // buildProfilerStart span from here on records an enter/leave + RSS to
      // ~/.singularity/build-progress.jsonl, so a wedged build names its phase and
      // heap trend even after SIGKILL. See research/2026-07-21-global-cli-op-wedge-gc-sink.md.
      openBuildProgress(name, process.env.SINGULARITY_BUILD_ID ?? null);

      // --serve-composition preflight. The compose-serve stage composes over
      // main's artifact fleet (vendor set + store), so it needs the MAIN
      // checkout in artifact mode — fail before any work, not after the build.
      if (opts.serveComposition !== undefined) {
        if (!artifactsMode) {
          console.error(
            "ERROR: --serve-composition requires artifact mode (it composes over the artifact fleet). " +
              "Drop --monolith / --composition / SINGULARITY_WEB_MONOLITH=1.",
          );
          process.exit(1);
        }
        if (root !== (await getMainRepoRoot())) {
          console.error(
            "ERROR: --serve-composition only runs from the MAIN checkout — " +
              "compositions are served from main's code and main's resolved config.",
          );
          process.exit(1);
        }
      }

      // Every build needs ONE stable id, shared by its build-log record, its
      // build-profile-<id>.json, its build-logs, and the bundle's .build-id —
      // so the profiling Gantt can open ANY build's detail by id, not just
      // UI-triggered ones. UI builds already set SINGULARITY_BUILD_ID
      // (run-build.ts); manual CLI builds (`./singularity build`) get a
      // generated one here. Write it back into the env so the profiler and
      // build-logs writers (which read the env var at write time) agree by
      // construction instead of falling back to id-less default filenames and
      // a null build-log buildId (which left manual builds un-clickable).
      const shortCommitProc = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], {
        cwd: root,
        stdout: "pipe",
      });
      const shortCommit = shortCommitProc.stdout.toString().trim();
      const buildId =
        process.env.SINGULARITY_BUILD_ID ?? `${shortCommit || "nocommit"}-${Date.now()}`;
      process.env.SINGULARITY_BUILD_ID = buildId;

      // A main build is human-blocking (interactive lane); an agent build is
      // background. Derived ONCE, here, because two consumers need the same
      // fact: this record (the lane explains WHY a wait was as long as it was)
      // and the heavy section's `withHostGrant` below.
      const lane: Lane = laneFor(branch === "main");

      // The op log's record for this build. `markRequested` lands where the old
      // build-log "started" record did — but the old record's `startedAt` was
      // ALSO the bar's start, stamped before `acquireBuildLock`, so `totalMs`
      // silently swallowed every wait: a build that queued 5 min and worked 1
      // rendered identically to one that worked 6. Here the waits below are
      // recorded as their own segments instead.
      //
      // `opId` is `buildId`: unique and non-null on every path (a UI build gets
      // SINGULARITY_BUILD_ID from run-build.ts, a manual CLI build the minted
      // `<commit>-<now>` above). `buildId` is passed AGAIN, separately, because
      // it means something else there — the join key to build-profile-<id>.json,
      // which is what makes a bar's span breakdown openable.
      const profiler = createOpProfiler("build", {
        opId: buildId,
        branch,
        opSlug: name,
        lane,
        buildId,
      });
      profiler.markRequested();

      // Mark this worktree as having a build in flight so the conversation
      // status poller keeps the agent's pane reading as "working" while the
      // CLI "shell" status persists (see worktree-op.ts). Written up-front as
      // "waiting-for-lock" and flipped to "running" once the per-worktree build
      // lock is granted below, so a build queued behind another reads as queued
      // rather than running. Cleared in finalizeBuild below, which runs on
      // every graceful exit.
      markWorktreeOpStart(name, "build", "waiting-for-lock");

      // Guarantee a terminal record on every *graceful* exit path — a thrown
      // build step, process.exit(1), or SIGINT/SIGTERM. Without this, any
      // failure before the explicit success/failure writes below leaves a
      // `requested` with no `completed`, which the reader can only render as an
      // ever-growing fake bar with no real end time. The exit handler captures
      // the true end timestamp. Only a hard kill (SIGKILL/OOM/power loss) —
      // which can't run handlers — legitimately leaves a record open; those are
      // the orphans `finalizeOrphanedOps` closes as "interrupted".
      // Mirrors the on-exit lock release in acquireBuildLock above.
      let buildFinalized = false;
      const finalizeBuild = (success: boolean): void => {
        if (buildFinalized) return;
        buildFinalized = true;
        clearWorktreeOp(name, "build");
        // Close the durable build-progress run. A wedge is exactly the build that
        // never reaches this hook, so no `done` line + a live pid = wedged mid-phase
        // (outstanding span names it); a `done` line + a live pid = the
        // "hung on exit after finishing" case (occ. C).
        finishBuildProgress(success);
        profiler.complete(success ? "success" : "failed");
        profiler.write();
      };
      process.on("exit", () => finalizeBuild(false));

      // The build cannot terminate without printing its own verdict. Registered
      // after finalizeBuild's exit hook so handlers run in order and the
      // banner is written last. Earlier exits (getWorktreeRoot, name/branch
      // guards, parseMigrationAnswers) fire before this point and before any
      // artifact is touched, so there is no deploy ambiguity for them to resolve.
      installVerdictGuard({
        url: `http://${name}.localhost:9000`,
        buildLogPath: worktreeArtifacts.buildLogText(name, buildId),
      });

      // Catchable fatal signals → graceful exit so the exit handlers above
      // (build-log finalize) and the lock release run. SIGKILL is uncatchable —
      // the dead-holder ESRCH steal in acquireBuildLock is the backstop there.
      for (const [sig, code] of [
        ["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129], ["SIGQUIT", 131],
      ] as const) {
        process.on(sig, () => process.exit(code));
      }

      endSpan = buildProfilerStart("nameValidation", "build:preflight", "name validation");
      if (!NAME_REGEX.test(name)) {
        console.error(
          `Invalid worktree name "${name}". Must match ${NAME_REGEX}`,
        );
        process.exit(1);
      }
      endSpan();

      endSpan = buildProfilerStart("acquireBuildLock", "build:setup", "acquire build lock");
      const webDir = resolve(root, WEB_CORE_RELATIVE);
      await profiler.wait("build-lock", () => acquireBuildLock(resolve(webDir, ".build.lock")));
      // Build lock granted — flip the marker from waiting to running so the UI
      // clocks build time from here, not from the queued wait.
      setWorktreeOpPhase(name, "build", "running");
      // The build lock is this build's ENTRY ticket, so this is where it stops
      // queuing and starts its own work. It is NOT done waiting: the duress
      // valve and the host grant below are both post-`granted`, and are where a
      // contended build actually spends its minutes.
      profiler.markGranted();
      endSpan();

      endSpan = buildProfilerStart("sweepStaging", "build:setup", "sweep staging leftovers");
      await sweepDistLeftovers(resolve(webDir, "dist"));
      endSpan();

      // The non-heavy phases — `bun install`, drizzle generate, and the build
      // orchestrator process itself — run outside every host grant and, unlike
      // the heavy steps, produce no StepResult, so their maxRSS lines have no
      // step block to ride into build.log. Rather than invent a second log
      // mechanism, they are collected here and flushed as ONE synthetic step
      // through the same `pushBuildStepLog` seam the heavy steps use — so
      // `grep maxRSS <build.log>` finds every measured phase of a build in one
      // place, which is exactly what the calibration pass needs. See
      // research/2026-07-12-global-host-admission-memory-dimension.md (gap 0).
      const footprintLines: StepResult["lines"] = [];
      const recordFootprint = (label: string, maxRssBytes: number | undefined): void => {
        const line = maxRssLine(label, maxRssBytes);
        if (line === null) return;
        console.log(line);
        footprintLines.push({ text: line, stream: "stdout" });
      };
      // Flushed on every path that persists the build's artifacts (both writers
      // read a module-level array, so this must run before them). Samples the
      // orchestrator's own footprint here: `process.resourceUsage().maxRSS` is a
      // TRUE peak (getrusage RUSAGE_SELF; Bun reports it in bytes), not an
      // instantaneous sample, so it covers every in-process phase — registry /
      // manifest / composition codegen, config propagation, the checks driver —
      // no matter when it is read. Idempotent.
      let footprintFlushed = false;
      const flushFootprint = (): void => {
        if (footprintFlushed) return;
        footprintFlushed = true;
        const orchestratorRss = process.resourceUsage().maxRSS;
        recordFootprint("build orchestrator", orchestratorRss);
        // The build profile carries spans only, and the profiling UI's phase set
        // is a closed list (debug/profiling/build/web/phases.ts), so the
        // orchestrator's peak rides a zero-width marker span in an existing
        // phase rather than inventing one the Gantt could not render.
        buildProfilerStart("buildOrchestrator", "build:deploy", "build orchestrator")({
          maxRssBytes: orchestratorRss,
        });
        if (footprintLines.length > 0) {
          pushBuildStepLog({
            id: "resourceUsage",
            label: "resource usage",
            lines: footprintLines,
            durationMs: 0,
            success: true,
          });
        }
      };

      // 1. Install dependencies. Required before the gateway can find the
      // platform-specific embedded-postgres binaries under
      // plugins/infra/plugins/database/node_modules/@embedded-postgres/.
      endSpan = buildProfilerStart("bunInstall", "build:setup", "bun install");
      console.log("Installing dependencies...");
      const install = await exec(["bun", "install"], root);
      endSpan({ maxRssBytes: install.maxRssBytes });
      recordFootprint("bun install", install.maxRssBytes);

      // 1b–2a. Registry-level repo-tree codegen: barrel-import auto-stubs (from
      // .d.ts files) then the plugin registry. Must happen before central is
      // spawned so its plugins.generated.ts is in sync. Shared with the push-time
      // `regen-generated` normalize step via the codegen core pipeline so a full
      // build after a push reproduces the exact same tree. Per-step profiler
      // spans are threaded through `onStep` so build keeps its granularity.
      console.log("Generating plugin registry...");
      await regenerateRegistryCodegen({ root, onStep: codegenStep });

      // 2a'. Composition build-gating. With `--composition`, emit gitignored
      // filtered registries (the bundle's hard closure) beside the committed
      // full ones; the web/server import seams select the filtered file. Without
      // the flag, clear any stale filtered registries so the runtimes revert to
      // the full committed set. The committed `<dir>.generated.ts` files are
      // never touched either way, so the build stays byte-identical.
      endSpan = buildProfilerStart("compositionRegistry", "build:codegen", "composition registry");
      if (opts.composition) {
        const items = compositionsConfig.fields.manifests.defaultValue;
        const item = items.find((m) => m.id === opts.composition);
        if (!item) throw new Error(`Unknown composition "${opts.composition}". Known: ${items.map((m) => m.id).join(", ")}`);
        const allManifests = items.map(manifestItemToManifest);
        const flat = flattenManifest(manifestItemToManifest(item), allManifests);
        const tree = await buildPluginTree(join(root, "plugins"), { skipBarrelImport: true, facets: true });
        const bundle = resolveComposition(tree, flat).bundle;
        await generateCompositionRegistry({ root, bundle });
        console.log(`Composition "${opts.composition}": ${bundle.size} plugins in closure.`);
      } else {
        await clearCompositionRegistries({ root });
      }
      endSpan();

      // 2b. Refresh the central-routes manifest so the gateway knows which
      // path prefixes are owned by central plugins.
      endSpan = buildProfilerStart("centralRoutes", "build:codegen", "central routes manifest");
      await writeCentralRoutesManifest(root);
      endSpan();

      // 2b'. Write the central spec early too — otherwise the gateway has no
      // way to spawn central. (Repeated at end of build for idempotency.)
      // central.json always points at *main's* central-core/, not the current
      // worktree's: central is a singleton serving every worktree, so the
      // canonical source is main. The file is idempotent across worktree
      // builds — same content every time.
      endSpan = buildProfilerStart("centralJson", "build:codegen", "central.json");
      const mainRoot = await getMainRepoRoot();
      const centralDir = resolve(mainRoot, "plugins/framework/plugins/central-core");
      if (existsSync(join(centralDir, "bin", "index.ts"))) {
        writeWorktreeSpec({ name: "central", server: centralDir });
      }
      endSpan();

      // 2c. Ensure the embedded Postgres cluster is up. The gateway owns
      // PG supervision now (see gateway/postgres.go) and answers
      // /api/database/status from its own state — central is not involved.
      endSpan = buildProfilerStart("waitForPg", "build:database", "wait for Postgres");
      await waitForPg();
      endSpan();

      // 2d. Ensure the worktree's DB fork has completed (forked asynchronously
      // during conversation creation).
      endSpan = buildProfilerStart("waitForDatabase", "build:database", "wait for DB fork");
      await waitForWorktreeDatabase(name);
      endSpan();

      // 3. Regenerate DB migrations from plugin schema files
      endSpan = buildProfilerStart("generateMigration", "build:database", "generate migrations");
      console.log("Generating DB migrations...");
      const migration = await generateMigration({
        root,
        worktreeName: name,
        migrationName: opts.migrationName,
        resetMigration: opts.resetMigration,
        customMigration: opts.customMigration,
        migrationAnswers: opts.migrationAnswers
          ? parseMigrationAnswers(opts.migrationAnswers)
          : undefined,
      });
      endSpan({ maxRssBytes: migration.maxRssBytes });
      recordFootprint("drizzle generate", migration.maxRssBytes);

      // 4–4b. Manifest-level repo-tree codegen: plugin docs → reorderable-slots
      // → data-views → token-group-vars → config-origins. Run AFTER migrations
      // (DB-stateful, interleaved above) but as ONE ordered pipeline shared with
      // the push-time `regen-generated` normalize step (codegen core), so a full
      // build after a push reproduces the exact same tree. The load-bearing
      // ordering constraints (docs first → reusable enriched tree; slots/views
      // before origins → they register the config_v2 directives origins depend
      // on; token-group-vars before the CSS single-owner checks; origins LAST)
      // live in the pipeline module as the authoritative record. Per-step
      // profiler spans are threaded through `onStep`.
      console.log("Generating plugins doc...");
      await regenerateManifestCodegen({ root, onStep: codegenStep });

      // 4c. Propagate git config to user config dir (~/.singularity/config/<worktree>/)
      endSpan = buildProfilerStart("propagateConfig", "build:codegen", "propagate config to user");
      console.log("Propagating config to user...");
      await propagateConfigToUser({ root, worktreeName: name, singularityDir: SINGULARITY_DIR });
      endSpan();

      // 3c–5. Run validation (checks) and the Vite build in parallel. They are
      // independent: checks read source files, Vite compiles into a staging
      // dir. On failure, the staging dir is cleaned up and nothing is published.
      // The `typescript` check type-checks every target (including the runtime
      // entrypoints), so we no longer run separate runtime tsc passes here — that
      // double-checked cli/server-core/central-core on every build. With
      // `--skip-checks` the check doesn't run, so we still guard server
      // type-safety with a single incremental tsc over the runtime entrypoints.
      const stagingPath = distStagingPath(resolve(webDir, "dist"));
      const stagingName = basename(stagingPath);

      console.log("Running checks, type-checking, and building frontend in parallel...");

      // Gate this heavy section (eslint + tsc + vite) behind a host CPU GRANT so
      // concurrent builds across worktrees don't thrash the machine. A main build
      // takes the interactive lane (its reserved floor is unreachable by agent
      // work, so it's never blocked by agent builds); an agent build takes the
      // background lane. The grant's `units` are subdivided across everything the
      // build fans out into (type-check workers, tsc, vite) — nothing re-acquires
      // host-wide. See @plugins/infra/plugins/host-admission.
      // (`lane` is derived once, up-front, next to the op record it also feeds.)
      // Publish the lane from the same fact (so any inheriting subprocess sees
      // it) BEFORE runChecks runs in-process below. See ../lane.ts.
      publishLane(branch === "main");
      // Agent-branch builds additionally run their heavy children (tsc, vite)
      // darwinbg-demoted so even a single build can't starve the interactive
      // main backend (one build legitimately fans across every core). Usually
      // redundant — a build started from an agent's tmux session already
      // inherits darwinbg (runtime-tmux demotes the whole session) — but this
      // keeps the invariant when a build of an agent branch is started from an
      // undemoted shell. Main-branch builds stay undemoted: the user is
      // waiting on them. The checks runner's type-check workers apply the same
      // branch rule at their own spawn site (type-check/check/index.ts), so
      // they are covered on every path (build, standalone check, push) without
      // relying on session inheritance.
      const demote = branch === "main" ? (argv: string[]) => argv : backgroundArgv;

      // The heavy section itself: everything the host CPU grant covers (checks +
      // tsc + vite), running on the grant it is handed. Extracted so the acquire
      // around it can be a retry loop (below) without the body moving.
      //
      // buildId (computed up-front, before the "started" build-log record) is
      // baked into the bundle (VITE_BUILD_ID) and written to dist/.build-id
      // below — bundle and server agree by construction (no chicken-and-egg).
      const runHeavySection = async (grant: Grant): Promise<StepResult[]> => {
        const parallel: Array<Promise<StepResult>> = [];

        if (!opts.skipChecks) {
          parallel.push(
            (async (): Promise<StepResult> => {
              const lines: StepResult["lines"] = [];
              const start = performance.now();
              const ok = await runChecks(undefined, {
                // The build's host CPU grant — type-check spends it per worker.
                grant,
                // Full, untruncated check output lands here; the buffered
                // `lines` (console + build.log) stay summarized.
                logFile: join(worktreeDataDir(name), "check.log"),
                onCheckDone: (id, durationMs, wallStartMs) => {
                  pushBuildSpan(`check:${id}`, "build:checks", id, durationMs, wallStartMs);
                },
                log: (line, stream) => {
                  lines.push({ text: line, stream });
                },
              });
              return {
                id: "checks",
                label: "checks",
                lines,
                durationMs: Math.round(performance.now() - start),
                success: ok,
              };
            })(),
          );
        }

        if (opts.skipChecks) {
          // Cheap, structural checks opt into running even on the fast path
          // (`--skip-checks`), so codegen-coupled obligations — e.g. a
          // newly-reorderable slot that still owes an authored override —
          // fail at build instead of slipping silently to `push`. Selected
          // generically via the `alwaysRun` flag (never by naming a check).
          const alwaysRunIds = (await listAllChecks())
            .filter((c) => c.alwaysRun)
            .map((c) => c.id);
          // Guard: runChecks([]) falls through to running ALL checks.
          if (alwaysRunIds.length > 0) {
            parallel.push(
              (async (): Promise<StepResult> => {
                const lines: StepResult["lines"] = [];
                const start = performance.now();
                const ok = await runChecks(alwaysRunIds, {
                  grant,
                  logFile: join(worktreeDataDir(name), "check.log"),
                  onCheckDone: (id, durationMs, wallStartMs) => {
                    pushBuildSpan(`check:${id}`, "build:checks", id, durationMs, wallStartMs);
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
              })(),
            );
          }

          const runtimeTargets = discoverTscTargets(root).filter((t) => t.hasEntrypoint);
          for (const target of runtimeTargets) {
            parallel.push(
              (async (): Promise<StepResult> => {
                const end = buildProfilerStart(`tsc:${target.name}`, "build:validation", `tsc ${target.name}`);
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
                    demote([process.execPath, "x", "tsc", "--noEmit", ...target.args, "--incremental", "--tsBuildInfoFile", buildInfo]),
                    target.dir,
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
              })(),
            );
          }
        }

        if (artifactsMode) {
          // Per-plugin artifact pipeline, in-process, into the SAME staging
          // dir the monolith would use — the atomic publish below is shared.
          // Grant-gated like the vite build it replaces: the pipeline's
          // internal fan-out (per-plugin vite builds on a cold store) is the
          // same class of heavy work, so it spends a unit of the build's CPU
          // budget rather than running on top of it.
          parallel.push(
            (async (): Promise<StepResult> => {
              const end = buildProfilerStart("viteBuild", "build:frontend", "web artifacts");
              const start = performance.now();
              const lines: StepResult["lines"] = [];
              let success = true;
              try {
                const result = await grant.run(() =>
                  runWebArtifactsPipeline({
                    root,
                    stagingDir: stagingPath,
                    minify: opts.minify,
                    buildId,
                    log: (line) => lines.push({ text: line, stream: "stdout" }),
                    onStage: async (id, label, run) => {
                      const endStage = buildProfilerStart(id, "build:frontend", label);
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
                const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
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
            })(),
          );
        } else {
          parallel.push(
            (async (): Promise<StepResult> => {
              const end = buildProfilerStart("viteBuild", "build:frontend", "vite build");
              const start = performance.now();
              // Vite is one of the heavy children the grant covers: spend a unit
              // for it so it shares the build's CPU budget with the type-check
              // workers rather than running on top of it.
              const output = await grant.run(() =>
                execBuffered(demote(["bun", "run", "build"]), webDir, { VITE_OUT_DIR: stagingName, VITE_BUILD_ID: buildId, ...(opts.composition ? { VITE_COMPOSITION: opts.composition } : {}) }),
              );
              end({ maxRssBytes: output.maxRssBytes });
              const rss = maxRssLine("vite build", output.maxRssBytes);
              if (rss) output.lines.push({ text: rss, stream: "stdout" });
              return {
                id: "viteBuild",
                label: "vite build",
                lines: output.lines,
                durationMs: Math.round(performance.now() - start),
                success: output.exitCode === 0,
              };
            })(),
          );
        }

        return await Promise.all(parallel);
      };

      // Duress admission valve: a background-lane build is held BEFORE it
      // queues for the host grant while the host duress latch is fresh, so no
      // new heavy work starts into a memory/congestion storm (event-driven
      // wait, 30-min sticky fail-open). Interactive (main), push, and the
      // detached auto-build are never held. See ../admission-valve.ts and
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
      const gated = valveGates(lane, process.env);

      // Drive the `duress-valve` wait off the valve's OWN hold bracket — the
      // same seam the `duressHold` span already hangs on, so the record and the
      // span can never disagree about how long the hold was. Deps are built once
      // rather than per `holdThroughValve` call (holds never nest, which is the
      // invariant `createValveDeps`'s single span slot already relies on).
      const baseValveDeps = createValveDeps();
      const valveDeps: ValveDeps = {
        ...baseValveDeps,
        onHoldStart: (reason) => {
          baseValveDeps.onHoldStart(reason);
          profiler.waitStart("duress-valve");
        },
        onHoldEnd: (outcome) => {
          baseValveDeps.onHoldEnd(outcome);
          profiler.waitEnd();
        },
      };

      const acquireAndRunHeavySection = async (): Promise<StepResult[]> => {
        // Profile the full admission wait (valve holds + grant queueing, across
        // requeues) — without a span this wait is an unexplained hole in the
        // build Gantt (a contended build once sat here ~5 min, unattributed).
        // The op record splits what this single span necessarily merges: one
        // `host-grant` wait per requeue cycle, each distinct from the valve's.
        const endGrantWait = buildProfilerStart(
          "acquireHostGrant",
          "build:setup",
          "wait for host CPU grant",
        );
        for (;;) {
          const outcome = await holdThroughValve({ gated }, valveDeps);
          const result = await withHostGrant<StepResult[] | typeof REQUEUE>(
            { lane, max: cpuBudget().B, hooks: profiler.grantHooks() },
            async (grant) => {
              if (shouldRequeue(gated, outcome, isUnderDuress())) return REQUEUE;
              endGrantWait();
              return await runHeavySection(grant);
            },
          );
          if (result !== REQUEUE) return result;
          console.log(
            "build admission: duress tripped while queued for the host grant — " +
              "released the grant, re-holding at the valve...",
          );
        }
      };
      const stepResults = await acquireAndRunHeavySection();

      for (const result of stepResults) {
        pushBuildStepLog(result);
      }

      printStepResults(stepResults);

      const buildUrl = `http://${name}.localhost:9000`;
      // Soft-degrade notes threaded out of the deploy-phase probes (server still
      // booting under host load, gateway still starting). Folded into the OK
      // verdict's headline so the reader's last impression is the truth, not an
      // out-of-context warning.
      const softNotes: string[] = [];

      const stepRoster = (): Verdict["steps"] =>
        stepResults.map((r) => ({ label: r.label, success: r.success }));

      // The single fatal funnel. Every post-steps failure routes through here so
      // the build's own verdict — with the failing step last, the full step
      // roster, the NOT DEPLOYED consequence, and the log pointers as the literal
      // last lines — is the terminal output on both console and build.log. The
      // verdict's pointers name build.log's own path, so that path is computed
      // (pure helper) and the verdict rendered BEFORE build.log is written.
      const failBuild = (reason: string[], failedLabels: string[]): never => {
        flushFootprint();
        const buildLogPath = worktreeArtifacts.buildLogText(name, buildId);
        const pointers = [`Full output: ${buildLogPath}`];
        if (stepResults.some((r) => r.id === "checks" && !r.success)) {
          pointers.push(`Check logs:  ${join(worktreeDataDir(name), "check.log")}`);
        }
        const v: Verdict = {
          ok: false,
          headline: `BUILD FAILED — ${failedLabels.length > 0 ? failedLabels.join(", ") : "deploy"}`,
          reason,
          pointers,
          steps: stepRoster(),
        };
        writeBuildLogs(name, renderVerdict(v));
        finalizeBuild(false);
        emitVerdict(v);
        process.exit(1);
      };

      const buildOkVerdict = (): Verdict => ({
        ok: true,
        headline: softNotes.length > 0 ? `BUILD OK — deployed (${softNotes.join("; ")})` : "BUILD OK — deployed",
        notes: [buildUrl],
        pointers: [],
        steps: stepRoster(),
      });

      const failedSteps = stepResults.filter((r) => !r.success);
      const failures = failedSteps.map((r) => r.label);

      if (failures.length > 0) {
        await rm(stagingPath, { recursive: true, force: true });
        failBuild(
          [
            `NOT DEPLOYED. Nothing was published; ${buildUrl} still serves the previous build.`,
            `The frontend compiled, but the artifact was discarded.`,
          ],
          failures,
        );
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

      // Gapless publish via a `dist` → `dist.live.<pid>` symlink swap — see
      // ./internal/dist-publish.ts for the mechanics (this supersedes the
      // earlier move-aside scheme, which left a real gap between two renames).
      endSpan = buildProfilerStart("atomicPublish", "build:frontend", "atomic publish");
      const livePath = resolve(webDir, "dist");
      await publishDistAtomic({ dir: livePath, stagingPath });
      endSpan();

      // 6. Write registry JSON
      endSpan = buildProfilerStart("registerWorktree", "build:deploy", "register worktree");
      console.log("Registering worktree...");
      writeWorktreeSpec({
        name,
        server: resolve(root, "plugins/framework/plugins/server-core"),
        web: livePath,
        // Per-worktree zero-cache sidecar — present only under the
        // SINGULARITY_ZERO_CACHE opt-in. `root` is this worktree's repo root.
        zeroCache: zeroCacheSpec({ name, repoRoot: root }),
      });
      endSpan();

      // 6b. Emit the central routing manifest. The gateway watches this file
      // and forwards listed paths to the central backend regardless of host.
      // Routes are populated from each plugin's `central/index.ts` httpRoutes
      // and wsRoutes maps.
      await writeCentralRoutesManifest(root);

      // 6c. Re-register the `central` worktree spec for idempotency. Path is
      // always main's central-core/ — see comment at the early write above.
      if (existsSync(join(centralDir, "bin", "index.ts"))) {
        writeWorktreeSpec({ name: "central", server: centralDir });

        // 6d. Restart central so it picks up freshly-merged main code. Only
        // done when building from main — agent worktrees never change central's
        // running code (central always runs main's central-core/), so restarting on
        // every worktree build would needlessly drop every open WS connection.
        if (root === mainRoot) {
          endSpan = buildProfilerStart("restartCentral", "build:deploy", "restart central");
          console.log("Restarting central...");
          try {
            const resp = await fetch(
              "http://localhost:9000/gateway/worktrees/central/restart",
              { method: "POST", signal: AbortSignal.timeout(30_000) },
            );
            if (resp.ok) {
              const gwNote = await probeGatewayHealth();
              if (gwNote) softNotes.push(gwNote);
            } else if (resp.status !== 404) {
              console.warn(`Central restart returned ${resp.status}`);
            }
          // eslint-disable-next-line promise-safety/no-bare-catch
          } catch {
            // Gateway not running — central will spawn fresh on first request.
          }
          endSpan();
        }
      }

      // 6e. Compose-serve stage: activated compositions (autoBuild in main's
      // resolved `compositions` config, or the one forced by
      // --serve-composition) get per-composition dists + empty DBs served at
      // http://<id>.localhost:9000. Main-checkout builds only (same gating as
      // the central restart above), artifact mode only (the stage composes
      // over the fleet this build just produced). Per-composition failures
      // are collected and fail the build AFTER main's own deploy completes —
      // main IS deployed either way; a failed composition keeps serving its
      // previous dist.
      const runComposeServe = async (): Promise<void> => {
        if (root !== mainRoot) return;
        if (!artifactsMode) {
          // Config-driven activations are NOT recomposed under --monolith (no
          // fresh fleet to compose from) — loud skip, never a silent stale serve.
          console.warn(
            "compose-serve: skipped (monolithic build) — activated compositions were NOT rebuilt.",
          );
          softNotes.push("compose-serve skipped (monolith)");
          return;
        }
        endSpan = buildProfilerStart("composeServe", "build:deploy", "compose-serve compositions");
        let result;
        try {
          result = await runComposeServeStage({
            root,
            minify: opts.minify,
            buildId,
            buildCommit,
            force: opts.serveComposition,
            log: (line) => console.log(line),
            onStage: async (sid, label, run) => {
              const end = buildProfilerStart(sid, "build:deploy", label);
              try {
                return await run();
              } finally {
                end();
              }
            },
          });
        } finally {
          endSpan();
        }
        if (result.failures.length > 0) {
          failBuild(
            [
              `Compose-serve failed for: ${result.failures.map((f) => f.id).join(", ")}.`,
              `Main itself IS deployed — ${buildUrl} serves the new build; each failed composition keeps serving its previous dist.`,
              ...result.failures.flatMap((f) => [`--- ${f.id} ---`, f.error]),
            ],
            ["compose-serve"],
          );
        }
      };

      // 4. Restart the backend if the gateway has it running
      if (!opts.restart) {
        await runComposeServe();
        softNotes.push("restart skipped");
        flushFootprint();
        writeBuildProfile(name);
        const okV = buildOkVerdict();
        writeBuildLogs(name, renderVerdict(okV));
        finalizeBuild(true);
        emitVerdict(okV);
        return;
      }
      endSpan = buildProfilerStart("restartBackend", "build:deploy", "restart backend");
      console.log("Restarting backend...");
      let gatewayUp = true;
      // Snapshot the currently-served backend's per-process identity BEFORE the
      // restart. probeHealth compares against it to prove the NEW backend took
      // over, rather than the old one still answering ok with stale code.
      const previousStartedAt = await readHealthStartedAt(name);
      let restartError: string | null = null;
      try {
        const resp = await fetch(
          `http://localhost:9000/gateway/worktrees/${name}/restart`,
          { method: "POST", signal: AbortSignal.timeout(adaptiveTimeoutMs(30_000, 130_000)) },
        );
        if (resp.ok) {
          console.log("Backend restarted");
        } else if (resp.status === 404) {
          console.log("No running backend to restart");
        } else if (resp.status === 500) {
          // A 500 can be a real boot crash or a still-in-progress readiness
          // timeout under load. Capture the gateway's error body, then ask it
          // for the authoritative state before deciding to hard-fail; otherwise
          // let probeHealth make the final call by comparing startedAt.
          restartError = (await resp.text().catch(() => "")).trim() || null;
          const info = await getWorktreeState(name);
          if (info?.state === "broken") {
            failBuild(
              [
                `Server crashed during boot (state: broken): ${info.lastSpawnErr || "no error reported"}` +
                  `${restartError ? `: ${restartError}` : ""}.`,
                `NOT DEPLOYED. ${buildUrl} still serves the previous build. Check server logs.`,
              ],
              ["backend crashed"],
            );
          }
          console.warn(
            `Backend restart returned 500${restartError ? `: ${restartError}` : ""} — verifying the new backend took over…`,
          );
        } else {
          console.warn(`Backend restart returned ${resp.status}`);
        }
      } catch (err) {
        // Gateway not running (TypeError/connection refused) or request timed out (DOMException AbortError)
        if (!(err instanceof TypeError) && !(err instanceof DOMException)) throw err;
        // Gateway not running — that's fine, backend will start on first request
        gatewayUp = false;
        console.log("Gateway not reachable, skipping backend restart");
      }
      endSpan();

      // Smoke-test the server boot. tsc catches static import errors but the
      // server can still fail to evaluate (missing env, init-time cycle, etc.)
      // and surface as a 502 on first request. Hit /api/health to force a boot
      // and fail the build if the server can't come up.
      if (gatewayUp) {
        endSpan = buildProfilerStart("probeHealth", "build:deploy", "health probe");
        const note = await probeHealth(name, previousStartedAt, restartError, (reason) =>
          failBuild(reason, ["backend never ready"]),
        );
        if (note) softNotes.push(note);
        endSpan();
      }

      // Compositions AFTER main is verified healthy — a broken main build must
      // never half-update composition namespaces.
      await runComposeServe();

      flushFootprint();
      writeBuildProfile(name);
      const okV = buildOkVerdict();
      writeBuildLogs(name, renderVerdict(okV));
      finalizeBuild(true);
      emitVerdict(okV);
    });
}
