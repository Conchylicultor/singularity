import { createHash } from "crypto";
import { existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  getWorktreeRoot,
  spawnCaptured,
} from "@plugins/infra/plugins/spawn/core";

// Wedge-breaker for a metadata-only git read: far above any real duration,
// because starvation under a saturated check run is what these suffer, not
// slowness. Same reasoning as `infra/worktree`'s bounds, which carry the
// measurements.
const GIT_TIMEOUT_MS = 60_000;

// Inlined minimal Check shape (mirrors the sibling migration-applies-clean and
// orphaned-tables checks) to avoid a cross-plugin import of the framework Check
// type from a check file.
type CheckResult =
  | { ok: true }
  | { ok: false; message: string; hint?: string; inconclusive?: true };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// The migration SQL dir and the drizzle snapshot meta dir, relative to THIS check
// file (.../migrations/check/ → .../migrations/data{,/meta}).
const DATA_DIR = join(import.meta.dir, "..", "data");
const META_DIR = join(DATA_DIR, "meta");

// Repo-relative, for the git pathspec.
const MIGRATIONS_SUBDIR = "plugins/database/plugins/migrations/data";

// Filename → sha8 regex, inlined from the runner (server/internal/runner.ts) so
// this check never imports a server-plugin internal — mirroring the sibling
// fork-schema-drift and orphaned-tables checks, which inline it for the reason.
const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;

/** One branch-local migration, classified. `name` is the `.sql` basename. */
export interface BranchLocalMigration {
  name: string;
  /** True when a sibling `meta/<tag>_snapshot.json` exists. */
  isSchema: boolean;
}

/** A data migration that a push-time reset would strand after its dependencies. */
export interface ResetUnstablePair {
  dataMigration: string;
  afterSchemaMigration: string;
}

/**
 * PURE core (exported for unit testing): find the branch-local data migrations
 * whose position is NOT preserved across a push-time migration reset.
 *
 * `resetBranchLocalMigrations` (cli/plugins/migrations/cli/migrations.ts) deletes every branch-local
 * SCHEMA migration and re-emits one consolidated migration stamped at push time,
 * while DATA migrations are explicitly preserved at their original timestamps.
 * The runner applies in filename-timestamp order, so after a reset every
 * branch-local schema migration sorts AFTER every branch-local data migration —
 * whatever the order on disk right now.
 *
 * Therefore the only branch-local orderings a reset preserves are those where
 * every data migration already precedes every schema migration. A data migration
 * sitting after one is reordered by the reset, and if it reads schema that
 * migration creates it fails to apply — but only on the pushes where main moved
 * concurrently and the reset actually fired, which is what makes it read as flaky
 * rather than as an ordering error.
 *
 * Filenames sort lexicographically in timestamp order (the `YYYYMMDD_HHMMSS_`
 * prefix), which is the same order the runner applies them in.
 */
export function findResetUnstablePairs(
  branchLocal: BranchLocalMigration[],
): ResetUnstablePair[] {
  const sorted = [...branchLocal].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  // The earliest branch-local schema migration is the tightest evidence: it is
  // the one whose restamping moves the furthest past the offending backfill.
  const firstSchema = sorted.find((m) => m.isSchema);
  if (!firstSchema) return [];
  return sorted
    .filter((m) => !m.isSchema && m.name > firstSchema.name)
    .map((m) => ({
      dataMigration: m.name,
      afterSchemaMigration: firstSchema.name,
    }));
}

/**
 * Read `dataDir` and return the branch-local migrations, classified. Takes its
 * directories as parameters (rather than closing over the module constants) so
 * the snapshot-presence + tracked-filter rules are testable against a fixture —
 * `data/` itself must never be written to by a test.
 */
export function classifyBranchLocal(
  dataDir: string,
  metaDir: string,
  tracked: Set<string>,
): BranchLocalMigration[] {
  return readdirSync(dataDir)
    .filter((f) => MIGRATION_RE.test(f) && !tracked.has(f))
    .map((name) => ({
      name,
      isSchema: existsSync(join(metaDir, `${name.slice(0, -4)}_snapshot.json`)),
    }));
}

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

