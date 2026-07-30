import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import {
  SINGULARITY_DIR,
  setReleaseIdentity,
  type ReleaseIdentity,
} from "@plugins/infra/plugins/paths/server";
import { DATABASE_CONFIG_PATH } from "@plugins/database/core";
import {
  ensureDatabase,
  getAdminPool,
} from "@plugins/database/plugins/admin/server";
import {
  writeWorktreeSpec,
  type ZeroCacheSpec,
} from "@plugins/infra/plugins/worktree/server";
import { seedAssetMirrorCache } from "@plugins/infra/plugins/asset-mirror/server";
import { retryUntil, exponential } from "@plugins/packages/plugins/retry/core";
// Canonical embedded-cluster constants — the single source of truth for where
// PG/PgBouncer listen. Importing them (rather than re-deriving the paths here)
// keeps database.json's connection host in lockstep with where the embedded
// start scripts actually bind their sockets.
import {
  PG_SOCKET_DIR,
  PG_PORT,
  PG_USER,
  pgPostmasterPidFile,
} from "@plugins/database/plugins/embedded/server";
import {
  PGBOUNCER_SOCKET_DIR,
  PGBOUNCER_PORT,
  pgbouncerPidFileUnder,
} from "@plugins/database/plugins/pgbouncer/server";
// The Zero opt-in switch is owned by the zero plugin (its single source of
// truth), consulted here only to decide whether to compose the worktree spec's
// `zeroCache` block. The same predicate gates the cache-service install-time
// provision, so the fence stays consistent across runtime and build time.
import { zeroCacheEnabled } from "@plugins/database/plugins/zero/core";
import { listenFlag } from "./listen";

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
// The gateway's own rotating slog sink. Only ever read as a FALLBACK when the
// stdio log has nothing (see gatewayLogTail): it carries prior sessions too, so
// its tail may describe a boot that is not this one.
const GATEWAY_SLOG_LOG = join(LOGS_DIR, "gateway.log");

/**
 * Host preconditions the whole stack depends on, asserted before anything is
 * spawned or written. This is the home for them: each is a property of the
 * machine, knowable in microseconds, whose violation otherwise surfaces minutes
 * later as an unrelated downstream symptom (a socket ENOENT, a readiness
 * timeout). Add further preconditions here rather than letting them be
 * rediscovered at runtime.
 *
 * Today there is exactly one. Postgres' `initdb` refuses to run as the root OS
 * user, so as root the embedded cluster — and therefore every backend — cannot
 * start at all. This is not a corner case: the deploy plugin defaults `sshUser`
 * to "root" (plugins/apps/plugins/deploy/plugins/servers/server/internal/tables.ts)
 * and the Hetzner provider prose walks the operator into a root shell, so the
 * platform's own default deploy path lands them in the one account under which
 * the bundle cannot run.
 */
export function assertSupportedHost(): void {
  // `process.getuid` is undefined off POSIX; an absent uid cannot be root,
  // which is the only thing this check is about.
  if (process.getuid?.() === 0) {
    throw new Error(
      [
        "Refusing to run as root: Postgres' initdb refuses to run as the root OS user, so the embedded cluster (and every backend behind it) cannot start.",
        "Create a non-root user and run this as them, e.g.:",
        "  adduser --disabled-password --gecos '' singularity",
        "  chown -R singularity:singularity <bundle dir>",
        "  su - singularity -c '<bundle dir>/launch'",
      ].join("\n"),
    );
  }
}

/**
 * The last `lines` non-empty lines of a log file, or null when there is nothing
 * to quote. Absence is a legitimate state here — the gateway can die before it
 * opens a log — not a failure, so callers fall through to the next source;
 * every other read error propagates.
 */
function readLogTail(path: string, lines: number): string | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const kept = raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .slice(-lines);
  return kept.length > 0 ? kept.join("\n") : null;
}

const GATEWAY_LOG_TAIL_LINES = 20;

