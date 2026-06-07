import type { Command } from "commander";
import { existsSync, lstatSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { readdir, readlink, rename, rm, symlink, unlink } from "fs/promises";
import { retryUntil, fixed } from "@plugins/packages/plugins/retry/core";
import { WEB_CORE_RELATIVE } from "@plugins/infra/plugins/paths/server";
import { basename, join, resolve } from "path";
import { generateMigration, type MigrationAnswer } from "../migrations";
import { computeEslintScope } from "../eslint-affected";
import { generatePluginDocs, collectAllPlugins, generatePluginRegistry, generateConfigOrigins, propagateConfigToUser, generateBarrelStubs } from "@plugins/framework/plugins/tooling/plugins/codegen/core";
import { checkBroadcasts } from "../broadcasts";
import { getMainRepoRoot } from "../git/main-repo-root";
import { registerMergeDrivers } from "../git/register-merge-drivers";
import { runChecks, discoverTscTargets, tsBuildInfoPath } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import {
  libpqEnv,
  readDatabaseConfig,
  PG_LOG_FILE,
  SINGULARITY_DIR,
  WORKTREES_DIR,
} from "../paths";
import { buildProfilerStart, pushBuildSpan, writeBuildProfile } from "../profiler";
import { withHostSlot, type HostSlotKind } from "../host-semaphore";
import { pushBuildStepLog, writeBuildLogs } from "../build-logs-writer";
import { appendBuildLog } from "../build-log-writer-global";
import { markWorktreeOpStart, clearWorktreeOp } from "@plugins/infra/plugins/worktree/server";

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
const CENTRAL_ROUTES_FILE = join(SINGULARITY_DIR, "central-routes.json");

function parseMigrationAnswers(raw: string): MigrationAnswer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
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
    for (const route of p.central.httpRoutes) {
      const space = route.indexOf(" ");
      const path = space >= 0 ? route.slice(space + 1) : route;
      const colon = path.indexOf("/:");
      out.add(colon >= 0 ? path.slice(0, colon + 1) : path);
    }
    for (const route of p.central.wsRoutes) out.add(route);
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

// Cross-process build mutex via atomic symlink. Protects against the narrow
// race where a detached build orphaned by a SIGKILLed backend (idle-sweep)
// runs concurrently with a fresh build in the replacement backend. Stale
// locks from crashed holders are stolen after a PID probe.
async function acquireBuildLock(lockPath: string): Promise<() => void> {
  const holder = `pid-${process.pid}-${Date.now()}`;
  let warned = false;
  for (let attempt = 0; attempt < 600; attempt++) {
    try {
      await symlink(holder, lockPath);
      const release = () => {
        try {
          unlinkSync(lockPath);
        // eslint-disable-next-line promise-safety/no-bare-catch
        } catch {}
      };
      process.on("exit", release);
      return release;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    try {
      const target = await readlink(lockPath);
      const m = target.match(/^pid-(\d+)-/);
      if (m) {
        try {
          process.kill(parseInt(m[1]!, 10), 0);
        } catch {
          try {
            await unlink(lockPath);
          // eslint-disable-next-line promise-safety/no-bare-catch
          } catch {}
          continue;
        }
      }
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {}
    if (!warned) {
      console.log("Another build is in progress; waiting...");
      warned = true;
    }
    await Bun.sleep(500);
  }
  throw new Error(`Timed out waiting for build lock at ${lockPath}`);
}

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

// Returns true once the DB exists AND the fork has landed (i.e.
// __singularity_migrations has at least one row). Checking pg_database alone
// is not enough: CREATE DATABASE runs at the very start of forkDatabase, so
// the DB appears in pg_database while pg_restore is still running. Waiting
// for __singularity_migrations ensures we don't race a still-in-progress
// (or silently-dead) restore.
async function databaseReady(name: string): Promise<boolean> {
  // Use a direct pg client instead of `psql`: psql is not bundled by
  // embedded-postgres, and we'd rather not depend on the user's PATH for
  // routine readiness checks.
  const env = libpqEnv();
  const { Client } = await import("pg");
  const c = new Client({
    host: env.PGHOST!,
    port: parseInt(env.PGPORT!, 10),
    user: env.PGUSER!,
    database: name,
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    const r = await c.query("SELECT 1 FROM __singularity_migrations LIMIT 1");
    return r.rowCount === 1;
  } catch {
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
  // Conversation creation kicks off `pg_dump | pg_restore` in the background
  // (see plugins/conversations/server/internal/lifecycle.ts). By the time the
  // user runs `./singularity build` in the new worktree the fork is usually
  // done, but poll for a short window to cover the race.
  await retryUntil(
    async (attempt) => {
      if (await databaseReady(name)) return true;
      if (attempt === 0) console.log(`Waiting for DB fork "${name}" to complete...`);
      return null;
    },
    {
      delay: fixed(1_000),
      deadline: 30_000,
      onDeadline: () => {
        console.error(
          [
            `ERROR: DB fork for "${name}" did not complete within 30s.`,
            "",
            "This likely means the fork was interrupted (e.g. the server restarted",
            "mid-fork). Do NOT attempt to fix this yourself.",
            "",
            "Stop here and report the failure so it can be investigated.",
            "Check server logs and the fork-error toast in the main app for details.",
          ].join("\n"),
        );
        process.exit(1);
      },
    },
  );
}

async function probeHealth(name: string): Promise<void> {
  console.log("Probing /api/health...");
  const url = `http://${name}.localhost:9000/api/health`;
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
        console.error(`Server failed to respond on /api/health within 10s (last: ${lastStatus}).`);
        console.error("The build artifacts are valid but the server can't boot. Check server logs.");
        process.exit(1);
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
    .action(async (opts: { migrationName?: string; resetMigration?: boolean; customMigration?: boolean; migrationAnswers?: string; restart: boolean; skipChecks?: boolean; allowMain?: boolean }) => {
      const buildStartedAt = new Date();

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

      appendBuildLog({
        phase: "started",
        worktree: name,
        branch,
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
          startedAt: buildStartedAt.toISOString(),
          completedAt: new Date().toISOString(),
          totalMs: Date.now() - buildStartedAt.getTime(),
          success,
        });
      };
      process.on("exit", () => finalizeBuildLog(false));
      process.on("SIGINT", () => process.exit(130));
      process.on("SIGTERM", () => process.exit(143));

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

      // 1b. Regenerate barrel-import auto-stubs from .d.ts files.
      endSpan = buildProfilerStart("barrelStubs", "build:codegen", "barrel stubs");
      await generateBarrelStubs({ root });
      endSpan();

      // 2a. Regenerate plugin registry files — must happen before central
      // is spawned so its plugins.generated.ts is in sync.
      endSpan = buildProfilerStart("pluginRegistry", "build:codegen", "plugin registry");
      console.log("Generating plugin registry...");
      await generatePluginRegistry({ root });
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
        const centralSpecDir = join(WORKTREES_DIR, "central");
        mkdirSync(centralSpecDir, { recursive: true });
        writeFileSync(
          join(centralSpecDir, "spec.json"),
          JSON.stringify({ server: centralDir }, null, 2) + "\n",
        );
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

      // 4. Regenerate plugins/CLAUDE.md
      endSpan = buildProfilerStart("pluginDocs", "build:validation", "generate plugin docs");
      console.log("Generating plugins doc...");
      await generatePluginDocs({ root });
      endSpan();

      // 4b. Generate config origin files from defineConfig contributions
      endSpan = buildProfilerStart("configOrigins", "build:codegen", "generate config origins");
      console.log("Generating config origins...");
      await generateConfigOrigins({ root });
      endSpan();

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

      // Scope the eslint check to this branch's diff (non-main builds only —
      // main builds run the full lint so the cache they seed stays complete for
      // future worktrees). On failure to determine the scope we leave the env
      // var unset, which falls back to a full `eslint .`.
      if (branch !== "main") {
        const scope = await computeEslintScope(root);
        if (scope !== null) process.env.SINGULARITY_ESLINT_SCOPE = scope.join("\n");
      }

      // Gate this heavy section (eslint + tsc + vite) behind the host-wide
      // concurrency limit so concurrent builds across worktrees don't thrash the
      // machine. Main-branch builds are exempt (never queued); agent builds share
      // the bounded build pool. See host-semaphore.ts.
      const slotKind: HostSlotKind = branch === "main" ? "exempt" : "build";
      let endSlotWaitSpan: (() => void) | undefined;
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
                    [process.execPath, "x", "tsc", "--noEmit", ...target.args, "--incremental", "--tsBuildInfoFile", buildInfo],
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
              const output = await execBuffered(["bun", "run", "build"], webDir, { VITE_OUT_DIR: stagingName });
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

      const failures = stepResults
        .filter((r) => !r.success)
        .map((r) => r.label);

      if (failures.length > 0) {
        await rm(stagingPath, { recursive: true, force: true });
        writeBuildLogs(name);
        finalizeBuildLog(false);
        console.error(`\nBuild failed: ${failures.join(", ")}`);
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
      const spec = {
        server: resolve(root, "plugins/framework/plugins/server-core"),
        web: livePath,
      };

      const worktreeDir = join(WORKTREES_DIR, name);
      mkdirSync(worktreeDir, { recursive: true });
      writeFileSync(
        join(worktreeDir, "spec.json"),
        JSON.stringify(spec, null, 2) + "\n",
      );
      endSpan();

      // 6b. Emit the central routing manifest. The gateway watches this file
      // and forwards listed paths to the central backend regardless of host.
      // Routes are populated from each plugin's `central/index.ts` httpRoutes
      // and wsRoutes maps.
      await writeCentralRoutesManifest(root);

      // 6c. Re-register the `central` worktree spec for idempotency. Path is
      // always main's central-core/ — see comment at the early write above.
      if (existsSync(join(centralDir, "bin", "index.ts"))) {
        const centralSpec = { server: centralDir };
        const centralRegDir = join(WORKTREES_DIR, "central");
        mkdirSync(centralRegDir, { recursive: true });
        writeFileSync(
          join(centralRegDir, "spec.json"),
          JSON.stringify(centralSpec, null, 2) + "\n",
        );

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
      try {
        const resp = await fetch(
          `http://localhost:9000/gateway/worktrees/${name}/restart`,
          { method: "POST", signal: AbortSignal.timeout(30_000) },
        );
        if (resp.ok) {
          console.log("Backend restarted");
        } else if (resp.status === 404) {
          console.log("No running backend to restart");
        } else {
          console.warn(`Backend restart returned ${resp.status}`);
        }
      } catch {
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
        await probeHealth(name);
        endSpan();
      }

      writeBuildProfile(name);
      writeBuildLogs(name);
      finalizeBuildLog(true);
      console.log(`Deployed to http://${name}.localhost:9000`);
    });
}
