#!/usr/bin/env bun
/**
 * Embedded Postgres lifecycle script. Invoked by the gateway's generic
 * service supervisor via the "start" command in database.json.
 *
 * Handles: binary resolution, dylib symlinks, reattach detection,
 * initdb, stale pidfile cleanup, and pg_ctl start.
 *
 * Exits 0 on success (PG is running), non-zero on failure.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
import {
  PG_PORT,
  PG_USER,
  PG_DIR,
  PG_DATA_DIR,
  PG_SOCKET_DIR,
  PG_LOG_FILE,
  PG_PID_FILE,
  MAX_CONNECTIONS,
} from "../shared";

const READY_TIMEOUT_SEC = 30;

// ─── platform detection ──────────────────────────────────────

function platformPackage(): string {
  const platform = process.platform;
  const arch = process.arch;
  const mapping: Record<string, Record<string, string>> = {
    darwin: { arm64: "darwin-arm64", x64: "darwin-x64" },
    linux: { arm64: "linux-arm64", x64: "linux-x64" },
  };
  const pkg = mapping[platform]?.[arch];
  if (!pkg) throw new Error(`pg: unsupported platform ${platform}/${arch}`);
  return `@embedded-postgres/${pkg}`;
}

// ─── binary resolution ──────────────────────────────────────

function resolveBinDir(): string {
  // A packaged release points at vendored native binaries via env override.
  const override = process.env.SINGULARITY_PG_BIN_DIR;
  if (override) {
    if (!existsSync(override)) {
      throw new Error(
        `pg: SINGULARITY_PG_BIN_DIR set to ${override} but that directory does not exist`,
      );
    }
    return override;
  }
  const pluginRoot = join(dirname(import.meta.dir)); // scripts/ -> embedded plugin root
  const pkg = platformPackage();
  const dir = join(pluginRoot, "node_modules", pkg, "native", "bin");
  if (!existsSync(dir)) {
    throw new Error(`pg: embedded PG binaries not found at ${dir}; run \`bun install\``);
  }
  return dir;
}

// ─── symlink management ─────────────────────────────────────

function ensureSymlinks(binDir: string): void {
  const pkgRoot = dirname(dirname(binDir)); // native/bin -> package root
  const manifestPath = join(pkgRoot, "native", "pg-symlinks.json");
  if (!existsSync(manifestPath)) return;

  const entries: Array<{ source: string; target: string }> = JSON.parse(
    readFileSync(manifestPath, "utf-8"),
  );
  for (const { source, target } of entries) {
    const linkPath = join(pkgRoot, target);
    try {
      lstatSync(linkPath);
      continue; // already exists
    // eslint-disable-next-line promise-safety/no-bare-catch
    } catch {}
    try {
      symlinkSync(basename(source), linkPath);
    } catch (err: any) {
      if (err.code !== "EEXIST") throw err;
    }
  }
}

// ─── socket probe ───────────────────────────────────────────

function pingSocket(timeoutMs: number): Promise<boolean> {
  const socketPath = join(PG_SOCKET_DIR, `.s.PGSQL.${PG_PORT}`);
  return new Promise((resolve) => {
    const sock = connect(socketPath);
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeoutMs);
    sock.on("connect", () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

// ─── data dir checks ────────────────────────────────────────

function dataDirValid(): boolean {
  return existsSync(join(PG_DATA_DIR, "PG_VERSION"));
}

function dataDirPartial(): boolean {
  return existsSync(PG_DATA_DIR) && !dataDirValid();
}

// ─── main lifecycle ─────────────────────────────────────────

async function main(): Promise<void> {
  const binDir = resolveBinDir();
  ensureSymlinks(binDir);

  // Reattach: if PG is already running, nothing to do.
  if (existsSync(PG_PID_FILE) && (await pingSocket(1500))) {
    console.log("pg: embedded PG already running; reattaching");
    return;
  }

  // Partial data dir (interrupted initdb) — nuke and redo.
  if (dataDirPartial()) {
    console.log("pg: data dir partial (no PG_VERSION); cleaning and re-initdb");
    rmSync(PG_DATA_DIR, { recursive: true, force: true });
  }

  const fresh = !dataDirValid();
  if (fresh) {
    mkdirSync(PG_DIR, { recursive: true });
    mkdirSync(PG_SOCKET_DIR, { recursive: true, mode: 0o700 });
    console.log(`pg: running initdb (dataDir=${PG_DATA_DIR})`);
    const result = spawnSync(
      join(binDir, "initdb"),
      ["-D", PG_DATA_DIR, "-U", PG_USER, "-A", "trust", "--no-locale", "--encoding", "UTF8"],
      { stdio: "pipe" },
    );
    if (result.status !== 0) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; SpawnSyncReturns fields may be null
      const out = result.stderr?.toString() || result.stdout?.toString() || "";
      throw new Error(`initdb failed: ${out}`);
    }
  } else if (existsSync(PG_PID_FILE)) {
    // Stale pidfile from a crashed prior run; pg_ctl refuses to start with it.
    console.log("pg: removing stale postmaster.pid");
    rmSync(PG_PID_FILE, { force: true });
  }

  // pg_ctl start -w: forks PG, waits for readiness, then exits.
  // -o flags: app traffic stays on the Unix socket; a loopback-only TCP
  // listener (listen_addresses=127.0.0.1) + wal_level=logical make the cluster
  // consumable by logical-replication clients (e.g. Zero's zero-cache), which
  // cannot traverse PgBouncer nor replicate over a Unix socket. Both GUCs are
  // postmaster-start-only, so they take effect only on a full cluster restart.
  // PGHOST/PGPORT/PGUSER in env so pg_ctl's -w probe finds the socket.
  console.log(`pg: starting (socket=${PG_SOCKET_DIR}, port=${PG_PORT})`);
  const result = spawnSync(
    join(binDir, "pg_ctl"),
    [
      "start",
      "-D", PG_DATA_DIR,
      "-l", PG_LOG_FILE,
      "-o", `-k ${PG_SOCKET_DIR} -p ${PG_PORT} -c max_connections=${MAX_CONNECTIONS} -c listen_addresses=127.0.0.1 -c wal_level=logical`,
      "-w",
      "-t", String(READY_TIMEOUT_SEC),
    ],
    {
      stdio: "pipe",
      env: {
        ...process.env,
        PGHOST: PG_SOCKET_DIR,
        PGPORT: String(PG_PORT),
        PGUSER: PG_USER,
      },
    },
  );
  if (result.status !== 0) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard; SpawnSyncReturns fields may be null
    const out = result.stderr?.toString() || result.stdout?.toString() || "";
    throw new Error(`pg_ctl start failed: ${out} (see ${PG_LOG_FILE})`);
  }

  console.log("pg: embedded PG ready");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