/**
 * The gateway's last output, for embedding in a launcher error.
 *
 * `gateway-stdio.log` FIRST and by design: `spawnGatewayDaemon` opens it with
 * mode "w", so it is truncated on every start and holds exactly THIS boot's
 * output with no scrollback to read past — and the gateway writes its fatal
 * service-start error to stderr precisely so it lands there. The rotating
 * `gateway.log` is only the fallback: correct, but it also holds earlier
 * sessions, so its tail can describe a different boot.
 */
function gatewayLogTail(): string {
  const tail =
    readLogTail(GATEWAY_STDIO_LOG, GATEWAY_LOG_TAIL_LINES) ??
    readLogTail(GATEWAY_SLOG_LOG, GATEWAY_LOG_TAIL_LINES);
  return tail ?? `(no output in ${GATEWAY_STDIO_LOG} or ${GATEWAY_SLOG_LOG})`;
}

/**
 * The gateway pidfile under an arbitrary install root. Used by teardown to find a
 * preview's gateway (rooted at its `/tmp/sgp-XXXXXX` data dir, not the dev
 * `SINGULARITY_DIR`). `PID_FILE` is the same path under this process's root.
 */
export function gatewayPidFile(root: string): string {
  return join(root, "gateway.pid");
}

const PID_FILE = gatewayPidFile(SINGULARITY_DIR);

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
    // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- any network error (connection refused, timeout, DNS) means the gateway is not listening; propagating would misrepresent a probe failure as a fatal error
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

/**
 * Compose the optional per-worktree `zeroCache` spec block, or `undefined` when
 * the opt-in is unset (so the spec serializes byte-for-byte as before).
 *
 * `command` = `bun run <abs start.ts within THIS worktree repo>`; `cwd` = the
 * worktree repo root; `upstreamDb` = a loopback-TCP DSN to the worktree's fork
 * DB, built directly from the embedded constants (PG_USER@127.0.0.1:PG_PORT/<name>
 * — NOT pgbouncer, NOT the unix socket, `127.0.0.1` literally, no `?schema`).
 * The gateway adds ZERO_PORT (allocated) + ZERO_REPLICA_FILE (per-worktree) when
 * it spawns the command.
 */
export function zeroCacheSpec(opts: {
  name: string;
  repoRoot: string;
}): ZeroCacheSpec | undefined {
  if (!zeroCacheEnabled()) return undefined;
  return {
    command: [
      "bun",
      "run",
      join(
        opts.repoRoot,
        "plugins/database/plugins/zero/plugins/cache-service/scripts/start.ts",
      ),
    ],
    upstreamDb: `postgresql://${PG_USER}@127.0.0.1:${PG_PORT}/${opts.name}`,
    cwd: opts.repoRoot,
  };
}

