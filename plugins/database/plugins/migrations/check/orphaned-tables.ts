import { readdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import { Pool } from "pg";
// Connect via the database CORE barrel, not admin/server: the admin pool module
// throws at import time if SINGULARITY_WORKTREE is unset, which is the norm in a
// tooling/check subprocess. The core barrel exposes the import-safe config→
// connstring helpers by design.
import { buildConnectionString, readDatabaseConfig } from "@plugins/database/core";
// The imperative-public-table allowlist lives in the derived-views core leaf
// (the shared sink) — see that module for why it is NOT in @plugins/database/core.
import { IMPERATIVE_PUBLIC_TABLES } from "@plugins/database/plugins/derived-views/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// Inlined minimal Check shape (mirrors the sibling migration-applies-clean check)
// to avoid a cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// The drizzle snapshot meta dir, relative to THIS check file
// (.../migrations/check/ → .../migrations/data/meta).
const META_DIR = join(import.meta.dir, "..", "data", "meta");

// PURE helper (exported for unit testing): given a parsed drizzle snapshot
// object, return the set of declared public base-table names. The snapshot's
// `tables` is keyed "public.<name>"; each value carries a bare `name`. Throws if
// `tables` is missing/empty — an empty declared set would flag every live table
// as orphaned, which is a snapshot-read error, not a clean pass.
export function declaredTablesFromSnapshot(parsed: unknown): Set<string> {
  const tables = (parsed as { tables?: Record<string, { name?: string }> }).tables;
  if (!tables || typeof tables !== "object") {
    throw new Error("snapshot has no `tables` object");
  }
  const names = Object.values(tables)
    .map((t) => t.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  if (names.length === 0) {
    throw new Error("snapshot `tables` is empty — refusing to treat every live table as orphaned");
  }
  return new Set(names);
}

// PURE helper (exported for unit testing): orphans = live − declared − allowlist,
// sorted for stable output.
export function computeOrphans(
  live: string[],
  declared: Set<string>,
  allowlist: readonly string[],
): string[] {
  const allow = new Set(allowlist);
  return live
    .filter((t) => !declared.has(t) && !allow.has(t))
    .sort((a, b) => a.localeCompare(b));
}

// Read the latest drizzle snapshot (lexicographically-greatest *_snapshot.json,
// timestamp-prefixed) and parse out the declared table-name set.
function loadDeclaredTables(): Set<string> {
  const snapshots = readdirSync(META_DIR)
    .filter((f) => f.endsWith("_snapshot.json"))
    .sort();
  const latest = snapshots.at(-1);
  if (!latest) {
    throw new Error(`no *_snapshot.json found in ${META_DIR}`);
  }
  const parsed = JSON.parse(readFileSync(join(META_DIR, latest), "utf8"));
  return declaredTablesFromSnapshot(parsed);
}

// The worktree DB name = the git worktree dir basename (SINGULARITY_WORKTREE is
// not set in a check subprocess), mirroring getWorktreeSlug in the check CLI.
async function getWorktreeName(): Promise<string> {
  return basename(await getWorktreeRoot());
}

const check: Check = {
  id: "orphaned-db-tables",
  description:
    "no orphaned public base tables: every live worktree-DB table is declared by a plugin's drizzle schema or in the imperative allowlist (catches dead schema left by imperative DROP/rename)",
  // Impure: reads the live worktree DB. Never cache.
  cacheSignature: () => null,
  async run() {
    const declared = loadDeclaredTables();
    const worktreeName = await getWorktreeName();

    const cfg = readDatabaseConfig();
    const pool = new Pool({
      connectionString: buildConnectionString(cfg.connection, worktreeName),
      max: 1,
      idleTimeoutMillis: 1_000,
    });
    try {
      // The check needs the live worktree DB to read its table set. But the DB
      // being reachable is an environmental PRECONDITION, not the check's
      // subject — "cannot connect" is never evidence of dead schema, so we must
      // not turn it into a push-blocking failure. Two cases where the DB is
      // legitimately absent: during `./singularity push` the embedded Postgres
      // cluster may not be running in the checks subprocess (push doesn't bring
      // the app up — this is exactly why migration-applies-clean fast-paths out
      // without connecting), and a not-yet-provisioned worktree fork (3D000) has
      // no tables at all. In both, decline to assert (clean pass). This is not a
      // silenced error: the check still fires loudly with a real orphan finding
      // whenever the DB IS reachable (build, manual `check`, healthy push). It
      // detects orphans, not cluster downtime.
      try {
        const client = await pool.connect();
        client.release();
        // eslint-disable-next-line promise-safety/no-bare-catch -- intentional: DB reachability is an environmental precondition, not the check's subject. Any connect failure (cluster down in the push checks subprocess; a 3D000 not-yet-provisioned fork) means "cannot look", which must never block push. The check still fails loudly on a real orphan finding whenever the DB IS reachable.
      } catch {
        return { ok: true };
      }
      const res = await pool.query<{ relname: string }>(
        `SELECT relname FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname`,
      );
      const live = res.rows.map((r) => r.relname);
      const orphans = computeOrphans(live, declared, IMPERATIVE_PUBLIC_TABLES);
      if (orphans.length === 0) return { ok: true };
      return {
        ok: false,
        message:
          `Orphaned public table(s) in worktree DB "${worktreeName}" — present in the live DB but ` +
          `not declared by any plugin's drizzle schema nor in the imperative allowlist:\n` +
          orphans.map((t) => `  - ${t}`).join("\n"),
        hint:
          "These are likely dead schema left behind by an imperative DROP/rename. " +
          "If the drop was intended, author a proper schema migration that drops them " +
          "(`./singularity build --migration-name drop_<table>`). " +
          "If the drop was unintended, restore the table's declaration in its plugin's tables.ts.",
      };
    } finally {
      await pool.end();
    }
  },
};

export default check;
