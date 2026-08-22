import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { DATABASE_CONFIG_PATH } from "@plugins/database/core";

// The worktree name is ONLY needed for the worktree (non-admin) connection
// string. `getAdminPool()` talks exclusively to the `postgres` system DB, so it
// must import and run with no `SINGULARITY_WORKTREE` set (the self-contained
// launcher creates the app DB before any namespace exists). The throw is
// therefore deferred to first use of the worktree path via `requireWorktree()`,
// not run at module load — but it is still loud and never silently defaulted.
function requireWorktree(): string {
  const worktree = process.env.SINGULARITY_WORKTREE;
  if (!worktree) {
    throw new Error("SINGULARITY_WORKTREE env var is required");
  }
  return worktree;
}

interface ConnConfig {
  host: string;
  port: number;
  user: string;
}

function readConn(): ConnConfig {
  const configPath = DATABASE_CONFIG_PATH;
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      host: process.env.PGHOST ?? raw.connection?.host ?? "localhost",
      port: Number(process.env.PGPORT ?? raw.connection?.port ?? 5432),
      user:
        process.env.PGUSER ??
        raw.connection?.user ??
        process.env.USER ??
        "postgres",
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT" && !(err instanceof SyntaxError)) throw err;
    return {
      host: process.env.PGHOST ?? "localhost",
      port: Number(process.env.PGPORT ?? 5432),
      user: process.env.PGUSER ?? process.env.USER ?? "postgres",
    };
  }
}

function buildConnString(conn: ConnConfig, database: string): string {
  if (conn.host.startsWith("/")) {
    return `postgres://${conn.user}@/${database}?host=${encodeURIComponent(conn.host)}&port=${conn.port}`;
  }
  return `postgres://${conn.user}@${conn.host}:${conn.port}/${database}`;
}

// Connection config is read lazily (on first use), not at module load. A pool
// must bind its config when it first connects, not when it is imported: the
// self-contained launcher writes database.json *during* boot, after this module
// is already imported, so an eager read would freeze to the no-config fallback
// and connect to the wrong Postgres. In a normal backend the gateway writes
// database.json before spawning us, so first use is always after the file
// exists — identical behavior, just deferred.
let cachedConn: ConnConfig | null = null;
function getConn(): ConnConfig {
  if (!cachedConn) cachedConn = readConn();
  return cachedConn;
}

// Worktree connection string for graphile-worker (the jobs worker, which only
// runs inside a real worktree backend where SINGULARITY_WORKTREE is always set).
// It is the one export that genuinely needs the worktree name, so it is a lazy
// function — never evaluated at module load. Admin-only importers (such as the
// self-contained launcher, which never starts the jobs worker) leave it uncalled,
// so the module stays import-safe and `getAdminPool()` is reachable with no
// SINGULARITY_WORKTREE; calling it without the env var fails loud via
// `requireWorktree()` rather than returning a silent undefined.
export function connectionString(): string {
  return buildConnString(getConn(), requireWorktree());
}

let adminPool: Pool | null = null;

export function getAdminPool(): Pool {
  if (!adminPool) {
    adminPool = new Pool({
      connectionString: buildConnString(getConn(), "postgres"),
      max: 1,
      idleTimeoutMillis: 20_000,
    });
  }
  return adminPool;
}

/**
 * Release the admin pool's idle client, if one was ever opened.
 *
 * A NO-OP when nothing called `getAdminPool()` — which is the whole reason this
 * exists rather than callers writing `getAdminPool().end()`. That spelling
 * CREATES the pool in order to close it, so a process that never touched the
 * admin database would open a connection to `postgres` on its way out (and,
 * on a host with no database config, throw while doing it).
 *
 * The caller is a long-lived process ending: `./singularity build` calls it from
 * its terminal funnel so the CLI exits immediately instead of waiting out the
 * pool's 20s idle timeout.
 */
export async function closeAdminPool(): Promise<void> {
  if (adminPool === null) return;
  const pool = adminPool;
  adminPool = null;
  await pool.end();
}

export function openShortLivedClient(dbName: string): Pool {
  const pool = new Pool({
    connectionString: buildConnString(getConn(), dbName),
    max: 1,
    idleTimeoutMillis: 1_000,
  });
  // A pg.Pool emits `error` when an IDLE client's connection breaks — the
  // socket dropping between one query and `end()`, or during teardown. That is
  // a connection-lifecycle event, not an operation failure: whatever the caller
  // actually asked for still rejects at its own `query()`, loudly. Left
  // unhandled, though, node turns it into an uncaught exception and kills the
  // BACKEND — a 1-second-idle pool inside a long-lived server is exactly the
  // shape that trips it.
  //
  // Handled here rather than at each call site because every caller of a
  // short-lived pool has the same exposure and none of them wants a different
  // answer (`fork-schema-drift.ts` learned this the hard way and installs the
  // same handler on its own disposable pool). Silencing nothing: no verdict, no
  // row and no failure of any awaited call passes through this path.
  pool.on("error", () => {
    /* idle-client connection loss on a disposable pool; see above */
  });
  return pool;
}

export function libpqSubprocessEnv(): Record<string, string> {
  const conn = getConn();
  return {
    PGHOST: conn.host,
    PGPORT: String(conn.port),
    PGUSER: conn.user,
  };
}
