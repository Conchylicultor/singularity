import { existsSync, readdirSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// Statements a data/backfill migration may contain. DEFAULT-DENY: a statement is
// rejected unless it begins with one of these (after comment stripping). This is
// deliberately an allowlist, not a DDL blocklist — so schema-changing forms a
// blocklist would miss (CREATE EXTENSION, DO $$…$$, EXECUTE/dynamic SQL,
// CREATE TABLE AS, CREATE MATERIALIZED VIEW) can never slip through. A data
// migration therefore provably cannot change the schema and cannot drift from
// schema.ts the way a hand-rolled DDL migration could.
const ALLOWED_LEADING = /^(WITH|SELECT|INSERT|UPDATE|DELETE|SET\s+LOCAL)\b/i;

/** Dollar-quote delimiter: `$$` or `$tag$`. */
const DOLLAR_QUOTE = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Blank out SQL **trivia** — comment bodies, string literals, quoted identifiers
 * and dollar-quoted bodies — replacing each character with a space (newlines
 * kept, so line structure and offsets survive).
 *
 * This is `maskSource` for SQL, and it exists for the same reason: a scanner
 * that reads source text must never see a delimiter that lives inside a literal.
 * A `;` in `regexp_replace(t, '#', '\1;')` is data, not a statement boundary —
 * splitting on it cuts the UPDATE in half and the orphaned tail fails the
 * allowlist. Comments are blanked here rather than deleted so that a `'` in
 * `-- don't` can't open a phantom literal.
 *
 * The mask is positionally identical to its input, so an offset found in the
 * mask indexes the original.
 */
function maskTrivia(sql: string): string {
  const out = [...sql];
  const n = sql.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // Scan to the closing `quote`, honouring the SQL doubling escape (`''`, `""`).
  const closeQuoted = (start: number, quote: string): number => {
    let j = start + 1;
    while (j < n) {
      if (sql[j] === quote) {
        if (sql[j + 1] === quote) j += 2; // an escaped quote, not the end
        else return j + 1;
      } else j++;
    }
    return n; // unterminated — blank to end; the parser will reject it anyway
  };

  let i = 0;
  while (i < n) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      let j = i;
      while (j < n && sql[j] !== "\n") j++;
      blank(i, j);
      i = j;
    } else if (two === "/*") {
      let j = i + 2;
      while (j < n && sql.slice(j, j + 2) !== "*/") j++;
      const end = Math.min(n, j + 2);
      blank(i, end);
      i = end;
    } else if (sql[i] === "'" || sql[i] === '"') {
      const end = closeQuoted(i, sql[i]!);
      blank(i, end);
      i = end;
    } else {
      const dollar = DOLLAR_QUOTE.exec(sql.slice(i));
      if (dollar) {
        const tag = dollar[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        blank(i, end);
        i = end;
      } else i++;
    }
  }
  return out.join("");
}

/** One statement: `code` has trivia blanked (what the allowlist reads); `raw` is verbatim (what a human reads). */
export interface Statement {
  code: string;
  raw: string;
}

/**
 * Split into statements on the `;` that are real statement boundaries — i.e.
 * those outside every comment and literal.
 *
 * drizzle separates statements with "--> statement-breakpoint"; hand-written
 * backfills use a plain ";". Both normalize to ";" first — the breakpoint marker
 * is itself a `--` comment, so it must be rewritten before trivia is masked.
 *
 * Exported for `index.test.ts`.
 */
export function splitStatements(sql: string): Statement[] {
  const normalized = sql.replace(/-->\s*statement-breakpoint/g, ";");
  const masked = maskTrivia(normalized);

  const cuts: number[] = [];
  for (let i = 0; i < masked.length; i++) if (masked[i] === ";") cuts.push(i);

  const statements: Statement[] = [];
  let start = 0;
  for (const cut of [...cuts, masked.length]) {
    // The mask is positionally identical to `normalized`, so one pair of offsets
    // slices both: the blanked code to test, the verbatim text to report.
    const code = masked.slice(start, cut).trim();
    if (code) statements.push({ code, raw: normalized.slice(start, cut).trim() });
    start = cut + 1;
  }
  return statements;
}

const check: Check = {
  id: "data-migration-dml-only",
  description:
    "snapshot-less data migrations contain only DML (no schema changes)",
  async run() {
    const root = await getWorktreeRoot();
    const dir = resolve(root, "plugins/database/plugins/migrations/data");
    const metaDir = join(dir, "meta");

    const offenders: { file: string; statement: string }[] = [];
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      // A data migration is one with no drizzle snapshot. Schema migrations carry
      // a snapshot and are validated by drizzle's own diff (migrations-in-sync).
      if (existsSync(join(metaDir, `${f.slice(0, -4)}_snapshot.json`))) continue;
      const sql = readFileSync(join(dir, f), "utf8");
      for (const { code, raw } of splitStatements(sql)) {
        // SELECT ... INTO creates a table — reject despite the SELECT lead.
        // Read `code`, never `raw`: an `INTO` inside a string literal is data.
        const isSelectInto = /^SELECT\b/i.test(code) && /\bINTO\b/i.test(code);
        if (!ALLOWED_LEADING.test(code) || isSelectInto) {
          offenders.push({ file: f, statement: raw.slice(0, 80) });
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
