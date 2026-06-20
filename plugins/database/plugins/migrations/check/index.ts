import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
// Connect via the database CORE barrel, not admin/server: the admin pool module
// throws at import time if SINGULARITY_WORKTREE is unset, which is the norm in a
// tooling/check subprocess. The core barrel exposes exactly the config→connstring
// helpers for non-backend consumers and is import-safe by design.
import { buildConnectionString, readDatabaseConfig } from "@plugins/database/core";
import { dryRunPendingMigrations } from "@plugins/database/plugins/migrations/server";
import orphanedTablesCheck from "./orphaned-tables";

// Inlined minimal Check shape (mirrors the other plugin-contributed checks, e.g.
// data-migration-dml-only / migration-hashes-unique) to avoid a cross-plugin
// import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// The main DB. Worktree backends reach it directly via openShortLivedClient,
// e.g. the query MCP tool and the push-profiling title resolver — there is no
// exported constant, the name is the literal "singularity".
const MAIN_DB_NAME = "singularity";

const MIGRATIONS_SUBDIR = "plugins/database/plugins/migrations/data";

async function git(
  root: string,
  args: string[],
): Promise<{ code: number; out: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  return { code: await proc.exited, out };
}

async function getRoot(): Promise<string> {
  return (await git(process.cwd(), ["rev-parse", "--show-toplevel"])).out.trim();
}

const check: Check = {
  id: "migration-applies-clean",
  description:
    "pending migrations apply cleanly on top of main (transactional dry-run, rolled back)",
  // Impure: opens a live DB connection and reads origin/main via git. The
  // signature folds the data/ dir content + origin/main commit so an unchanged
  // input still caches; the fast path already makes the no-migration case cheap.
  cacheSignature() {
    try {
      const root = process.cwd();
      const dir = resolve(root, MIGRATIONS_SUBDIR);
      const hash = createHash("sha256");
      for (const f of readdirSync(dir).sort()) {
        if (!f.endsWith(".sql")) continue;
        hash.update(f);
        hash.update("\0");
        hash.update(readFileSync(join(dir, f)));
        hash.update("\0");
      }
      const proc = Bun.spawnSync(["git", "rev-parse", "origin/main"], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const mainRef = proc.success ? proc.stdout.toString().trim() : "no-main";
      return `${hash.digest("hex")}:${mainRef}`;
      // eslint-disable-next-line promise-safety/no-bare-catch -- a signature is a pure best-effort optimization; any failure (missing dir, git error) safely degrades to "never cache" (return null), which only re-runs the cheap fast-path check
    } catch {
      return null;
    }
  },
  async run() {
    const root = await getRoot();

    // FAST PATH: if this branch changes no migration file vs origin/main there
    // is nothing to apply — pass without ever touching the DB. This is the ~99%
    // case (most pushes touch no migration), so it must be free.
    const diff = await git(root, [
      "diff",
      "--quiet",
      "origin/main",
      "--",
      MIGRATIONS_SUBDIR,
    ]);
    if (diff.code === 0) return { ok: true };

    // SLOW PATH: a migration differs from main → replay the pending delta against
    // main's live DB inside a transaction that always rolls back. Build a direct
    // (non-pgbouncer) connection from the core config helpers so the multi-
    // statement dry-run transaction stays on one backend.
    const cfg = readDatabaseConfig();
    const pool = new Pool({
      connectionString: buildConnectionString(cfg.connection, MAIN_DB_NAME),
      max: 1,
      idleTimeoutMillis: 1_000,
    });
    try {
      // Separate connectivity failure (cannot verify → fail loudly) from a real
      // apply failure (the migration is broken). Probe the connection first.
      try {
        const client = await pool.connect();
        client.release();
      } catch (e) {
        return {
          ok: false,
          message: `cannot verify migration: main DB ("${MAIN_DB_NAME}") not reachable: ${(e as Error).message}`,
          hint: "The main Postgres cluster must be up to dry-run pending migrations. Start it and re-run the check.",
        };
      }
      await dryRunPendingMigrations(drizzle(pool));
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        message: (e as Error).message,
        hint: "This migration would fail to apply and crash main's boot. Fix the SQL in plugins/database/plugins/migrations/data/.",
      };
    } finally {
      await pool.end();
    }
  },
};

export default [check, orphanedTablesCheck];
