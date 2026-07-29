import { join } from "path";
import { grepCode, type CodeMatch } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import * as derivedViewsCore from "@plugins/database/plugins/derived-views/core";
import { IMPERATIVE_PUBLIC_TABLES } from "@plugins/database/plugins/derived-views/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

// Inlined minimal Check shape (mirrors the sibling orphaned-tables check) to
// avoid a cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// The allowlist source of truth. What this check needs is the IDENTIFIER NAMES,
// not the table names — the create sites interpolate the constant and the
// convention enforced here is that the identifier appears on the CREATE line.
// Those names are the KEYS of the shorthand `IMPERATIVE_PUBLIC_TABLES` record,
// published as data; this check used to regex them out of that module's TEXT.
// The path below is now MESSAGE-ONLY — it points a human at the file to edit; no
// code reads it.
const ALLOWLIST_SRC_REL =
  "plugins/database/plugins/derived-views/core/internal/imperative-tables.ts";

// Real-code occurrences of CREATE TABLE that are exempt by PATH: this check's OWN
// source (its description/message/hint strings spell out the token) and its test
// fixtures. Mirrors the ALLOWED_PATHS escape hatch in no-raw-websocket, which
// exempts its own check file the same way. Keep this list to exactly that — it is
// a self-reference hatch, not a general opt-out.
//
// The check otherwise scans the whole repo, because an imperative table can be
// created from anywhere that boots against a worktree DB. The one other exemption
// is derived from evidence rather than listed here: a CREATE TABLE aimed at a
// throwaway test database (see `usesThrowawayTestDb` below).
const ALLOWED_PATHS = [
  "plugins/database/plugins/migrations/check/imperative-create-table-allowlisted.ts",
  "plugins/database/plugins/migrations/check/imperative-create-table-allowlisted.test.ts",
];

