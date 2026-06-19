import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { SINGULARITY_DIR } from "@plugins/infra/plugins/paths/server";

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
  const configPath = join(SINGULARITY_DIR, "database.json");
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf-8"));
    return {
      host: process.env.PGHOST ?? raw.connection?.host ?? "localhost",
      port: Number(process.env.PGPORT ?? raw.connection?.port ?? 5432),
      user: process.env.PGUSER ?? raw.connection?.user ?? process.env.USER ?? "postgres",
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

export function openShortLivedClient(dbName: string): Pool {
  return new Pool({
    connectionString: buildConnString(getConn(), dbName),
    max: 1,
    idleTimeoutMillis: 1_000,
  });
}

export function libpqSubprocessEnv(): Record<string, string> {
  const conn = getConn();
  return {
    PGHOST: conn.host,
    PGPORT: String(conn.port),
    PGUSER: conn.user,
  };
}
