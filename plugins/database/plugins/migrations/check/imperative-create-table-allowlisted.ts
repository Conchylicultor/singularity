import { join } from "path";
import { grepCode, type CodeMatch } from "@plugins/framework/plugins/tooling/plugins/checks/core";

// Inlined minimal Check shape (mirrors the sibling orphaned-tables check) to
// avoid a cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = {
  id: string;
  description: string;
  run(): Promise<CheckResult>;
  cacheSignature?(): string | null;
};

// The allowlist source of truth. We read this file's TEXT (not its values) to
// recover the IDENTIFIER NAMES listed in the IMPERATIVE_PUBLIC_TABLES array,
// because the create sites interpolate those identifiers as the table name and
// the convention we enforce is that the identifier appears on the CREATE line.
const ALLOWLIST_SRC_REL =
  "plugins/database/plugins/derived-views/core/internal/imperative-tables.ts";

// Real-code occurrences of CREATE TABLE that are exempt from the rule. The
// check scans the whole repo (an imperative table can be created from anywhere
// that boots against a worktree DB), so the only legitimate exemptions are this
// check's OWN source (its description/message/hint strings spell out the token)
// and its test fixtures. Mirrors the ALLOWED_PATHS escape hatch in
// no-raw-websocket, which exempts its own check file the same way.
const ALLOWED_PATHS = [
  "plugins/database/plugins/migrations/check/imperative-create-table-allowlisted.ts",
  "plugins/database/plugins/migrations/check/imperative-create-table-allowlisted.test.ts",
];

// Matches `CREATE TABLE` and `CREATE UNLOGGED TABLE` (unlogged tables persist in
// pg_stat_user_tables, so they are orphan-able and must be allowlisted too).
// TEMP/TEMPORARY are deliberately NOT matched: they are session-scoped and never
// become persistent orphans (none exist in the codebase today).
const CREATE_TABLE_RE = /\bCREATE\s+(?:UNLOGGED\s+)?TABLE\b/i;

/**
 * PURE helper (exported for unit testing): extract the SCREAMING_CASE identifier
 * names listed inside the `IMPERATIVE_PUBLIC_TABLES = [ … ]` array literal of the
 * allowlist source. Throws if the array can't be located or is empty — an empty
 * id set would make the rule vacuous (every CREATE TABLE would be an offender for
 * the wrong reason, or — if inverted — none would), which is a parse error, not a
 * clean state. Mirrors declaredTablesFromSnapshot's empty-set guard.
 */
export function parseAllowlistIdentifiers(src: string): Set<string> {
  // Anchor on the `const` DECLARATION, not the first textual occurrence — the
  // module header (and other comments) mention IMPERATIVE_PUBLIC_TABLES in prose.
  const decl = src.match(/\bconst\s+IMPERATIVE_PUBLIC_TABLES\b/);
  if (decl?.index === undefined) {
    throw new Error(`IMPERATIVE_PUBLIC_TABLES declaration not found in ${ALLOWLIST_SRC_REL}`);
  }
  const open = decl.index;
  // Anchor on the `=` assignment so the `[]` in a `readonly string[]` type
  // annotation (which precedes the array literal) is never mistaken for the list.
  const eq = src.indexOf("=", open);
  const lb = eq < 0 ? -1 : src.indexOf("[", eq);
  const rb = src.indexOf("]", lb);
  if (lb < 0 || rb < 0) {
    throw new Error(
      `IMPERATIVE_PUBLIC_TABLES array literal not found in ${ALLOWLIST_SRC_REL} — keep it a plain identifier list`,
    );
  }
  const body = src.slice(lb + 1, rb);
  const ids = new Set(body.match(/\b[A-Z][A-Z0-9_]+\b/g) ?? []);
  if (ids.size === 0) {
    throw new Error(
      `IMPERATIVE_PUBLIC_TABLES contains no identifier constants in ${ALLOWLIST_SRC_REL} — refusing to enforce a vacuous allowlist`,
    );
  }
  return ids;
}

/**
 * PURE helper (exported for unit testing): an offender is a real-code
 * CREATE TABLE match whose line does NOT name any allowlist identifier (and is
 * not on an exempt path). Returns "path:line:text" strings.
 */
export function findOffenders(matches: CodeMatch[], allowlistIds: Set<string>): string[] {
  const ids = [...allowlistIds];
  return matches
    .filter((m) => !ALLOWED_PATHS.some((p) => m.path === p))
    .filter((m) => !ids.some((id) => new RegExp(`\\b${id}\\b`).test(m.text)))
    .map((m) => `${m.path}:${m.line}:${m.text.trim()}`);
}

async function gitRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) throw new Error("git rev-parse --show-toplevel failed");
  return out.trim();
}

const check: Check = {
  id: "imperative-create-table-allowlisted",
  description:
    "every imperative CREATE TABLE references an IMPERATIVE_PUBLIC_TABLES constant, so a public table created outside drizzle cannot land unallowlisted (the static gate complementing the DB-side orphaned-db-tables check)",
  // Pure source scan, but cheap (one git grep narrows to a handful of files).
  // Never cache: a stale PASS on a correctness gate is worse than re-scanning.
  cacheSignature: () => null,
  async run() {
    const root = await gitRoot();
    const allowlistIds = parseAllowlistIdentifiers(
      await Bun.file(join(root, ALLOWLIST_SRC_REL)).text(),
    );

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

    const offenders = findOffenders(matches, allowlistIds);
    if (offenders.length === 0) return { ok: true };
    return {
      ok: false,
      message:
        `imperative CREATE TABLE not coupled to the allowlist in ${offenders.length} place(s):\n` +
        offenders.map((o) => `  - ${o}`).join("\n"),
      hint:
        `An imperatively-created public table (CREATE TABLE outside drizzle's tracked schema) must be ` +
        `registered in IMPERATIVE_PUBLIC_TABLES (${ALLOWLIST_SRC_REL}) or the orphaned-db-tables check ` +
        `will flag it as dead schema on a later build. Add a name constant there, include it in the ` +
        `IMPERATIVE_PUBLIC_TABLES array, and interpolate that constant by its canonical name on the ` +
        `CREATE TABLE line (e.g. \`CREATE TABLE IF NOT EXISTS \${MY_TABLE} (…)\`). To create a tracked, ` +
        `drizzle-managed table instead, define it in the plugin's tables.ts and run ./singularity build.`,
    };
  },
};

export default check;
