import type { Command } from "commander";
import os from "node:os";
import { existsSync, lstatSync, mkdirSync, writeFileSync } from "fs";
import { readdir, readlink, rename, rm, symlink, unlink } from "fs/promises";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { adaptiveTimeoutMs } from "./adaptive-timeout";
import { acquireBuildLock } from "../build-lock";
import { WEB_CORE_RELATIVE } from "@plugins/infra/plugins/paths/server";
import { basename, join, resolve } from "path";
import { generateMigration, type MigrationAnswer } from "../migrations";
import { collectAllPlugins, propagateConfigToUser, regenerateRegistryCodegen, regenerateManifestCodegen, generateCompositionRegistry, clearCompositionRegistries, type CodegenStep } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { buildPluginTree } from "@plugins/plugin-meta/plugins/plugin-tree/core";
import { resolveComposition, flattenManifest } from "@plugins/plugin-meta/plugins/closure/core";
import { compositionsConfig, manifestItemToManifest } from "@plugins/plugin-meta/plugins/composition/core";
import { getFacet } from "@plugins/plugin-meta/plugins/facets/core";
import { routesFacetDef } from "@plugins/plugin-meta/plugins/facets/plugins/routes/core";
import { checkBroadcasts } from "../broadcasts";
import { getMainRepoRoot } from "../git/main-repo-root";
import { registerMergeDrivers } from "../git/register-merge-drivers";
import { runChecks, listAllChecks, discoverTscTargets, tsBuildInfoPath } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  libpqEnv,
  readDatabaseConfig,
  worktreeDataDir,
  PG_LOG_FILE,
  SINGULARITY_DIR,
} from "../paths";
import { buildProfilerStart, pushBuildSpan, writeBuildProfile } from "../profiler";
import { withHostSlot, type HostSlotKind } from "../host-semaphore";
import { publishLane } from "../lane";
import { backgroundArgv } from "@plugins/packages/plugins/spawn-priority/server";
import { pushBuildStepLog, writeBuildLogs } from "../build-logs-writer";
import { appendBuildLog } from "../build-log-writer-global";
import { markWorktreeOpStart, clearWorktreeOp, writeWorktreeSpec } from "@plugins/infra/plugins/worktree/server";
import { zeroCacheSpec } from "@plugins/infra/plugins/launcher/server";

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
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

// Publish layout inside web-core/. `dist` is a *symlink* → `dist.live.<pid>`,
// the versioned release the gateway serves. A build compiles into
// `dist.staging.<pid>/`, renames it to a `dist.live.<pid>/` release, then
// repoints `dist` by renaming a fresh `dist.swap.<pid>` symlink over it. That
// final rename is a POSIX-atomic replace of a symlink, so `dist` always
// resolves to a *complete* release — there is no window where it is absent.
// (`OLD_PREFIX` is the legacy move-aside scheme; still swept for back-compat.)
// Leftovers from a crashed run are swept at the start of each build.
const STAGING_PREFIX = "dist.staging.";
const LIVE_PREFIX = "dist.live.";
const SWAP_PREFIX = "dist.swap.";
const OLD_PREFIX = "dist.old.";

// Reclaim build leftovers and self-heal a crashed publish. `dist` is a symlink
// → `dist.live.<pid>`; a publish killed mid-swap can leave `dist` missing or
// dangling while a complete `dist.live.*` release survives on disk. Restore the
// newest surviving release so the site is served again from the very next build
// start, then reclaim every other transient dir — but never the release `dist`
// currently points at (deleting it would dangle the live symlink).
async function sweepStagingLeftovers(webDir: string): Promise<void> {
  const distPath = resolve(webDir, "dist");
  const entries = await readdir(webDir);

  // The release `dist` currently resolves to (basename), if it is a live symlink.
  let current: string | null = null;
  const stat = lstatSync(distPath, { throwIfNoEntry: false });
  if (stat?.isSymbolicLink()) {
    if (existsSync(distPath)) {
      current = basename(await readlink(distPath)); // existsSync follows: false ⇒ dangling
    } else {
      await unlink(distPath); // dangling symlink — drop it, restore below
    }
  }

  // No healthy `dist` but a complete release survives → repoint at the newest.
  if (current === null) {
    const releases = entries.filter((e) => e.startsWith(LIVE_PREFIX)).sort();
    const newest = releases.at(-1);
    if (newest) {
      current = newest;
      await symlink(newest, distPath); // relative target, resolved within webDir
    }
  }

  for (const entry of entries) {
    if (entry === current) continue;
    if (
      entry.startsWith(STAGING_PREFIX) ||
      entry.startsWith(LIVE_PREFIX) ||
      entry.startsWith(SWAP_PREFIX) ||
      entry.startsWith(OLD_PREFIX)
    ) {
      await rm(resolve(webDir, entry), { recursive: true, force: true });
    }
  }
}

