import { drizzle } from "drizzle-orm/node-postgres";
import {
  MIGRATIONS_DATA_DIR,
  publishedMigrationRefs,
} from "@plugins/database/plugins/migrations/core";
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
import migrationPhasesValidCheck from "./migration-phases-valid";
import publishedMigrationsImmutableCheck from "./published-immutable";
import { withDirectDb } from "./internal/direct-db";
import { declaredSchemaInputs } from "./internal/declared-schema-inputs";

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
  cacheSignature?(): string | null | Promise<string | null>;
};

// The main DB. Worktree backends reach it directly via openShortLivedClient,
// e.g. the query MCP tool and the push-profiling title resolver — there is no
// exported constant, the name is the literal "singularity".
const MAIN_DB_NAME = "singularity";

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
  // Impure: reads local `main` via git. The data/ dir CONTENT is already
  // covered by the runner's own tree hash (this check is scope "tree", the
  // default) — only local main's sha needs folding in, since the ref can move
  // without changing anything in this tree.
  async cacheSignature(): Promise<string | null> {
    const [main] = await publishedMigrationRefs(await getWorktreeRoot());
    return main.sha;
  },
  async run() {
    const root = await getWorktreeRoot();

    // FAST PATH: if this branch changes no migration file vs local `main` there
    // is nothing to apply — pass without ever touching the DB. This is the ~99%
    // case (most pushes touch no migration), so it must be free. Local `main`,
    // not a remote's: it is the ref the main DB runs (main auto-builds from
    // it), so it is exactly what the dry-run below would find applied.
    const [main] = await publishedMigrationRefs(root);
    const diff = await git(root, [
      "diff",
      "--quiet",
      main.sha,
      "--",
      MIGRATIONS_DATA_DIR,
    ]);
    if (diff.code === 0) return { ok: true };

    // SLOW PATH, first the derived layer main's next boot installs after the
    // migrations (views, rollup tables, derived-updatedAt triggers). Read from
    // the server barrels because this process never boots, so no contribution
    // is collected (`getContributions()` throws).
    const declared = await declaredSchemaInputs(root);
    if (!declared.ok) return { ok: false, message: declared.message };

    // Then a migration differs from main → replay the pending delta against
    // main's live DB inside a transaction that always rolls back, over a direct
    // (non-pgbouncer) connection so the multi-statement dry-run transaction
    // stays on one backend. withDirectDb separates a connectivity failure
    // (cannot verify → fail loudly) from a real apply failure (the migration is
    // broken), which is reported from inside the callback.
    const result = await withDirectDb(
      MAIN_DB_NAME,
      async (pool): Promise<CheckResult> => {
        try {
          await dryRunPendingMigrations(drizzle(pool), declared.inputs);
          return { ok: true };
        } catch (e) {
          return {
            ok: false,
            message: (e as Error).message,
            hint: "This migration (or the derived layer after it: updatedAt triggers, rollup tables, views) would fail and crash main's boot. Fix the SQL in plugins/database/plugins/migrations/data/, or the derived object in its owning plugin.",
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
  migrationPhasesValidCheck,
  publishedMigrationsImmutableCheck,
];
