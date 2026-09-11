import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";
import { MIGRATIONS_TABLE_NAME } from "@plugins/database/plugins/derived-views/core";
import {
  classifyMigrationSql,
  type DestructiveClassification,
} from "@plugins/database/plugins/migrations/core";
import { queryRows } from "@plugins/database/plugins/sql-rows/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";
import { z } from "zod";
import { withDirectDb } from "./internal/direct-db";

// Inlined minimal Check shape (mirrors the sibling checks in this folder, e.g.
// migration-applies-clean) to avoid a cross-plugin import of the framework Check
// type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

const MIGRATIONS_SUBDIR = "plugins/database/plugins/migrations/data";

// Filename → sha8 regex, inlined from the runner (server/internal/runner.ts) so
// this check never imports a server-plugin internal.
const MIGRATION_RE = /^(\d{8})_(\d{6})_([0-9a-f]{8})__(.+)\.sql$/;

// Every migration filename under `dir` (matching MIGRATION_RE).
function migrationFileSet(dir: string): Set<string> {
  const files = new Set<string>();
  for (const f of readdirSync(dir)) {
    if (MIGRATION_RE.test(f)) files.add(f);
  }
  return files;
}

// One migration per entry, each followed by its destructive statements.
function formatDetails(
  migrations: readonly { file: string; cls: DestructiveClassification }[],
): string {
  return migrations
    .map(
      (c) =>
        `  - ${c.file}\n${c.cls.statements.map((s) => `      ${s.text}`).join("\n")}`,
    )
    .join("\n");
}

const check: Check = {
  id: "fork-schema-drift",
  description:
    "worktree DB carries no destructive migration absent from this branch",
  // Impure: opens a live DB connection and reads origin/main via git. The
  // signature folds the data/ dir content + origin/main commit so an unchanged
  // input still caches; the empty-drift common case is already cheap.
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
    const mainRoot = await ensureMainWorktreeRoot();
    const branchDataDir = resolve(root, MIGRATIONS_SUBDIR);
    const mainDataDir = join(mainRoot, MIGRATIONS_SUBDIR);

    // FAST PATH (no DB connection). The only drift this check blocks is a
    // migration that exists on main but is ABSENT from this branch — one the
    // forked DB may carry while this branch's code knows nothing about it. A
    // feature branch normally only ADDS migrations, so its set is a superset of
    // main's and there is nothing to check. This purely-filesystem comparison
    // keeps the ~99% case free and off the DB entirely (mirroring
    // migration-applies-clean's own connection-free fast path); we open a
    // connection only when main truly has a migration this branch lacks.
    const branchFiles = migrationFileSet(branchDataDir);
    const missingOnBranch = [...migrationFileSet(mainDataDir)].filter(
      (f) => !branchFiles.has(f),
    );
    if (missingOnBranch.length === 0) return { ok: true };

    // Keep only the DESTRUCTIVE ones — a code-breaking, rebase-fixable drift.
    // Still pure (classify main's on-disk files); no DB yet.
    const candidates = missingOnBranch
      .map((file) => ({
        file,
        cls: classifyMigrationSql(
          readFileSync(join(mainDataDir, file), "utf8"),
        ),
      }))
      .filter((c) => c.cls.destructive);
    if (candidates.length === 0) return { ok: true };

    // A destructive migration on main is absent from this branch. Confirm the
    // worktree DB ACTUALLY applied it (a DB forked BEFORE the migration landed
    // never applied it → no real drift) by reading the ledger. Only now do we
    // open a direct (non-pgbouncer) connection to this worktree's own DB.
    const worktreeDb = basename(root);
    const ledger = await withDirectDb(worktreeDb, async (pool) => {
      try {
        const rows = await queryRows(pool, {
          sql: `SELECT hash FROM ${MIGRATIONS_TABLE_NAME}`,
          row: z.object({ hash: z.string() }),
        });
        return new Set(rows.map((r) => r.hash));
      } catch (e) {
        // No ledger table (42P01): the migration runner never ran on this DB,
        // so nothing was applied → no drift. Any other error propagates loudly.
        if ((e as { code?: string }).code === "42P01") return new Set<string>();
        throw e;
      }
    });

    // No database (3D000): an unforked worktree applied nothing → no drift.
    if (ledger.kind === "no-database") return { ok: true };

    // Could not connect. Stay FATAL rather than pass: letting the build go on
    // would restart the server on a DB that may be missing schema the code
    // still uses. Lead with what is known without the DB — the destructive
    // migrations main has and this branch lacks — because rebasing settles the
    // check whether or not the DB ever answers.
    if (ledger.kind === "unreachable") {
      return {
        ok: false,
        message:
          `Could not read this worktree's migration ledger (DB "${worktreeDb}"): ${ledger.cause}.\n` +
          `main has ${candidates.length} destructive migration(s) this branch lacks — ` +
          `if this DB applied them, your code may use schema they drop:\n` +
          formatDetails(candidates),
        hint:
          "Rebase onto main — that settles this check with or without the DB: " +
          "git fetch origin main && git rebase origin/main",
      };
    }

    const appliedHashes = ledger.value;
    const confirmed = candidates.filter((c) => {
      const sha8 = MIGRATION_RE.exec(c.file)?.[3];
      return sha8 !== undefined && appliedHashes.has(sha8);
    });
    if (confirmed.length === 0) return { ok: true };

    return {
      ok: false,
      message:
        `This worktree's DB ("${worktreeDb}") applied ${confirmed.length} ` +
        `destructive migration(s) absent from this branch:\n${formatDetails(confirmed)}`,
      hint:
        "This worktree's DB has migrations your branch lacks that DROP/RENAME " +
        "schema your code may still use. Rebase onto main to pull them in: " +
        "git fetch origin main && git rebase origin/main",
    };
  },
};

export default check;
