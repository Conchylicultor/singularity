import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { dryRunPendingMigrations } from "@plugins/database/plugins/migrations/server";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";
import orphanedTablesCheck from "./orphaned-tables";
import imperativeCreateTableAllowlistedCheck from "./imperative-create-table-allowlisted";
import schemaFilesLoadableCheck from "./internal/schema-files-loadable";
import forkSchemaDriftCheck from "./fork-schema-drift";
import drizzleConfigSchemaGlobsCheck from "./drizzle-config-schema-globs";
import dataMigrationResetStableCheck from "./data-migration-reset-stable";
import { withDirectDb } from "./internal/direct-db";

// Wedge-breaker for a metadata-only git read: far above any real duration,
// because starvation under a saturated check run is what these suffer, not
// slowness. Same reasoning as `infra/worktree`'s bounds, which carry the
// measurements.
const GIT_TIMEOUT_MS = 60_000;

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
  const result = await spawnCaptured(["git", ...args], {
    cwd: root,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  return { code: result.exitCode, out: result.stdout };
}

// Could not reach main's DB, so the pending migrations were never tried:
// fail loudly rather than pass unverified.
function cannotVerify(cause: string): CheckResult {
  return {
    ok: false,
    message: `cannot verify migration: main DB ("${MAIN_DB_NAME}") not reachable: ${cause}`,
    hint: "The main Postgres cluster must be up to dry-run pending migrations. Start it and re-run the check.",
  };
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
      // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- a signature is a pure best-effort optimization; any failure (missing dir, git error) safely degrades to "never cache" (return null), which only re-runs the cheap fast-path check
    } catch {
      return null;
    }
  },
  async run() {
    const root = await getWorktreeRoot();

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
    // main's live DB inside a transaction that always rolls back, over a direct
    // (non-pgbouncer) connection so the multi-statement dry-run transaction
    // stays on one backend. withDirectDb separates a connectivity failure
    // (cannot verify → fail loudly) from a real apply failure (the migration is
    // broken), which is reported from inside the callback.
    const result = await withDirectDb(
      MAIN_DB_NAME,
      async (pool): Promise<CheckResult> => {
        try {
          await dryRunPendingMigrations(drizzle(pool));
          return { ok: true };
        } catch (e) {
          return {
            ok: false,
            message: (e as Error).message,
            hint: "This migration would fail to apply and crash main's boot. Fix the SQL in plugins/database/plugins/migrations/data/.",
          };
        }
      },
    );
    switch (result.kind) {
      case "ok":
        return result.value;
      case "unreachable":
        return cannotVerify(result.cause);
      case "no-database":
        // A missing main DB is no more verifiable than an unreachable cluster.
        return cannotVerify(`database "${MAIN_DB_NAME}" does not exist`);
    }
  },
};

export default [
  check,
  orphanedTablesCheck,
  imperativeCreateTableAllowlistedCheck,
  schemaFilesLoadableCheck,
  forkSchemaDriftCheck,
  drizzleConfigSchemaGlobsCheck,
  dataMigrationResetStableCheck,
];
