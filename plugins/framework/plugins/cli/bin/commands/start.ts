import type { Command } from "commander";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getMainRepoRoot } from "../git/main-repo-root";
import { SINGULARITY_DIR, DATABASE_CONFIG_PATH, PG_DIR } from "../paths";
const LOGS_DIR = join(SINGULARITY_DIR, "logs");
// The gateway owns the rotating per-channel logs under LOGS_DIR (gateway.log,
// <worktree>.log). This file only captures the daemon's raw stdout/stderr — Go
// panics and any crash before slog is wired up. Truncated on each start so it
// can't grow unbounded; the last crash survives until the next launch.
const GATEWAY_STDIO_LOG = join(LOGS_DIR, "gateway-stdio.log");
const PID_FILE = join(SINGULARITY_DIR, "gateway.pid");

// Embedded PG defaults (mirrors plugins/database/plugins/embedded/shared).
const EMBEDDED_PG_PORT = 5433;
const EMBEDDED_PG_USER = "singularity";
const EMBEDDED_PG_SOCKET_DIR = join(PG_DIR, "socket");
const EMBEDDED_PGBOUNCER_PORT = 6432;

function readPid(): number | null {
  try {
    const n = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(n) ? null : n;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true; // process exists but we can't signal it
    if (code === "ESRCH") return false; // process does not exist
    throw err;
  }
}

async function isGatewayListening(): Promise<boolean> {
  try {
    const resp = await fetch("http://localhost:9000/gateway/worktrees", {
      signal: AbortSignal.timeout(1000),
    });
    return resp.ok;
    // eslint-disable-next-line promise-safety/no-bare-catch -- any network error (connection refused, timeout, DNS) means the gateway is not listening; propagating would misrepresent a probe failure as a fatal error
  } catch {
    return false;
  }
}

function hasPgBouncerPackage(repoRoot: string): boolean {
  return existsSync(
    join(repoRoot, "plugins/database/plugins/pgbouncer/node_modules/@equin"),
  );
}

function pgbouncerService(repoRoot: string) {
  return {
    name: "pgbouncer",
    start: [
      "bun",
      "run",
      join(repoRoot, "plugins/database/plugins/pgbouncer/scripts/start.ts"),
    ],
    ready: {
      unix: join(EMBEDDED_PG_SOCKET_DIR, `.s.PGSQL.${EMBEDDED_PGBOUNCER_PORT}`),
    },
    watchdog: { intervalSec: 2 },
  };
}

function pgbouncerConnection() {
  return { host: EMBEDDED_PG_SOCKET_DIR, port: EMBEDDED_PGBOUNCER_PORT };
}

function ensureDatabaseConfig(repoRoot: string): void {
  // Upgrade existing config: add pgbouncer service if packages are now installed.
  if (existsSync(DATABASE_CONFIG_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(DATABASE_CONFIG_PATH, "utf-8"));
      const services: Array<{ name: string }> = existing.services ?? [];
      const hasPgBouncer = services.some((s) => s.name === "pgbouncer");
      if (!hasPgBouncer && hasPgBouncerPackage(repoRoot)) {
        existing.pgbouncer = pgbouncerConnection();
        existing.services = [...services, pgbouncerService(repoRoot)];
        writeFileSync(
          DATABASE_CONFIG_PATH,
          JSON.stringify(existing, null, 2) + "\n",
        );
        console.log("Updated database config: added PgBouncer");
      }
    } catch (err) {
      if (err instanceof SyntaxError) return;
      throw err;
    }
    return;
  }

  const embeddedPkgDir = join(
    repoRoot,
    "plugins/database/plugins/embedded/node_modules/@embedded-postgres",
  );
  const hasEmbedded = existsSync(embeddedPkgDir);
  const hasPgBouncer = hasEmbedded && hasPgBouncerPackage(repoRoot);

  const startScript = join(
    repoRoot,
    "plugins/database/plugins/embedded/scripts/start.ts",
  );

  const config = hasEmbedded
    ? {
        provider: "embedded" as const,
        connection: {
          host: EMBEDDED_PG_SOCKET_DIR,
          port: EMBEDDED_PG_PORT,
          user: EMBEDDED_PG_USER,
        },
        ...(hasPgBouncer ? { pgbouncer: pgbouncerConnection() } : {}),
        services: [
          {
            name: "postgres",
            start: ["bun", "run", startScript],
            ready: {
              unix: join(EMBEDDED_PG_SOCKET_DIR, `.s.PGSQL.${EMBEDDED_PG_PORT}`),
            },
            watchdog: { intervalSec: 2 },
          },
          ...(hasPgBouncer ? [pgbouncerService(repoRoot)] : []),
        ],
      }
    : {
        provider: "system" as const,
        connection: {
          host: "localhost",
          port: 5432,
          user: process.env.USER ?? "postgres",
        },
        services: [],
      };

  mkdirSync(SINGULARITY_DIR, { recursive: true });
  writeFileSync(DATABASE_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  console.log(
    hasEmbedded
      ? `Generated database config (embedded Postgres${hasPgBouncer ? " + PgBouncer" : ""})`
      : "Generated database config (system Postgres)",
  );
}

