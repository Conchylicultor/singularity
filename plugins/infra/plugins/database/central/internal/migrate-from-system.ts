import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { Client } from "pg";
import {
  PG_MIGRATING_SENTINEL,
  PG_MIGRATION_DONE_MARKER,
  PG_PORT,
  PG_SOCKET_DIR,
  PG_USER,
} from "./paths";

const SYSTEM_HOST = "localhost";
const SYSTEM_PORT = 5432;
const SYSTEM_USER = process.env.USER ?? "postgres";

/** Open a brief client to the system PG. Returns null if connect fails. */
async function tryConnectSystem(database: string): Promise<Client | null> {
  const c = new Client({
    host: SYSTEM_HOST,
    port: SYSTEM_PORT,
    user: SYSTEM_USER,
    database,
    connectionTimeoutMillis: 1500,
  });
  try {
    await c.connect();
    return c;
  } catch {
    return null;
  }
}

/**
 * Migrate `singularity` plus every per-worktree `att-*` / `claude-*` DB.
 * Bulk migration preserves state in active worktrees; users always know
 * what came across and don't get surprised by missing forks. Tradeoff:
 * first start can run for several minutes on a heavy install. Migration
 * is fire-and-forget from `onReady` so the central HTTP socket binds
 * within the gateway's readiness window.
 */
async function migratableSystemDatabases(): Promise<string[]> {
  const c = await tryConnectSystem("postgres");
  if (!c) return [];
  try {
    const r = await c.query(
      `SELECT datname FROM pg_database
        WHERE datname = 'singularity' OR datname LIKE 'att-%' OR datname LIKE 'claude-%'
        ORDER BY datname`,
    );
    return r.rows.map((row) => row.datname as string);
  } finally {
    await c.end();
  }
}

async function pipe(
  left: string[],
  right: string[],
): Promise<{ ok: boolean; stderr: string }> {
  const dump = Bun.spawn(left, { stdout: "pipe", stderr: "pipe" });
  const restore = Bun.spawn(right, {
    stdin: dump.stdout,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [dumpStderr, restoreStderr] = await Promise.all([
    new Response(dump.stderr).text(),
    new Response(restore.stderr).text(),
  ]);
  const [dumpCode, restoreCode] = await Promise.all([dump.exited, restore.exited]);
  return {
    ok: dumpCode === 0 && restoreCode === 0,
    stderr: [dumpStderr, restoreStderr].filter(Boolean).join("\n"),
  };
}

/**
 * Migrate any pre-existing system PG `singularity` + `att-*` + `claude-*`
 * databases into the freshly-initdb'd embedded cluster. Idempotent in the
 * sense that this should be called exactly once per fresh `data-pg18/` —
 * the caller guards on `dataDirExists()`. The embedded cluster MUST already
 * be running before this runs.
 *
 * `pg_dump` / `pg_restore` / `pg_dumpall` are not bundled by
 * `embedded-postgres`; we rely on PATH-resolved client tools from the
 * user's existing system PG install. That's safe here precisely because
 * we only run when a system PG is reachable.
 */
export interface MigrationProgress {
  total: number;
  done: number;
  current: string | null;
}

export async function migrateFromSystemPg(
  progress: MigrationProgress,
): Promise<"migrated" | "no-system-pg"> {
  const dbs = await migratableSystemDatabases();
  if (dbs.length === 0) return "no-system-pg";

  writeFileSync(PG_MIGRATING_SENTINEL, new Date().toISOString());

  progress.total = dbs.length;
  console.log(
    `[database] migrating ${dbs.length} database(s) from system PG`,
  );

  // 1. Globals (roles, settings). --no-role-passwords because trust auth.
  const globals = await pipe(
    ["pg_dumpall", "-h", SYSTEM_HOST, "-p", String(SYSTEM_PORT), "--globals-only", "--no-role-passwords"],
    ["psql", "-h", PG_SOCKET_DIR, "-p", String(PG_PORT), "-U", PG_USER, "-d", "postgres"],
  );
  // psql warns on duplicate role 'singularity'; not fatal.
  if (!globals.ok && !/already exists/i.test(globals.stderr)) {
    throw new Error(`migrate globals failed: ${globals.stderr}`);
  }

  // 2. Each DB. --no-owner so restored objects pick up the embedded
  // cluster's role (`singularity`) instead of inheriting the source role
  // (commonly `admin`/`postgres` from system PG default install).
  for (let i = 0; i < dbs.length; i++) {
    const db = dbs[i]!;
    progress.current = db;
    console.log(`[database] migrating ${db} (${i + 1}/${dbs.length})`);
    const result = await pipe(
      ["pg_dump", "-Fc", "--no-owner", "-h", SYSTEM_HOST, "-p", String(SYSTEM_PORT), db],
      [
        "pg_restore",
        "--no-owner",
        "-h",
        PG_SOCKET_DIR,
        "-p",
        String(PG_PORT),
        "-U",
        PG_USER,
        "-C",
        "-d",
        "postgres",
      ],
    );
    if (!result.ok) {
      throw new Error(`migrate database ${db} failed: ${result.stderr}`);
    }
    progress.done = i + 1;
  }
  progress.current = null;

  unlinkSync(PG_MIGRATING_SENTINEL);
  writeFileSync(PG_MIGRATION_DONE_MARKER, new Date().toISOString());
  console.log("[database] system PG migration complete");
  return "migrated";
}

export function priorMigrationInProgress(): boolean {
  return existsSync(PG_MIGRATING_SENTINEL);
}