async function exec(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<void> {
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
}


interface StepOutput {
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  exitCode: number;
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
  return { lines, exitCode };
}

interface StepResult {
  id: string;
  label: string;
  lines: Array<{ text: string; stream: "stdout" | "stderr" }>;
  durationMs: number;
  success: boolean;
}

function printStepResults(results: StepResult[]): void {
  for (const result of results) {
    const icon = result.success ? "✓" : "✗";
    const duration = (result.durationMs / 1000).toFixed(1);
    const header = `── ${result.label} ${icon} (${duration}s) `;
    const pad = Math.max(0, 60 - header.length);
    console.log(header + "─".repeat(pad));
    for (const line of result.lines) {
      if (line.stream === "stderr") {
        process.stderr.write(`  ${line.text}\n`);
      } else {
        process.stdout.write(`  ${line.text}\n`);
      }
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

async function waitForDatabase(name: string): Promise<void> {
  // Conversation creation enqueues a durable `database.fork` graphile job
  // (see plugins/conversations/server/internal/lifecycle.ts). By the time the
  // user runs `./singularity build` in the new worktree the fork is usually
  // done, but poll for a window that comfortably covers an early graphile
  // backoff retry.
  await retryUntil(
    async (attempt) => {
      if (await databaseReady(name)) return true;
      if (attempt === 0) console.log(`Waiting for DB fork "${name}" to complete...`);
      return null;
    },
    {
      delay: fixed(1_000),
      deadline: 60_000,
      onDeadline: () => {
        console.error(
          [
            `ERROR: DB fork for "${name}" did not complete within 60s.`,
            "",
            "The fork runs as the durable `database.fork` job on the main",
            "backend. It self-heals across retries, so a transient interruption",
            "should resolve on its own — but if it's still not ready, the job may",
            "have exhausted its attempts (state: \"dead\").",
            "",
            "Check the `database.fork` job state at /api/jobs on the main app and",
            "the deduped fork-error notification for the failure reason.",
          ].join("\n"),
        );
        process.exit(1);
      },
    },
  );
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
async function probeHealth(
  name: string,
  previousStartedAt: number | null,
  restartError: string | null,
): Promise<void> {
  const isRestart = previousStartedAt != null;
  const deadline = adaptiveTimeoutMs(20_000, 120_000);
  console.log(`Probing /api/health... (deadline ${Math.round(deadline / 1000)}s)`);
  const url = `http://${name}.localhost:9000/api/health`;
  let lastStatus: number | string = "no response";
  await retryUntil<true, Promise<void>>(
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
        // build. finalizeBuildLog runs via the process.on("exit") handler.
        if (isRestart) {
          const detail = restartError ? `\nGateway restart error: ${restartError}` : "";
          console.error(
            `New backend never became ready within ${Math.round(deadline / 1000)}s — the gateway is still ` +
              `serving the previous backend (stale code). The freshly-built backend failed its onReadyBlocking ` +
              `ready barrier (last: ${lastStatus}).${detail}\n` +
              `Inspect the backend log at ${join(worktreeDataDir(name), "logs")} for the throw.`,
          );
          writeBuildLogs(name);
          process.exit(1);
        }
        const load1 = Math.round((os.loadavg()[0] ?? 0) * 10) / 10;
        const info = await getWorktreeState(name);
        if (!info) {
          console.warn(
            `Server didn't respond on /api/health within ${Math.round(deadline / 1000)}s ` +
              `(last: ${lastStatus}) and the gateway is unreachable. ` +
              `Build artifacts are valid; not blocking the build.`,
          );
          return;
        }
        switch (info.state) {
          case "broken":
            console.error(
              `Server crashed during boot (state: broken): ${info.lastSpawnErr || "no error reported"}. ` +
                `Check server logs.`,
            );
            process.exit(1);
            break;
          case "running":
            console.log("Server is up.");
            return;
          case "starting":
          case "restarting":
          case "idle":
            console.warn(
              `Server still booting after ${Math.round(deadline / 1000)}s under host load ` +
                `(load avg ${load1}). Build artifacts are valid; the gateway will finish ` +
                `bringing it up on demand. Not blocking the build.`,
            );
            return;
          default:
            console.warn(
              `Server didn't respond on /api/health within ${Math.round(deadline / 1000)}s ` +
                `(gateway state: ${info.state || "unknown"}, last: ${lastStatus}). ` +
                `Build artifacts are valid; not blocking the build.`,
            );
            return;
        }
      },
    },
  );
}

// `/gateway/worktrees` is the gateway's own API and exists on every gateway
// version — a 200 here proves the gateway is alive. Central's own readiness
// is covered by the gateway's waitReady on its Unix socket; no separate
// central-side liveness probe.
async function probeGatewayHealth(): Promise<void> {
  console.log("Probing gateway /gateway/worktrees...");
  const url = "http://localhost:9000/gateway/worktrees";
  let lastStatus: number | string = "no response";
  await retryUntil(
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
      },
    },
  );
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
      "Build only the named composition's plugin closure (filtered self-contained registry)",
    )
    .action(async (opts: { migrationName?: string; resetMigration?: boolean; customMigration?: boolean; migrationAnswers?: string; restart: boolean; skipChecks?: boolean; allowMain?: boolean; composition?: string }) => {
      const buildStartedAt = new Date();

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

      appendBuildLog({
        phase: "started",
        worktree: name,
        branch,
        buildId,
        startedAt: buildStartedAt.toISOString(),
        completedAt: null,
        totalMs: 0,
        success: false,
      });

      // Mark this worktree as having a build in flight so the conversation
      // status poller keeps the agent's pane reading as "working" while the
      // CLI "shell" status persists (see worktree-op.ts). Cleared in
      // finalizeBuildLog below, which runs on every graceful exit.
      markWorktreeOpStart(name, "build");

      // Guarantee a terminal "completed" record on every *graceful* exit
      // path — a thrown build step, process.exit(1), or SIGINT/SIGTERM.
      // Without this, any failure before the explicit success/failure writes
      // below leaves a "started" with no "completed", which the profiler can
      // only render as an ever-growing fake bar with no real end time. The
      // exit handler captures the true end timestamp. Only a hard kill
      // (SIGKILL/OOM/power loss) — which can't run handlers — legitimately
      // leaves a record open; the profiler shows those as "interrupted".
      // Mirrors the on-exit lock release in acquireBuildLock above.
      let buildLogFinalized = false;
      const finalizeBuildLog = (success: boolean): void => {
        if (buildLogFinalized) return;
        buildLogFinalized = true;
        clearWorktreeOp(name, "build");
        appendBuildLog({
          phase: "completed",
          worktree: name,
          branch,
          buildId,
          startedAt: buildStartedAt.toISOString(),
          completedAt: new Date().toISOString(),
          totalMs: Date.now() - buildStartedAt.getTime(),
          success,
        });
      };
      process.on("exit", () => finalizeBuildLog(false));

      // Catchable fatal signals → graceful exit so the exit handlers above
      // (build-log finalize) and the lock release run. SIGKILL is uncatchable —
      // the dead-holder ESRCH steal in acquireBuildLock is the backstop there.
      for (const [sig, code] of [
        ["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129], ["SIGQUIT", 131],
      ] as const) {
        process.on(sig, () => process.exit(code));
      }

      // A foreground `./singularity build` dies with its invoker so an orphaned
      // build never holds the build lock indefinitely. macOS has no PDEATHSIG, so
      // poll ppid (reparented orphans get ppid 1); unref so it never keeps the
      // process alive. The detached self-restart build (run-build.ts) opts out via
      // SINGULARITY_BUILD_DETACHED — it intends to outlive the backend it restarts.
      if (process.ppid !== 1 && !process.env.SINGULARITY_BUILD_DETACHED) {
        setInterval(() => {
          if (process.ppid === 1) process.exit(140); // 128+12: orphaned
        }, 2000).unref();
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
      await acquireBuildLock(resolve(webDir, ".build.lock"));
      endSpan();

      endSpan = buildProfilerStart("sweepStaging", "build:setup", "sweep staging leftovers");
      await sweepStagingLeftovers(webDir);
      endSpan();

      // 1. Install dependencies. Required before the gateway can find the
      // platform-specific embedded-postgres binaries under
      // plugins/infra/plugins/database/node_modules/@embedded-postgres/.
      endSpan = buildProfilerStart("bunInstall", "build:setup", "bun install");
      console.log("Installing dependencies...");
      await exec(["bun", "install"], root);
      endSpan();

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
      await waitForDatabase(name);
      endSpan();

      // 3. Regenerate DB migrations from plugin schema files
      endSpan = buildProfilerStart("generateMigration", "build:database", "generate migrations");
      console.log("Generating DB migrations...");
      await generateMigration({
        root,
        worktreeName: name,
        migrationName: opts.migrationName,
        resetMigration: opts.resetMigration,
        customMigration: opts.customMigration,
        migrationAnswers: opts.migrationAnswers
          ? parseMigrationAnswers(opts.migrationAnswers)
          : undefined,
      });
      endSpan();

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
      const stagingName = `${STAGING_PREFIX}${process.pid}`;
      const stagingPath = resolve(webDir, stagingName);

      console.log("Running checks, type-checking, and building frontend in parallel...");

      // Gate this heavy section (eslint + tsc + vite) behind the host-wide
      // concurrency limit so concurrent builds across worktrees don't thrash the
      // machine. Main-branch builds are exempt (never queued); agent builds share
      // the bounded build pool. See host-semaphore.ts.
      const slotKind: HostSlotKind = branch === "main" ? "exempt" : "build";
      // Publish the lane from the same fact, BEFORE runChecks runs in-process
      // below: a main build is human-blocking (interactive lane), an agent build
      // is background. The type-check fleet keys its host-wide worker budget on
      // this. See ../lane.ts.
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
      const demote = slotKind === "build" ? backgroundArgv : (argv: string[]) => argv;
      let endSlotWaitSpan: (() => void) | undefined;

      // buildId (computed up-front, before the "started" build-log record) is
      // baked into the bundle (VITE_BUILD_ID) and written to dist/.build-id
      // below — bundle and server agree by construction (no chicken-and-egg).
      const stepResults = await withHostSlot(
        slotKind,
        async () => {
          const parallel: Array<Promise<StepResult>> = [];

          if (!opts.skipChecks) {
            parallel.push(
              (async (): Promise<StepResult> => {
                const lines: StepResult["lines"] = [];
                const start = performance.now();
                const ok = await runChecks(undefined, {
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
                  const output = await execBuffered(
                    demote([process.execPath, "x", "tsc", "--noEmit", ...target.args, "--incremental", "--tsBuildInfoFile", buildInfo]),
                    target.dir,
                  );
                  end();
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

          parallel.push(
            (async (): Promise<StepResult> => {
              const end = buildProfilerStart("viteBuild", "build:frontend", "vite build");
              const start = performance.now();
              const output = await execBuffered(demote(["bun", "run", "build"]), webDir, { VITE_OUT_DIR: stagingName, VITE_BUILD_ID: buildId, ...(opts.composition ? { VITE_COMPOSITION: opts.composition } : {}) });
              end();
              return {
                id: "viteBuild",
                label: "vite build",
                lines: output.lines,
                durationMs: Math.round(performance.now() - start),
                success: output.exitCode === 0,
              };
            })(),
          );

          return await Promise.all(parallel);
        },
        {
          onWaitStart: () => {
            console.log("Waiting for a build slot (machine busy)...");
            endSlotWaitSpan = buildProfilerStart("buildSlotWait", "build:queue", "waiting for build slot");
          },
          onAcquired: () => endSlotWaitSpan?.(),
        },
      );

      for (const result of stepResults) {
        pushBuildStepLog(result);
      }

      printStepResults(stepResults);

      const failedSteps = stepResults.filter((r) => !r.success);
      const failures = failedSteps.map((r) => r.label);

      if (failures.length > 0) {
        await rm(stagingPath, { recursive: true, force: true });
        const buildLog = writeBuildLogs(name);
        finalizeBuildLog(false);
        // Final lines, so they survive `./singularity build | tail`. When the
        // checks step failed, point straight at its full untruncated transcript
        // so agents can read it directly without the build.log → check.log hop.
        const pointers = [`Full output: ${buildLog}`];
        if (failedSteps.some((r) => r.id === "checks")) {
          pointers.push(`Check logs:  ${join(worktreeDataDir(name), "check.log")}`);
        }
        console.error(`\nBuild failed: ${failures.join(", ")}\n${pointers.join("\n")}`);
        process.exit(1);
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

      // Gapless publish via a `dist` → `dist.live.<pid>` symlink swap. The
      // staging tree is renamed to a versioned release, then `dist` is repointed
      // by renaming a fresh symlink over it — a POSIX-atomic replace when `dist`
      // is already a symlink, so `dist` always resolves to a *complete* release
      // with no window where it is absent.
      //
      // This supersedes the earlier move-aside (`rename(dist→old); rename(staging→dist)`),
      // which left a real gap between the two renames where `dist` did not exist
      // at all: a build killed there (e.g. the gateway interrupting an in-flight
      // build) left a permanent 404 on `/`. On the one-time migration from a
      // legacy real-directory `dist`, it is removed just before the swap — that
      // single build has a brief gap; every subsequent build is gapless.
      endSpan = buildProfilerStart("atomicPublish", "build:frontend", "atomic publish");
      const livePath = resolve(webDir, "dist");
      const releaseName = `${LIVE_PREFIX}${process.pid}`;
      const releasePath = resolve(webDir, releaseName);
      const swapPath = resolve(webDir, `${SWAP_PREFIX}${process.pid}`);

      await rename(stagingPath, releasePath);

      // Reclaim the release `dist` currently points at after the swap. If `dist`
      // is a legacy real directory, remove it first — a symlink cannot be
      // renamed over a non-empty directory.
      let prevRelease: string | null = null;
      const liveStat = lstatSync(livePath, { throwIfNoEntry: false });
      if (liveStat?.isSymbolicLink()) {
        prevRelease = basename(await readlink(livePath));
      } else if (liveStat?.isDirectory()) {
        await rm(livePath, { recursive: true, force: true });
      }

      await symlink(releaseName, swapPath); // relative target, resolved within webDir
      await rename(swapPath, livePath); // atomic replace of the dist symlink

      if (prevRelease && prevRelease !== releaseName) {
        await rm(resolve(webDir, prevRelease), { recursive: true, force: true });
      }
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
              await probeGatewayHealth();
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

      // 4. Restart the backend if the gateway has it running
      if (!opts.restart) {
        writeBuildProfile(name);
        writeBuildLogs(name);
        finalizeBuildLog(true);
        console.log(`Deployed to http://${name}.localhost:9000 (restart skipped)`);
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
            console.error(
              `Server crashed during boot (state: broken): ${info.lastSpawnErr || "no error reported"}` +
                `${restartError ? `: ${restartError}` : ""}. Check server logs.`,
            );
            finalizeBuildLog(false);
            process.exit(1);
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
        await probeHealth(name, previousStartedAt, restartError);
        endSpan();
      }

      writeBuildProfile(name);
      writeBuildLogs(name);
      finalizeBuildLog(true);
      console.log(`Deployed to http://${name}.localhost:9000`);
    });
}