export function ensureDatabaseConfig(repoRoot: string, log: LogFn = noop): void {
  // Upgrade existing config: add pgbouncer service if packages are now installed.
  if (existsSync(DATABASE_CONFIG_PATH)) {
    try {
      const existing = JSON.parse(readFileSync(DATABASE_CONFIG_PATH, "utf-8"));
      const services: Array<{ name: string }> = existing.services ?? [];
      const hasPgBouncer = services.some((s) => s.name === "pgbouncer");
      let changed = false;
      let nextServices = services;
      if (!hasPgBouncer && hasPgBouncerPackage(repoRoot)) {
        existing.pgbouncer = pgbouncerConnection();
        nextServices = [...nextServices, pgbouncerService(repoRoot)];
        changed = true;
        log("Updated database config: added PgBouncer");
      }
      // zero-cache is no longer a global database.json service (Stage 2): it is
      // a per-worktree gateway-owned sidecar, composed into the worktree spec's
      // `zeroCache` block (see zeroCacheSpec). Nothing to add here.
      if (changed) {
        existing.services = nextServices;
        writeFileSync(
          DATABASE_CONFIG_PATH,
          JSON.stringify(existing, null, 2) + "\n",
        );
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
 * spawned backend) under the release dir. The `-listen <bindHost>:<port>` flag
 * pins the listen address.
 */
export function spawnGatewayDaemon(opts: {
  gatewayDir: string;
  gatewayBin: string;
  port: number;
  /**
   * Bind host, e.g. `127.0.0.1`. Omitted (the default) is a wildcard bind on
   * every interface — dev and the desktop app, where the gateway IS the front
   * door. A deployment passes loopback, so it is reachable only through the TLS
   * reverse proxy in front of it: the public-port hole stops being something a
   * firewall rule has to remember and becomes a property of how it was started.
   */
  bindHost?: string;
  logLevel: string;
  /**
   * Fallback namespace for subdomain-less requests, passed as
   * `-default-namespace`. Set to the single app's name in a packaged build so a
   * desktop webview at bare localhost reaches the backend; omitted in dev (such
   * requests 404, today's behavior).
   */
  defaultNamespace?: string;
}): number {
  mkdirSync(LOGS_DIR, { recursive: true });
  // Truncate ("w"): only holds raw stdout/stderr until slog takes over, plus
  // any panic. The gateway writes its own rotating logs under -log-dir.
  const logFd = openSync(GATEWAY_STDIO_LOG, "w");

  const gw = Bun.spawn(
    [
      opts.gatewayBin,
      "-listen",
      listenFlag({ host: opts.bindHost ?? null, port: opts.port }),
      "-log-level",
      opts.logLevel,
      "-log-dir",
      LOGS_DIR,
      ...(opts.defaultNamespace
        ? ["-default-namespace", opts.defaultNamespace]
        : []),
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

// Generous: the gateway does not bind its listener until its supervisor has
// brought EVERY managed service up (StartAll precedes ListenAndServe), and a
// cold `initdb` on a fresh host legitimately takes tens of seconds. Nothing
// waits this out in the failure case: the per-tick pid check below turns a
// gateway that died into an immediate throw, so the deadline only covers the
// narrow "alive but never listened" hang.
const GATEWAY_READY_TIMEOUT_MS = 120_000;

/**
 * Block until the gateway is serving, failing FAST and with the real reason if
 * it is not going to.
 *
 * The gateway exits non-zero when a managed service fails to start, so "the
 * gateway is listening" implies "every managed service came up" — which makes
 * this the one place the whole stack's startup can be gated. Polling only for
 * the listener (or worse, for the PG socket downstream) converts a precise
 * diagnosis emitted at t=0 into an unrelated timeout at t=90s; checking the pid
 * on every tick converts it back.
 */
export async function awaitGatewayReady(opts: {
  pid: number;
  port: number;
}): Promise<void> {
  const { pid, port } = opts;
  await retryUntil(
    async () => {
      // Death check FIRST, every tick — this is the case worth reporting fast,
      // and its evidence (the gateway's own last output) is already on disk.
      if (!isRunning(pid)) {
        throw new Error(
          `Gateway exited during startup (PID ${pid}). Last output:\n${gatewayLogTail()}`,
        );
      }
      return (await isGatewayListening(port)) ? true : null;
    },
    {
      delay: exponential({ initial: 100, max: 1_000 }),
      deadline: GATEWAY_READY_TIMEOUT_MS,
      onDeadline: () => {
        throw new Error(
          `Gateway (PID ${pid}) is running but never listened on port ${port} within ${GATEWAY_READY_TIMEOUT_MS}ms. Last output:\n${gatewayLogTail()}`,
        );
      },
    },
  );
}

/**
 * The supervisor's recorded failure reason for a managed service, or null when
 * there is none to report. `ServiceSnapshot.error` is populated only for a
 * failed service, so a healthy one legitimately has no `error` field.
 *
 * Called ONLY while composing an error that is about to be thrown, so it never
 * throws itself: an unreachable gateway, a non-200, or a snapshot without
 * `error` all mean "nothing to add here" — never a failure a caller could act
 * on. Letting a probe failure escape would replace a real diagnosis with a
 * worse one.
 */
async function readServiceError(
  port: number,
  service: string,
): Promise<string | null> {
  try {
    const resp = await fetch(
      `http://localhost:${port}/gateway/services/${service}/status`,
      { signal: AbortSignal.timeout(1000) },
    );
    if (!resp.ok) return null;
    const snapshot = (await resp.json()) as { error?: unknown };
    return typeof snapshot.error === "string" && snapshot.error !== ""
      ? snapshot.error
      : null;
    // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- enrichment-only probe on an error path (same precedent as isGatewayListening): any network/parse error means the gateway has nothing to add to the error already being thrown
  } catch {
    return null;
  }
}

// Generous: a preview's PG is a from-scratch `initdb` running ALONGSIDE the full
// dev stack (CPU/IO contention), so the cold cluster-create path can exceed 30s.
// This launcher constant is release/preview-only — distinct from the database
// plugin's own `awaitPgReady`, so dev boot is unaffected.
const PG_READY_TIMEOUT_MS = 90_000;

/**
 * Poll the admin pool (`SELECT 1`) until PG is reachable, to a ~90s deadline.
 * The admin pool connects DIRECT to PG (5433 socket), independent of PgBouncer,
 * so this gates on the cluster being up before any DB is created. Fails loud on
 * deadline.
 *
 * Pass `port` (the gateway's) so the deadline path can quote the supervisor's
 * recorded reason. That covers the residual case `awaitGatewayReady` cannot:
 * the gateway came up — so every managed service DID start — and PG died
 * afterwards, which is a watchdog concern the gateway deliberately survives.
 */
export async function awaitPgReady(
  opts: { deadlineMs?: number; port?: number } = {},
): Promise<void> {
  const deadlineMs = opts.deadlineMs ?? PG_READY_TIMEOUT_MS;
  let lastErr: unknown = null;
  await retryUntil(
    async () => {
      try {
        await getAdminPool().query("SELECT 1");
        return true;
      // eslint-disable-next-line promise-safety/no-absorbed-failure -- retryUntil probe: null signals "not ready yet, retry" (lastErr captured for the deadline); a genuine failure surfaces when the retry deadline elapses
      } catch (err) {
        lastErr = err;
        return null;
      }
    },
    {
      delay: exponential({ initial: 100, max: 1_000 }),
      deadline: deadlineMs,
      // Async: `retryUntil` returns whatever `onDeadline` returns, and its own
      // result is awaited by us — so the rejection propagates as a throw.
      onDeadline: async () => {
        const supervisorErr =
          opts.port === undefined
            ? null
            : await readServiceError(opts.port, "postgres");
        throw new Error(
          `Postgres did not become reachable within ${deadlineMs}ms` +
            (supervisorErr === null
              ? ""
              : `; gateway supervisor reports: ${supervisorErr}`),
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
      // eslint-disable-next-line promise-safety/no-absorbed-failure -- retryUntil probe: null signals "not ready yet, retry" (lastErr captured for the deadline); a genuine failure surfaces when the retry deadline elapses
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
 *   4. awaitGatewayReady — the gateway is serving, which (because it exits on a
 *      failed service start) means every managed service came up. Gating here
 *      rather than on the PG socket is what makes a service that refused to
 *      start surface as itself instead of as a downstream timeout.
 *   5. awaitPgReady — poll the admin pool until the cluster is up.
 *   6. ensureDatabase(name) — CREATE DATABASE if absent (idempotent).
 *   7. writeWorktreeSpec — written LAST, so the gateway only discovers the app
 *      after its DB exists; the spawned backend migrates the empty DB on boot.
 *   8. awaitAppReady — poll health/ready until the backend serves.
 */
export async function bootSelfContainedApp(opts: {
  name: string;
  server: string;
  web: string;
  port: number;
  /** Gateway bind host; omitted is a wildcard bind. See `spawnGatewayDaemon`. */
  bindHost?: string;
  /**
   * Which build this is (from the bundle's `RELEASE.json`), stamped into the env
   * before the gateway spawn so it reaches the backend and `/api/health` can
   * name the serving build. Omitted outside a release.
   */
  releaseIdentity?: ReleaseIdentity;
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
  const { name, server, web, command, port, bindHost, repoRoot } = opts;
  const logLevel = opts.logLevel ?? "info";
  const log = opts.log ?? noop;

  const { gatewayDir, gatewayBin } = await buildOrLocateGateway(repoRoot, log);
  ensureDatabaseConfig(repoRoot, log);
  // Stamp the release identity BEFORE the gateway spawn: a child's env is
  // snapshotted at spawn, and the backend inherits its env from the gateway, so
  // this is the last moment it can still reach the process that serves
  // /api/health.
  if (opts.releaseIdentity) setReleaseIdentity(opts.releaseIdentity);
  // A self-contained app is single-namespace: route subdomain-less requests
  // (the desktop webview, single-origin web) to it via the gateway default.
  const pid = spawnGatewayDaemon({
    gatewayDir,
    gatewayBin,
    port,
    bindHost,
    logLevel,
    defaultNamespace: name,
  });
  log(`Gateway started (PID ${pid}); waiting for it to serve...`);

  await awaitGatewayReady({ pid, port });
  log("Gateway is serving; waiting for Postgres...");

  await awaitPgReady({ port });
  await ensureDatabase(name);

  // Spec last: the gateway's fsnotify watcher only discovers the namespace once
  // its DB exists, so the backend's boot migrator never races DB creation.
  writeWorktreeSpec({
    name,
    server,
    web,
    command,
    zeroCache: zeroCacheSpec({ name, repoRoot }),
  });
  log(`Registered app "${name}"; waiting for backend to become ready...`);

  await awaitAppReady(name, port);
}

/** Read a numeric PID from the first line of a pidfile; null if absent/invalid. */
function readPidFile(path: string): number | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  const first = raw.split("\n", 1)[0]?.trim() ?? "";
  const n = parseInt(first, 10);
  return Number.isNaN(n) ? null : n;
}

/** Signal a pid, treating "already gone" (ESRCH) as success. */
function signalPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ESRCH") throw err;
  }
}

/**
 * Best-effort kill of whatever process is LISTENing on `port`. A teardown backstop
 * for processes detached into their own session (the gateway via `unref()`, PG via
 * `pg_ctl` fork+setsid) that a pidfile read might miss. `lsof` exits status 1 when
 * nothing matches — the expected "nothing to kill" case.
 */
function killListenerOnPort(port: number): void {
  let out: string;
  try {
    out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf8",
    });
  } catch (err) {
    if ((err as { status?: number }).status === 1) return; // no listener
    throw err;
  }
  for (const pid of out.split("\n").filter(Boolean)) {
    signalPid(Number(pid), "SIGTERM");
  }
}

const GATEWAY_STOP_TIMEOUT_MS = 10_000;

/**
 * Tear down a self-contained app stack rooted at `root` (a preview's `/tmp/sgp-*`
 * data dir). The whole stack is detached after boot — the gateway is `unref()`'d
 * into its own session, `pg_ctl` fork+setsids PG, and `pgbouncer -d` daemonizes —
 * so none sit in a killable process group. We kill each via its pidfile under
 * `root`, in a watchdog-safe order:
 *
 *   1. Gateway FIRST: SIGTERM and wait for exit. This stops the gateway's service
 *      watchdog (which would otherwise restart PG/PgBouncer on their ~2s probe) AND
 *      triggers the gateway's graceful shutdown, which kills the app backend.
 *      Backstop: killListenerOnPort(httpPort).
 *   2. PgBouncer: SIGTERM (Unix-socket-only — no TCP port to backstop).
 *   3. Postgres: SIGQUIT (immediate shutdown — the data dir is discarded, so no
 *      graceful drain is needed). Backstop: killListenerOnPort(pgPort) — PG
 *      TCP-binds the loopback override port.
 *
 * Idempotent: a missing pidfile or already-dead process is a no-op, so it is safe
 * to call on an orphan stack or twice on the same one. `httpPort`/`pgPort` are the
 * port backstops; omit them (e.g. an orphan-dir sweep where the ports are unknown)
 * to rely on the pidfiles alone.
 */
export async function teardownSelfContainedApp(
  opts: { root: string; httpPort?: number; pgPort?: number },
  log: LogFn = noop,
): Promise<void> {
  const { root, httpPort, pgPort } = opts;

  // 1. Gateway — kill and wait, so the supervisor watchdog is gone before we touch
  // PG/PgBouncer (else it would restart them out from under us).
  const gwPid = readPidFile(gatewayPidFile(root));
  if (gwPid !== null && isRunning(gwPid)) {
    signalPid(gwPid, "SIGTERM");
    await retryUntil(async () => (isRunning(gwPid) ? null : true), {
      delay: exponential({ initial: 50, max: 500 }),
      deadline: GATEWAY_STOP_TIMEOUT_MS,
      onDeadline: () => {
        signalPid(gwPid, "SIGKILL");
        return true;
      },
    });
  }
  if (httpPort !== undefined) killListenerOnPort(httpPort);

  // 2. PgBouncer.
  const pgbPid = readPidFile(pgbouncerPidFileUnder(root));
  if (pgbPid !== null) signalPid(pgbPid, "SIGTERM");

  // 3. Postgres — immediate shutdown; the cluster is thrown away.
  const pgPid = readPidFile(pgPostmasterPidFile(root));
  if (pgPid !== null) signalPid(pgPid, "SIGQUIT");
  if (pgPort !== undefined) killListenerOnPort(pgPort);

  log(`Tore down self-contained app at ${root}`);
}

/**
 * Seed the release bundle's pre-warmed asset-mirror cache into the app-data dir
 * on first run (copy-if-absent). A launcher boot step so `launch.ts` — a bin
 * entrypoint that must defer every path-dependent import past the env freeze and
 * may only reach other plugins through this barrel it already dynamic-imports
 * (the boundary rules forbid a literal cross-plugin dynamic import) — can trigger
 * it. The `asset-mirror` subdir name + the copy mechanics live in asset-mirror;
 * this only forwards.
 */
export function seedReleaseAssetMirror(opts: {
  bundleRoot: string;
  dataDir: string;
  log?: LogFn;
}): void {
  seedAssetMirrorCache(opts);
}

/**
 * Seed the release bundle's resolved config defaults into the app-data dir on
 * first run (copy-if-absent), so a released app's config_v2 "default-for-everyone"
 * values resolve on first boot instead of falling back to hardcoded schema
 * defaults. `release.ts` vendored the propagated seed under
 * `<bundleRoot>/config-seed/config/<worktree>/…`; this copies it to
 * `<dataDir>/config/<worktree>/`, the exact path config_v2's config-dir.ts reads
 * (`CONFIG_DIR = SINGULARITY_DIR/config/<worktree>`).
 *
 * The `config/<worktree>` formula is inlined here rather than imported from
 * config_v2, matching this file's / launch.ts's existing handling of the other
 * vendored trees (migrations, PG, PgBouncer, parcel-watcher): the launcher must
 * type-check under the DOM-free `tools` tsconfig, but the config_v2 barrels
 * transitively pull DOM-typed endpoint code that does not. Keep this formula in
 * lockstep with `config-dir.ts`.
 */
export function seedReleaseConfig(opts: {
  bundleRoot: string;
  dataDir: string;
  worktreeName: string;
  log?: LogFn;
}): void {
  const src = join(opts.bundleRoot, "config-seed", "config", opts.worktreeName);
  const dest = join(opts.dataDir, "config", opts.worktreeName);
  if (!existsSync(src)) return; // dev / no seed baked → no-op
  if (existsSync(dest)) return; // already seeded (or user has a config dir) → don't clobber
  cpSync(src, dest, { recursive: true });
  opts.log?.(`Seeded config defaults → ${dest}`);
}
