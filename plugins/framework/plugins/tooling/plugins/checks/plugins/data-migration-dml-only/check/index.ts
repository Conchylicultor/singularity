import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

// Statements a data/backfill migration may contain. DEFAULT-DENY: a statement is
// rejected unless it begins with one of these (after comment stripping). This is
// deliberately an allowlist, not a DDL blocklist — so schema-changing forms a
// blocklist would miss (CREATE EXTENSION, DO $$…$$, EXECUTE/dynamic SQL,
// CREATE TABLE AS, CREATE MATERIALIZED VIEW) can never slip through. A data
// migration therefore provably cannot change the schema and cannot drift from
// schema.ts the way a hand-rolled DDL migration could.
const ALLOWED_LEADING = /^(WITH|SELECT|INSERT|UPDATE|DELETE|SET\s+LOCAL)\b/i;

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/--[^\n]*/g, " "); // line comments
}

function splitStatements(sql: string): string[] {
  // drizzle separates statements with "--> statement-breakpoint"; hand-written
  // backfills use a plain ";". Normalize both, then split.
  return stripComments(sql.replace(/-->\s*statement-breakpoint/g, ";"))
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const check: Check = {
  id: "data-migration-dml-only",
  description:
    "snapshot-less data migrations contain only DML (no schema changes)",
  async run() {
    const root = await getRoot();
    const dir = resolve(root, "plugins/database/plugins/migrations/data");
    const metaDir = join(dir, "meta");

    const offenders: { file: string; statement: string }[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      // A data migration is one with no drizzle snapshot. Schema migrations carry
      // a snapshot and are validated by drizzle's own diff (migrations-in-sync).
      if (existsSync(join(metaDir, `${f.slice(0, -4)}_snapshot.json`))) continue;
      const sql = readFileSync(join(dir, f), "utf8");
      for (const stmt of splitStatements(sql)) {
        // SELECT ... INTO creates a table — reject despite the SELECT lead.
        const isSelectInto =
          /^SELECT\b/i.test(stmt) && /\bINTO\b/i.test(stmt);
        if (!ALLOWED_LEADING.test(stmt) || isSelectInto) {
          offenders.push({ file: f, statement: stmt.slice(0, 80) });
          break;
        }
      }
    }

    if (offenders.length === 0) return { ok: true };
    return {
      ok: false,
      message:
        "data migration(s) contain non-DML statements (schema changes are not allowed):\n" +
        offenders.map((o) => `  ${o.file}: ${o.statement}…`).join("\n"),
      hint:
        "Data/backfill migrations (created with --custom-migration) carry no drizzle " +
        "snapshot and must run only DML (UPDATE/INSERT/DELETE/WITH/SELECT). To change " +
        "the schema, edit the plugin's schema.ts and run\n" +
        "  ./singularity build --migration-name <slug>\n" +
        "so drizzle generates a tracked, snapshot-backed migration instead.",
    };
  },
};

export default check;