// A CREATE TABLE in a test that provisions its own THROWAWAY database is not
// worktree schema, and exempting it is a scope correction rather than a hole.
//
// The rule this check enforces exists for exactly one downstream reason (see the
// hint): an imperative public table that is not allowlisted gets flagged later by
// `orphaned-db-tables` as dead schema. That check only ever scans the LIVE
// WORKTREE DB. `createTestDb` mints a randomly-named database on the cluster and
// drops it in teardown, so a table created through that fixture never enters the
// worktree DB and cannot reach `orphaned-db-tables` at all — the failure mode the
// allowlist prevents does not exist for it. Demanding an allowlist entry anyway
// would be a false positive AND actively harmful: it would push per-suite
// fixtures into the production allowlist, where `orphaned-db-tables` would then
// treat a name that exists in no real database as declared schema.
//
// BOTH conditions are required, which is what keeps this narrow: the file must be
// a test file AND must import the fixture barrel that hands out throwaway
// databases. A `*.test.ts` that reaches the real `db` — the only way a test could
// create a table that actually persists — imports `@plugins/database/server`, not
// this barrel, so it stays fully covered by the rule.
const TEST_FILE_RE = /\.test\.tsx?$/;
const TEST_DB_FIXTURE_IMPORT_RE =
  /from\s+["']@plugins\/database\/plugins\/db-test-fixture\/server["']/;

/**
 * PURE helper (exported for unit testing): does this file create its tables in a
 * throwaway database provisioned by the db-test-fixture primitive? Takes the
 * file's own source so the decision is evidence-based (a real import), never a
 * path convention alone.
 */
export function usesThrowawayTestDb(path: string, src: string): boolean {
  return TEST_FILE_RE.test(path) && TEST_DB_FIXTURE_IMPORT_RE.test(src);
}

// Matches `CREATE TABLE` and `CREATE UNLOGGED TABLE` (unlogged tables persist in
// pg_stat_user_tables, so they are orphan-able and must be allowlisted too).
// TEMP/TEMPORARY are deliberately NOT matched: they are session-scoped and never
// become persistent orphans (none exist in the codebase today).
const CREATE_TABLE_RE = /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\b/i;

/**
 * PURE helper (exported for unit testing): the allowlist's identifier names —
 * the KEYS of the `IMPERATIVE_PUBLIC_TABLES` record — after PROVING the shorthand
 * invariant every consumer of those keys depends on: each key must name an export
 * of the `derived-views/core` barrel holding that exact table name.
 *
 * The barrel is the right comparison target, not a convenience: every create site
 * and `pgTable` read handle imports its constant from
 * `@plugins/database/plugins/derived-views/core`, so "the key names a barrel
 * export with this value" IS the coupling this check matches textually. A
 * non-shorthand entry (`{ ALIAS: MY_TABLE }`) or a constant missing from the
 * barrel breaks it — and would otherwise surface as a confusing false positive at
 * a legitimate CREATE TABLE line rather than here, at the declaration.
 *
 * Throws rather than returning a partial set (matching the previous parser's
 * fail-loud contract): a broken or empty allowlist would make the rule vacuous —
 * every CREATE TABLE an offender for the wrong reason — which is an error, not a
 * clean state. Mirrors declaredTablesFromSnapshot's empty-set guard.
 */
export function allowlistIdentifiers(
  mapping: Record<string, string>,
  barrelExports: Record<string, unknown>,
): Set<string> {
  const ids = Object.keys(mapping);
  if (ids.length === 0) {
    throw new Error(
      `IMPERATIVE_PUBLIC_TABLES is empty in ${ALLOWLIST_SRC_REL} — refusing to enforce a vacuous allowlist`,
    );
  }
  const broken = ids.filter((id) => barrelExports[id] !== mapping[id]);
  if (broken.length > 0) {
    throw new Error(
      `IMPERATIVE_PUBLIC_TABLES key(s) [${broken.join(", ")}] in ${ALLOWLIST_SRC_REL} do not name an ` +
        `export of @plugins/database/plugins/derived-views/core holding that table name. Each entry must ` +
        `be written SHORTHAND (\`{ MY_TABLE }\`, never \`{ ALIAS: MY_TABLE }\`) and its constant must be ` +
        `re-exported from that barrel — the create sites import it from there, and the key is the ` +
        `identifier this check requires on the CREATE TABLE line.`,
    );
  }
  return new Set(ids);
}

/**
 * PURE helper (exported for unit testing): an offender is a real-code
 * CREATE TABLE match whose line does NOT name any allowlist identifier, and which
 * is neither on an exempt path nor in a file that creates it in a throwaway test
 * database (`exemptPaths`, resolved by the caller — see `usesThrowawayTestDb`).
 * Returns "path:line:text" strings.
 */
export function findOffenders(
  matches: CodeMatch[],
  allowlistIds: Set<string>,
  exemptPaths: ReadonlySet<string> = new Set(),
): string[] {
  const ids = [...allowlistIds];
  return matches
    .filter((m) => !ALLOWED_PATHS.some((p) => m.path === p))
    .filter((m) => !exemptPaths.has(m.path))
    .filter((m) => !ids.some((id) => new RegExp(`\\b${id}\\b`).test(m.text)))
    .map((m) => `${m.path}:${m.line}:${m.text.trim()}`);
}

const check: Check = {
  id: "imperative-create-table-allowlisted",
  description:
    "every imperative CREATE TABLE references an IMPERATIVE_PUBLIC_TABLES constant, so a public table created outside drizzle cannot land unallowlisted (the static gate complementing the DB-side orphaned-db-tables check)",
  // Pure source scan, but cheap (one git grep narrows to a handful of files).
  // Never cache: a stale PASS on a correctness gate is worse than re-scanning.
  cacheSignature: () => null,
  async run() {
    const root = await getWorktreeRoot();
    const allowlistIds = allowlistIdentifiers(IMPERATIVE_PUBLIC_TABLES, derivedViewsCore);

    // maskStrings:false is load-bearing: the DDL lives INSIDE a template string,
    // so we must keep string interiors visible to see `CREATE TABLE` and the
    // `${CONST}` identifier. Comments are masked regardless, so the comment-only
    // mentions (rank/core types, data-migration-dml-only) are excluded.
    const matches = await grepCode({
      root,
      pattern: CREATE_TABLE_RE,
      grepArg: "CREATE",
      maskStrings: false,
    });

    // Resolve the throwaway-test-db exemption from each candidate's SOURCE (an
    // actual fixture import), not from its path. Only test files among the
    // matches are read, so this stays a handful of small reads on top of the grep.
    const exemptPaths = new Set<string>();
    for (const path of new Set(matches.map((m) => m.path))) {
      if (!TEST_FILE_RE.test(path)) continue;
      if (usesThrowawayTestDb(path, await Bun.file(join(root, path)).text())) {
        exemptPaths.add(path);
      }
    }

    const offenders = findOffenders(matches, allowlistIds, exemptPaths);
    if (offenders.length === 0) return { ok: true };
    return {
      ok: false,
      message:
        `imperative CREATE TABLE not coupled to the allowlist in ${offenders.length} place(s):\n` +
        offenders.map((o) => `  - ${o}`).join("\n"),
      hint:
        `An imperatively-created public table (CREATE TABLE outside drizzle's tracked schema) must be ` +
        `registered in IMPERATIVE_PUBLIC_TABLES (${ALLOWLIST_SRC_REL}) or the orphaned-db-tables check ` +
        `will flag it as dead schema on a later build. Add a name constant there, add it to the ` +
        `IMPERATIVE_PUBLIC_TABLES record BY SHORTHAND, and interpolate that constant by its canonical name on the ` +
        `CREATE TABLE line (e.g. \`CREATE TABLE IF NOT EXISTS \${MY_TABLE} (…)\`). To create a tracked, ` +
        `drizzle-managed table instead, define it in the plugin's tables.ts and run ./singularity build. ` +
        `In a TEST that only needs a scratch table, provision a throwaway database with createTestDb ` +
        `(@plugins/database/plugins/db-test-fixture/server) and create the table on it — that never ` +
        `touches the worktree DB, so it is exempt and must NOT be added to the allowlist.`,
    };
  },
};

export default check;