/**
 * Migration basenames present on origin/main (or local main). Returns null when
 * neither ref resolves — the branch-local set is then unknowable, and defaulting
 * to "everything is branch-local" would flag the entire history. The caller
 * reports that as inconclusive rather than guessing.
 */
async function trackedBasenames(root: string): Promise<Set<string> | null> {
  for (const ref of ["origin/main", "main"]) {
    if ((await git(root, ["rev-parse", "--verify", ref])).code !== 0) continue;
    const { out } = await git(root, [
      "ls-tree",
      "-r",
      "--name-only",
      ref,
      "--",
      MIGRATIONS_SUBDIR,
    ]);
    return new Set(
      out
        .split("\n")
        .filter(Boolean)
        .map((p) => p.split("/").pop()!),
    );
  }
  return null;
}

const check: Check = {
  id: "data-migration-reset-stable",
  description:
    "branch-local data migrations are ordered before every branch-local schema migration",
  // Impure: reads origin/main via git. The verdict depends only on which files
  // exist (never their content) plus the main ref, so fold exactly those in —
  // same shape as the sibling migration-applies-clean signature.
  cacheSignature() {
    try {
      const hash = createHash("sha256");
      for (const f of readdirSync(DATA_DIR).sort()) {
        if (!f.endsWith(".sql")) continue;
        hash.update(f);
        hash.update("\0");
      }
      for (const f of readdirSync(META_DIR).sort()) {
        if (!f.endsWith("_snapshot.json")) continue;
        hash.update(f);
        hash.update("\0");
      }
      const proc = Bun.spawnSync(["git", "rev-parse", "origin/main"], {
        cwd: process.cwd(),
        stdout: "pipe",
        stderr: "pipe",
      });
      const mainRef = proc.success ? proc.stdout.toString().trim() : "no-main";
      return `${hash.digest("hex")}:${mainRef}`;
      // eslint-disable-next-line promise-safety/no-bare-catch, promise-safety/no-absorbed-failure -- a signature is a pure best-effort optimization; any failure (missing dir, git error) safely degrades to "never cache" (return null), which only re-runs the cheap check
    } catch {
      return null;
    }
  },
  async run() {
    const root = await getWorktreeRoot();
    const tracked = await trackedBasenames(root);
    if (!tracked) {
      return {
        ok: false,
        inconclusive: true,
        message:
          "neither `origin/main` nor `main` resolves, so the branch-local migration set is unknowable",
        hint: "Run `git fetch origin main` and re-run the check.",
      };
    }

    const pairs = findResetUnstablePairs(
      classifyBranchLocal(DATA_DIR, META_DIR, tracked),
    );
    if (pairs.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        "data migration(s) ordered after a branch-local schema migration — push will not preserve this order:\n" +
        pairs
          .map(
            (p) =>
              `  ${p.dataMigration}\n    currently runs after ${p.afterSchemaMigration}`,
          )
          .join("\n"),
      hint:
        "`push` regenerates branch-local SCHEMA migrations into one stamped at push time while\n" +
        "leaving DATA migrations at theirs, so the schema migration above will be reordered to\n" +
        "run AFTER the backfill. Two cases:\n\n" +
        "  1. The backfill does NOT depend on this branch's schema change — restamp the schema\n" +
        "     migration after it (exactly what push would do anyway):\n" +
        "       ./singularity build --reset-migration --migration-name <slug>\n\n" +
        "  2. The backfill DOES depend on it — a data migration may only depend on schema that is\n" +
        "     already on main. Split into two pushes: expand (add the new shape) first, then\n" +
        "     migrate + contract (backfill, then drop the old shape) once the first has landed.\n\n" +
        "See plugins/database/plugins/migrations/CLAUDE.md → 'Ordering a backfill against a schema change'.",
    };
  },
};

export default check;
