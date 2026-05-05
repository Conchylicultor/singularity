import type { Command } from "commander";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { readdir, readlink, rename, rm, symlink, unlink } from "fs/promises";
import { retryUntil, fixed } from "@packages/retry";
import { basename, join, resolve } from "path";
import { generateMigration } from "../migrations";
import { generatePluginDocs, collectAllPlugins } from "../docgen";
import { generatePluginRegistry } from "../plugin-registry-gen";
import { getMainRepoRoot } from "../git/main-repo-root";
import { registerMergeDrivers } from "../git/register-merge-drivers";
import { runChecks } from "../checks";
import {
  libpqEnv,
  PG_LOG_FILE,
  SINGULARITY_DIR,
} from "../paths";

const NAME_REGEX = /^[a-z0-9][a-z0-9-]{0,62}$/;
const WORKTREES_DIR = join(SINGULARITY_DIR, "worktrees");
const CENTRAL_ROUTES_FILE = join(SINGULARITY_DIR, "central-routes.json");

interface CentralRoutesManifest {
  backend: string;
  routes: string[];
}

/**
 * Runtime-level routes registered by `central/src/index.ts` itself rather
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
function collectCentralRoutes(root: string): string[] {
  const out = new Set<string>(CENTRAL_RUNTIME_ROUTES);
  for (const p of collectAllPlugins(root)) {
    for (const route of p.centralHttpRoutes) {
      const space = route.indexOf(" ");
      const path = space >= 0 ? route.slice(space + 1) : route;
      const colon = path.indexOf("/:");
      out.add(colon >= 0 ? path.slice(0, colon + 1) : path);
    }
    for (const route of p.centralWsRoutes) out.add(route);
  }
  return Array.from(out).sort();
}

async function writeCentralRoutesManifest(root: string): Promise<void> {
  const manifest: CentralRoutesManifest = {
    backend: "central",
    routes: collectCentralRoutes(root),
  };
  mkdirSync(SINGULARITY_DIR, { recursive: true });
  const tmp = `${CENTRAL_ROUTES_FILE}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(manifest, null, 2) + "\n");
  await rename(tmp, CENTRAL_ROUTES_FILE);
}

// Staging / old-dir prefixes inside web/ for atomic publish. Each invocation
// builds into `dist.staging.<pid>/` and atomically renames to `dist/` at the
// end — the gateway never sees a partially-wiped dist (icons present, no
// index.html). Leftovers from a crashed run are swept at the start of each
// build.
const STAGING_PREFIX = "dist.staging.";
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
          process.kill(parseInt(m[1], 10), 0);
        } catch {
          try {
            await unlink(lockPath);
          } catch {}
          continue;
        }
      }
    } catch {}
    if (!warned) {
      console.log("Another build is in progress; waiting...");
      warned = true;
    }
    await Bun.sleep(500);
  }
  throw new Error(`Timed out waiting for build lock at ${lockPath}`);
}

async function sweepStagingLeftovers(webDir: string): Promise<void> {
  for (const entry of await readdir(webDir)) {
    if (entry.startsWith(STAGING_PREFIX) || entry.startsWith(OLD_PREFIX)) {
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
    host: env.PGHOST,
    port: parseInt(env.PGPORT, 10),
    user: env.PGUSER,
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
    } catch {}
  }
}

/**
 * Wait for the gateway-supervised embedded Postgres cluster to be ready.
 * Probes the cluster directly via libpq to the embedded socket — this is the
 * same ground truth the gateway's supervisor uses, and it avoids any
 * dependency on a particular gateway binary version. Skipped when the user
 * has opted into system PG.
 */