export function registerStart(program: Command) {
  program
    .command("start")
    .description("Build and start the gateway daemon")
    .option("--force", "Restart even if already running")
    .option(
      "--log-level <level>",
      "Gateway log level: debug|info|warn|error",
      "info",
    )
    .action(async (opts: { force?: boolean; logLevel: string }) => {
      const existingPid = readPid();
      const pidAlive = existingPid !== null && isRunning(existingPid);

      if (!pidAlive && (await isGatewayListening())) {
        console.log("Gateway is already running on port 9000 (started externally).");
        console.log("  Gateway: http://singularity.localhost:9000");
        console.log(`  Logs:    ${LOGS_DIR}/`);
        return;
      }

      if (pidAlive) {
        if (!opts.force) {
          console.log(`Gateway is already running (PID ${existingPid})`);
          console.log(`  Logs:    ${LOGS_DIR}/`);
          console.log(`  Gateway: http://singularity.localhost:9000`);
          return;
        }
        console.log(`Stopping existing gateway (PID ${existingPid})...`);
        try {
          process.kill(existingPid!, "SIGTERM");
        // eslint-disable-next-line promise-safety/no-bare-catch
        } catch {}
        // Wait for the old gateway to actually exit before spawning the
        // replacement. A fixed sleep let the old gateway keep tearing down its
        // backends while the new one booted and ran its orphan reconcile —
        // overlapping generations, the routine trigger for orphaned backends.
        // Poll until the pid is gone, bounded to the gateway's own 15s shutdown
        // budget.
        const stopDeadline = Date.now() + 15_000;
        while (isRunning(existingPid!) && Date.now() < stopDeadline) {
          await Bun.sleep(100);
        }
        if (isRunning(existingPid!)) {
          console.warn(
            `Existing gateway (PID ${existingPid}) still running after 15s; continuing.`,
          );
        }
      }

      const repoRoot = await getMainRepoRoot();
      const gatewayDir = join(repoRoot, "gateway");
      const gatewayBin = join(gatewayDir, "gateway");

      console.log("Building gateway...");
      const build = Bun.spawn(["go", "build", "-o", "gateway", "."], {
        cwd: gatewayDir,
        stdout: "inherit",
        stderr: "inherit",
      });
      if ((await build.exited) !== 0) {
        console.error("Gateway build failed");
        process.exit(1);
      }

      ensureDatabaseConfig(repoRoot);

      mkdirSync(LOGS_DIR, { recursive: true });
      // Truncate ("w"): only holds raw stdout/stderr until slog takes over, plus
      // any panic. The gateway writes its own rotating logs under -log-dir.
      const logFd = openSync(GATEWAY_STDIO_LOG, "w");

      const gw = Bun.spawn(
        [gatewayBin, "-log-level", opts.logLevel, "-log-dir", LOGS_DIR],
        {
          cwd: gatewayDir,
          stdout: logFd,
          stderr: logFd,
          stdin: "ignore",
        },
      );

      closeSync(logFd);
      writeFileSync(PID_FILE, String(gw.pid) + "\n");
      gw.unref();

      console.log(`Gateway started (PID ${gw.pid})`);
      console.log(`  Logs:    ${LOGS_DIR}/`);
      console.log(`  Gateway: http://singularity.localhost:9000`);
    });
}
