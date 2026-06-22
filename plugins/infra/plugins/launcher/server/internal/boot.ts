import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";
import { DATABASE_CONFIG_PATH } from "@plugins/database/core";
import {
  ensureDatabase,
  getAdminPool,
} from "@plugins/database/plugins/admin/server";
import { writeWorktreeSpec } from "@plugins/infra/plugins/worktree/server";
import { retryUntil, exponential } from "@plugins/packages/plugins/retry/core";
// Canonical embedded-cluster constants — the single source of truth for where
// PG/PgBouncer listen. Importing them (rather than re-deriving the paths here)
// keeps database.json's connection host in lockstep with where the embedded
// start scripts actually bind their sockets.
import {
  PG_SOCKET_DIR,
  PG_PORT,
  PG_USER,
} from "@plugins/database/plugins/embedded/server";
import {
  PGBOUNCER_SOCKET_DIR,
  PGBOUNCER_PORT,
} from "@plugins/database/plugins/pgbouncer/server";

// Progress sink. The launcher runs in a CLI process whose human-facing output
// belongs on the terminal, but this plugin must not assume stdout (a packaged
// host may pipe progress elsewhere) — and plugin code may not call console.log.
// So callers inject the sink; bin/ commands pass `console.log`, others a no-op.
type LogFn = (msg: string) => void;
const noop: LogFn = () => {};

// All data paths derive from the (possibly overridden) SINGULARITY_DIR, so a
// release launched with SINGULARITY_DIR=<releaseRoot> isolates its entire install
// — pid file, logs, the PG cluster, the registry — under that root.
const LOGS_DIR = join(SINGULARITY_DIR, "logs");
// The gateway owns the rotating per-channel logs under LOGS_DIR (gateway.log,
// <worktree>.log). This file only captures the daemon's raw stdout/stderr — Go
// panics and any crash before slog is wired up. Truncated on each start so it
// can't grow unbounded; the last crash survives until the next launch.
const GATEWAY_STDIO_LOG = join(LOGS_DIR, "gateway-stdio.log");
const PID_FILE = join(SINGULARITY_DIR, "gateway.pid");

export function readPid(): number | null {
  try {
    const n = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(n) ? null : n;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    return null;
  }
}