async function waitForPg(): Promise<void> {
  if (process.env.SINGULARITY_USE_SYSTEM_PG === "1") return;
  const env = libpqEnv();
  const { Client } = await import("pg");
  let lastErr: string | null = null;
  await retryUntil(
    async (attempt) => {
      const c = new Client({
        host: env.PGHOST,
        port: parseInt(env.PGPORT, 10),
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
      "Drop branch-local migration files (those absent from origin/main) before generating. Recovers from snapshot-chain Y-forks after rebasing onto main.",
    )
    .option(
      "--custom-migration",
      "Pass --custom to drizzle-kit generate: creates an empty migration file and updates the snapshot without interactive prompts. Edit the generated SQL file before the next build applies it.",
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
    .action(async (opts: { migrationName?: string; resetMigration?: boolean; customMigration?: boolean; restart: boolean; skipChecks?: boolean; allowMain?: boolean }) => {
      await ensureHooksPath();
      await registerMergeDrivers(await getWorktreeRoot());

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

      const root = await getWorktreeRoot();
      const name = basename(root);

      if (!NAME_REGEX.test(name)) {
        console.error(
          `Invalid worktree name "${name}". Must match ${NAME_REGEX}`,
        );
        process.exit(1);
      }

      const webDir = resolve(root, "web");
      await acquireBuildLock(resolve(webDir, ".build.lock"));
      await sweepStagingLeftovers(webDir);

      // 1. Install dependencies. Required before the gateway can find the
      // platform-specific embedded-postgres binaries under
      // plugins/infra/plugins/database/node_modules/@embedded-postgres/.
      console.log("Installing dependencies...");
      await exec(["bun", "install"], root);

      // 2a. Regenerate plugin registry files — must happen before central
      // is spawned so its plugins.generated.ts is in sync.
      console.log("Generating plugin registry...");
      await generatePluginRegistry({ root });

      // 2b. Refresh the central-routes manifest so the gateway knows which
      // path prefixes are owned by central plugins.
      await writeCentralRoutesManifest(root);

      // 2b'. Write the central spec early too — otherwise the gateway has no
      // way to spawn central. (Repeated at end of build for idempotency.)
      // central.json always points at *main's* central/, not the current
      // worktree's: central is a singleton serving every worktree, so the
      // canonical source is main. The file is idempotent across worktree
      // builds — same content every time.
      const mainRoot = await getMainRepoRoot();
      const centralDir = resolve(mainRoot, "central");
      if (existsSync(join(centralDir, "src", "index.ts"))) {
        mkdirSync(WORKTREES_DIR, { recursive: true });
        writeFileSync(
          join(WORKTREES_DIR, "central.json"),
          JSON.stringify({ server: centralDir }, null, 2) + "\n",
        );
      }

      // 2c. Ensure the embedded Postgres cluster is up. The gateway owns
      // PG supervision now (see gateway/postgres.go) and answers
      // /api/database/status from its own state — central is not involved.
      await waitForPg();

      // 2d. Ensure the worktree's DB fork has completed (forked asynchronously
      // during conversation creation).
      await waitForDatabase(name);

      // 3. Regenerate DB migrations from plugin schema files
      console.log("Generating DB migrations...");
      await generateMigration({
        serverDir: resolve(root, "server"),
        worktreeName: name,
        migrationName: opts.migrationName,
        resetMigration: opts.resetMigration,
        customMigration: opts.customMigration,
      });

      // 4. Regenerate plugins/CLAUDE.md
      console.log("Generating plugins doc...");
      await generatePluginDocs({ root });

      // 3c. Run repo validation checks (typescript, plugin-boundaries, eslint,
      // plugin-contributed checks, ...). Fail before the expensive frontend
      // build kicks off. `--skip-checks` opts out for fast iteration; checks
      // still gate `push`.
      if (!opts.skipChecks) {
        console.log("Running checks...");
        const ok = await runChecks();
        if (!ok) process.exit(1);
      }

      // 4. Type-check server. Bun runs the server without static checks, and
      // the web `tsc -b` only covers files reachable from web — so server-only
      // modules (handlers, pollers) can ship with broken imports and only
      // surface as 502s on first request. Run server tsc explicitly here.
      console.log("Type-checking server...");
      await exec(["bunx", "tsc"], resolve(root, "server"));

      // 4b. Type-check central if present. Same rationale as server.
      // Type-check the *worktree's* central, not main's: local edits must be
      // validated even though the running central runs main's code. (Errors
      // here would otherwise only surface after merge.)
      const worktreeCentralDir = resolve(root, "central");
      if (existsSync(join(worktreeCentralDir, "src", "index.ts"))) {
        console.log("Type-checking central...");
        await exec(["bunx", "tsc"], worktreeCentralDir);
      }

      // 5. Build frontend into a per-pid staging dir, then atomically
      // publish. Vite reads `VITE_OUT_DIR` (see web/vite.config.ts).
      const stagingName = `${STAGING_PREFIX}${process.pid}`;
      const stagingPath = resolve(webDir, stagingName);
      console.log("Building frontend...");
      await exec(["bun", "run", "build"], webDir, { VITE_OUT_DIR: stagingName });

      // Write the commit hash at build time so the server can report drift.
      const commitProc = Bun.spawnSync(["git", "rev-parse", "HEAD"], {
        cwd: root,
        stdout: "pipe",
      });
      const buildCommit = commitProc.stdout.toString().trim();
      if (buildCommit) {
        writeFileSync(resolve(stagingPath, ".build-commit"), buildCommit + "\n");
      }

      // Atomic publish. Brief microsecond window between rm and rename where
      // dist doesn't exist; acceptable since both are atomic syscalls.
      const livePath = resolve(webDir, "dist");
      await rm(livePath, { recursive: true, force: true });
      await rename(stagingPath, livePath);

      // 6. Write registry JSON
      console.log("Registering worktree...");
      const spec = {
        server: resolve(root, "server"),
        web: livePath,
      };

      mkdirSync(WORKTREES_DIR, { recursive: true });
      writeFileSync(
        join(WORKTREES_DIR, `${name}.json`),
        JSON.stringify(spec, null, 2) + "\n",
      );

      // 6b. Emit the central routing manifest. The gateway watches this file
      // and forwards listed paths to the central backend regardless of host.
      // Routes are populated from each plugin's `central/index.ts` httpRoutes
      // and wsRoutes maps.
      await writeCentralRoutesManifest(root);

      // 6c. Re-register the `central` worktree spec for idempotency. Path is
      // always main's central/ — see comment at the early write above.
      if (existsSync(join(centralDir, "src", "index.ts"))) {
        const centralSpec = { server: centralDir };
        writeFileSync(
          join(WORKTREES_DIR, "central.json"),
          JSON.stringify(centralSpec, null, 2) + "\n",
        );

        // 6d. Restart central so it picks up freshly-merged main code. Only
        // done when building from main — agent worktrees never change central's
        // running code (central always runs main's central/), so restarting on
        // every worktree build would needlessly drop every open WS connection.
        if (root === mainRoot) {
          console.log("Restarting central...");
          try {
            const resp = await fetch(
              "http://localhost:9000/gateway/worktrees/central/restart",
              { method: "POST" },
            );
            if (resp.ok) {
              await probeGatewayHealth();
            } else if (resp.status !== 404) {
              console.warn(`Central restart returned ${resp.status}`);
            }
          } catch {
            // Gateway not running — central will spawn fresh on first request.
          }
        }
      }

      // 4. Restart the backend if the gateway has it running
      if (!opts.restart) {
        console.log(`Deployed to http://${name}.localhost:9000 (restart skipped)`);
        return;
      }
      console.log("Restarting backend...");
      let gatewayUp = true;
      try {
        const resp = await fetch(
          `http://localhost:9000/gateway/worktrees/${name}/restart`,
          { method: "POST" },
        );
        if (resp.ok) {
          console.log("Backend restarted (will respawn on next request)");
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

      // Smoke-test the server boot. tsc catches static import errors but the
      // server can still fail to evaluate (missing env, init-time cycle, etc.)
      // and surface as a 502 on first request. Hit /api/health to force a boot
      // and fail the build if the server can't come up.
      if (gatewayUp) {
        await probeHealth(name);
      }

      console.log(`Deployed to http://${name}.localhost:9000`);
    });
}
