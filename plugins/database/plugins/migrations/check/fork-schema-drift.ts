import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { basename, join, resolve } from "path";
import { Pool } from "pg";
// Connect via the database CORE barrel, not admin/server: the admin pool module
// throws at import time if SINGULARITY_WORKTREE is unset, which is the norm in a
// tooling/check subprocess. The core barrel exposes exactly the config→connstring
// helpers for non-backend consumers and is import-safe by design.
import { buildConnectionString, readDatabaseConfig } from "@plugins/database/core";
import { MIGRATIONS_TABLE_NAME } from "@plugins/database/plugins/derived-views/core";
import { classifyMigrationSql } from "@plugins/database/plugins/migrations/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { ensureMainWorktreeRoot } from "@plugins/infra/plugins/worktree/server";

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
        cls: classifyMigrationSql(readFileSync(join(mainDataDir, file), "utf8")),
      }))
      .filter((c) => c.cls.destructive);
    if (candidates.length === 0) return { ok: true };

    // A destructive migration on main is absent from this branch. Confirm the
    // worktree DB ACTUALLY applied it (a DB forked BEFORE the migration landed
    // never applied it → no real drift) by reading the ledger. Only now do we
    // open a direct (non-pgbouncer) max:1 connection to this worktree's own DB.
    const worktreeDb = basename(root);
    const cfg = readDatabaseConfig();
    const pool = new Pool({
      connectionString: buildConnectionString(cfg.connection, worktreeDb),
      max: 1,
      idleTimeoutMillis: 1_000,
      connectionTimeoutMillis: 5_000,
    });
    // Short-lived check pool: an idle-client reset AFTER the verdict is computed
    // (e.g. the socket dropping during teardown) must not crash the check
    // process via an unhandled 'error' event. This hides no verdict-affecting
    // failure — the query below catches and classifies or rethrows every error.
    pool.on("error", () => {
      /* ignore post-verdict idle-client errors on this disposable pool */
    });
    try {
      // Read the applied-migration ledger. An absent DB (3D000, unforked
      // worktree) or absent ledger table (42P01) means nothing was applied →
      // no drift. Any other error propagates loudly.
      let appliedHashes: Set<string>;
      try {
        const res = await pool.query<{ hash: string }>(
          `SELECT hash FROM ${MIGRATIONS_TABLE_NAME}`,
        );
        appliedHashes = new Set(res.rows.map((r) => r.hash));
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "3D000" || code === "42P01") return { ok: true };
        throw e;
      }

      const confirmed = candidates.filter((c) => {
        const sha8 = MIGRATION_RE.exec(c.file)?.[3];
        return sha8 !== undefined && appliedHashes.has(sha8);
      });
      if (confirmed.length === 0) return { ok: true };

      const details = confirmed
        .map(
          (c) =>
            `  - ${c.file}\n${c.cls.statements.map((s) => `      ${s.text}`).join("\n")}`,
        )
        .join("\n");
      return {
        ok: false,
        message:
          `This worktree's DB ("${worktreeDb}") applied ${confirmed.length} ` +
          `destructive migration(s) absent from this branch:\n${details}`,
        hint:
          "This worktree's DB has migrations your branch lacks that DROP/RENAME " +
          "schema your code may still use. Rebase onto main to pull them in: " +
          "git fetch origin main && git rebase origin/main",
      };
    } finally {
      await pool.end();
    }
  },
};

export default check;