export function isRunning(pid: number): boolean {
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

export async function isGatewayListening(port: number): Promise<boolean> {
  try {
    const resp = await fetch(`http://localhost:${port}/gateway/worktrees`, {
      signal: AbortSignal.timeout(1000),
    });
    return resp.ok;
    // eslint-disable-next-line promise-safety/no-bare-catch -- any network error (connection refused, timeout, DNS) means the gateway is not listening; propagating would misrepresent a probe failure as a fatal error
  } catch {
    return false;
  }
}

export function hasPgBouncerPackage(repoRoot: string): boolean {
  return existsSync(
    join(repoRoot, "plugins/database/plugins/pgbouncer/node_modules/@equin"),
  );
}

export function pgbouncerService(repoRoot: string) {
  return {
    name: "pgbouncer",
    start: [
      "bun",
      "run",
      join(repoRoot, "plugins/database/plugins/pgbouncer/scripts/start.ts"),
    ],
    ready: {
      unix: join(PGBOUNCER_SOCKET_DIR, `.s.PGSQL.${PGBOUNCER_PORT}`),
    },
    watchdog: { intervalSec: 2 },
  };
}

export function pgbouncerConnection() {
  return { host: PGBOUNCER_SOCKET_DIR, port: PGBOUNCER_PORT };
}

export function ensureDatabaseConfig(repoRoot: string, log: LogFn = noop): void {
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
        log("Updated database config: added PgBouncer");
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
          host: PG_SOCKET_DIR,
          port: PG_PORT,
          user: PG_USER,
        },
        ...(hasPgBouncer ? { pgbouncer: pgbouncerConnection() } : {}),
        services: [
          {
            name: "postgres",
            start: ["bun", "run", startScript],
            ready: {
              unix: join(PG_SOCKET_DIR, `.s.PGSQL.${PG_PORT}`),
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
  log(
    hasEmbedded
      ? `Generated database config (embedded Postgres${hasPgBouncer ? " + PgBouncer" : ""})`
      : "Generated database config (system Postgres)",
  );
}

/**
 * Write a release `database.json`: the SAME `DatabaseConfig` shape as
 * `ensureDatabaseConfig`'s embedded path, but with each service's `start` argv
 * pointing at a compiled start binary instead of `["bun","run",<startScript.ts>]`.
 * A packaged release has no bun and no node_modules, so the dev probe + the
 * `bun run` invocation don't apply — the compiled `pg-start` / `pgbouncer-start`
 * binaries resolve the vendored native PG/PgBouncer instead.
 *
 * The `connection` / `pgbouncer` blocks and the `ready` socket probes are
 * identical to the embedded case (same canonical PG_* / PGBOUNCER_* constants),
 * so a release cluster is indistinguishable to the gateway from a dev embedded
 * one — only the spawn command differs. PgBouncer is included only when a start
 * binary is supplied.
 */
export function writeReleaseDatabaseConfig(
  opts: { pgStartBin: string; pgbouncerStartBin?: string },
  log: LogFn = noop,
): void {
  const { pgStartBin, pgbouncerStartBin } = opts;
  const hasPgBouncer = pgbouncerStartBin !== undefined;

  const config = {
    provider: "embedded" as const,
    connection: {
      host: PG_SOCKET_DIR,
      port: PG_PORT,
      user: PG_USER,
    },
    ...(hasPgBouncer ? { pgbouncer: pgbouncerConnection() } : {}),
    services: [
      {
        name: "postgres",
        start: [pgStartBin],
        ready: {
          unix: join(PG_SOCKET_DIR, `.s.PGSQL.${PG_PORT}`),
        },
        watchdog: { intervalSec: 2 },
      },
      ...(hasPgBouncer
        ? [
            {
              name: "pgbouncer",
              start: [pgbouncerStartBin],
              ready: {
                unix: join(PGBOUNCER_SOCKET_DIR, `.s.PGSQL.${PGBOUNCER_PORT}`),
              },
              watchdog: { intervalSec: 2 },
            },
          ]
        : []),
    ],
  };

  mkdirSync(SINGULARITY_DIR, { recursive: true });
  writeFileSync(DATABASE_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
  log(
    `Generated release database config (embedded Postgres${hasPgBouncer ? " + PgBouncer" : ""})`,
  );
}

/**
 * Build (or locate) the gateway binary. If `<repoRoot>/gateway/gateway` already
 * exists, skip the build and return it as-is — this is the release path (a
 * vendored prebuilt binary, no Go toolchain on the host) and also a fast path in
 * dev (a prior build left the binary in place). Only run `go build -o gateway`
 * when the binary is absent. Pass `forceBuild` to rebuild unconditionally (dev
 * correctness when the gateway Go source changed). Fails loud if the build does
 * not exit cleanly. Returns the gateway working dir and binary path so the
 * caller can spawn it.
 */
export async function buildOrLocateGateway(
  repoRoot: string,
  log: LogFn = noop,
  forceBuild = false,
): Promise<{ gatewayDir: string; gatewayBin: string }> {
  const gatewayDir = join(repoRoot, "gateway");
  const gatewayBin = join(gatewayDir, "gateway");

  if (!forceBuild && existsSync(gatewayBin)) {
    log("Using prebuilt gateway");
    return { gatewayDir, gatewayBin };
  }

  log("Building gateway...");
  const build = Bun.spawn(["go", "build", "-o", "gateway", "."], {
    cwd: gatewayDir,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await build.exited) !== 0) {
    throw new Error("Gateway build failed");
  }

  return { gatewayDir, gatewayBin };
}

/**
 * Daemonize the gateway: spawn it detached (`unref()`), write its pid to the pid
 * file, and return the pid. We pass `env: { ...process.env }` EXPLICITLY — Bun
 * snapshots the real environment at process start, so runtime mutations to
 * `process.env` (the release launcher's `SINGULARITY_DIR` + PG bin-dir overrides,
 * set in launch.ts before any import) are NOT reflected in a child's inherited
 * env unless we spread the live `process.env` into the spawn. Spreading it
 * forwards those overrides to the gateway, which re-roots its registry / sockets
 * / cluster dirs and the supervised PG/PgBouncer start binaries (and every
 * spawned backend) under the release dir. The `-listen :<port>` flag pins the
 * listen port.
 */
export function spawnGatewayDaemon(opts: {
  gatewayDir: string;
  gatewayBin: string;
  port: number;
  logLevel: string;
}): number {
  mkdirSync(LOGS_DIR, { recursive: true });
  // Truncate ("w"): only holds raw stdout/stderr until slog takes over, plus
  // any panic. The gateway writes its own rotating logs under -log-dir.
  const logFd = openSync(GATEWAY_STDIO_LOG, "w");

  const gw = Bun.spawn(
    [
      opts.gatewayBin,
      "-listen",
      `:${opts.port}`,
      "-log-level",
      opts.logLevel,
      "-log-dir",
      LOGS_DIR,
    ],
    {
      cwd: opts.gatewayDir,
      stdout: logFd,
      stderr: logFd,
      stdin: "ignore",
      // Explicit spread (not implicit inherit) so runtime `process.env`
      // mutations — SINGULARITY_DIR + the PG bin-dir overrides set by the
      // release launcher — actually reach the gateway. See the docstring.
      env: { ...process.env },
    },
  );

  closeSync(logFd);
  writeFileSync(PID_FILE, String(gw.pid) + "\n");
  gw.unref();
  return gw.pid;
}

const PG_READY_TIMEOUT_MS = 30_000;

/**
 * Poll the admin pool (`SELECT 1`) until PG is reachable, to a ~30s deadline.
 * The admin pool connects DIRECT to PG (5433 socket), independent of PgBouncer,
 * so this gates on the cluster being up before any DB is created. Fails loud on
 * deadline.
 */
export async function awaitPgReady(
  deadlineMs: number = PG_READY_TIMEOUT_MS,
): Promise<void> {
  let lastErr: unknown = null;
  await retryUntil(
    async () => {
      try {
        await getAdminPool().query("SELECT 1");
        return true;
      } catch (err) {
        lastErr = err;
        return null;
      }
    },
    {
      delay: exponential({ initial: 100, max: 1_000 }),
      deadline: deadlineMs,
      onDeadline: () => {
        throw new Error(
          `Postgres did not become reachable within ${deadlineMs}ms`,
          { cause: lastErr },
        );
      },
    },
  );
}

// Generous: a release provisions its DB by create-empty-then-migrate, so the
// very first boot runs the entire migration set from scratch (a fork would copy
// an already-migrated DB). That cold path, plus pool warmup and derived-view
// rebuild behind the onReadyBlocking barrier, can take well over 30s.
const HEALTH_READY_TIMEOUT_MS = 120_000;

/**
 * Poll `http://<name>.localhost:<port>/api/health/ready` until it returns 200.
 * The gateway only reports a backend ready once its onReadyBlocking barrier
 * (migrations + warmup) completes, so a 200 here means the app DB is migrated
 * and the backend is serving. A 404 means the gateway has no such namespace yet
 * (spec not picked up) — kept distinct from ready so we never false-positive on
 * an unknown-namespace gateway 404. Fails loud on deadline.
 */
async function awaitAppReady(name: string, port: number): Promise<void> {
  const url = `http://${name}.localhost:${port}/api/health/ready`;
  let lastErr: unknown = null;
  await retryUntil(
    async () => {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (resp.ok) return true;
        lastErr = new Error(`health/ready returned ${resp.status}`);
        return null;
      } catch (err) {
        lastErr = err;
        return null;
      }
    },
    {
      delay: exponential({ initial: 100, max: 1_000 }),
      deadline: HEALTH_READY_TIMEOUT_MS,
      onDeadline: () => {
        throw new Error(
          `App "${name}" did not become ready at ${url} within ${HEALTH_READY_TIMEOUT_MS}ms`,
          { cause: lastErr },
        );
      },
    },
  );
}

/**
 * Boot a packaged app's full runtime end to end, race-free. The launcher is a
 * release entry point invoked with SINGULARITY_DIR already set in its env (all
 * path constants are import-time frozen, so it cannot be set mid-process).
 *
 * Ordering (each step gates the next):
 *   1. Build/locate the gateway binary.
 *   2. ensureDatabaseConfig — write the release database.json under the root.
 *   3. Spawn the gateway daemon (inherits SINGULARITY_DIR, listens on `port`);
 *      the gateway is the sole supervisor of embedded PG + PgBouncer.
 *   4. awaitPgReady — poll the admin pool until the cluster is up.
 *   5. ensureDatabase(name) — CREATE DATABASE if absent (idempotent).
 *   6. writeWorktreeSpec — written LAST, so the gateway only discovers the app
 *      after its DB exists; the spawned backend migrates the empty DB on boot.
 *   7. awaitAppReady — poll health/ready until the backend serves.
 */
export async function bootSelfContainedApp(opts: {
  name: string;
  server: string;
  web: string;
  port: number;
  repoRoot: string;
  /**
   * Explicit backend spawn argv (e.g. `["<abs>/server"]` for a compiled
   * release). Threaded into spec.json; absent in dev, where the gateway
   * falls back to `bun bin/index.ts`.
   */
  command?: string[];
  logLevel?: string;
  log?: LogFn;
}): Promise<void> {
  const { name, server, web, command, port, repoRoot } = opts;
  const logLevel = opts.logLevel ?? "info";
  const log = opts.log ?? noop;

  const { gatewayDir, gatewayBin } = await buildOrLocateGateway(repoRoot, log);
  ensureDatabaseConfig(repoRoot, log);
  const pid = spawnGatewayDaemon({ gatewayDir, gatewayBin, port, logLevel });
  log(`Gateway started (PID ${pid}); waiting for Postgres...`);

  await awaitPgReady();
  await ensureDatabase(name);

  // Spec last: the gateway's fsnotify watcher only discovers the namespace once
  // its DB exists, so the backend's boot migrator never races DB creation.
  writeWorktreeSpec({ name, server, web, command });
  log(`Registered app "${name}"; waiting for backend to become ready...`);

  await awaitAppReady(name, port);
}
