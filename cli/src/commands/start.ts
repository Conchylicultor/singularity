import type { Command } from "commander";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getMainRepoRoot } from "../git/main-repo-root";
import { SINGULARITY_DIR, DATABASE_CONFIG_PATH, PG_DIR } from "../paths";
const LOGS_DIR = join(SINGULARITY_DIR, "logs");
const GATEWAY_LOG = join(LOGS_DIR, "gateway.log");
const PID_FILE = join(SINGULARITY_DIR, "gateway.pid");

// Embedded PG defaults (mirrors plugins/database/plugins/embedded/shared).
const EMBEDDED_PG_PORT = 5433;
const EMBEDDED_PG_USER = "singularity";
const EMBEDDED_PG_SOCKET_DIR = join(PG_DIR, "socket");

function readPid(): number | null {
  try {
    const n = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(n) ? null : n;
  } catch {
    return null;
  }
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function isGatewayListening(): Promise<boolean> {
  try {
    const resp = await fetch("http://localhost:9000/gateway/worktrees", {
      signal: AbortSignal.timeout(1000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

function ensureDatabaseConfig(repoRoot: string): void {
  if (existsSync(DATABASE_CONFIG_PATH)) return;

  const embeddedPkgDir = join(
    repoRoot,
    "plugins/database/plugins/embedded/node_modules/@embedded-postgres",
  );
  const hasEmbedded = existsSync(embeddedPkgDir);

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
        services: [
          {
            name: "postgres",
            start: ["bun", "run", startScript],
            ready: {
              unix: join(EMBEDDED_PG_SOCKET_DIR, `.s.PGSQL.${EMBEDDED_PG_PORT}`),
            },
            watchdog: { intervalSec: 2 },
          },
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
      ? "Generated database config (embedded Postgres)"
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
        console.log(`  Logs:    ${GATEWAY_LOG}`);
        return;
      }

      if (pidAlive) {
        if (!opts.force) {
          console.log(`Gateway is already running (PID ${existingPid})`);
          console.log(`  Logs:    ${GATEWAY_LOG}`);
          console.log(`  Gateway: http://singularity.localhost:9000`);
          return;
        }
        console.log(`Stopping existing gateway (PID ${existingPid})...`);
        try {
          process.kill(existingPid!, "SIGTERM");
          await Bun.sleep(2000);
        // eslint-disable-next-line promise-safety/no-bare-catch
        } catch {}
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
      const logFd = openSync(GATEWAY_LOG, "a");

      const gw = Bun.spawn(
        [gatewayBin, "-log-level", opts.logLevel],
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
      console.log(`  Logs:    ${GATEWAY_LOG}`);
      console.log(`  Gateway: http://singularity.localhost:9000`);
    });
}
