// The one SQL statement splitter for migration files, shared by the phaser
// (./classify.ts, run by the migration generator), the `fork-schema-drift` check
// and the `data-migration-dml-only` check.
//
// Migration files are not reliably separated by drizzle's
// `--> statement-breakpoint`: merged files put two statements on one line
// (`…DROP DEFAULT;CREATE …`), and `DO $$ … $$` bodies contain `;`. So a split
// has to know which `;` are real boundaries — those outside every comment and
// literal.

/** Dollar-quote delimiter: `$$` or `$tag$`. */
const DOLLAR_QUOTE = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/;

/**
 * Blank out SQL **trivia**, replacing each character with a space (newlines
 * kept, so line structure and offsets survive):
 *
 * - comments, whole;
 * - the INSIDE of string literals, quoted identifiers and dollar-quoted bodies —
 *   their delimiters stay, so `"agents"` reads as one `"      "` token and a
 *   statement ending in a literal still ends where the literal does.
 *
 * This is `maskSource` for SQL, and it exists for the same reason: a scanner
 * that reads source text must never see a delimiter that lives inside a literal.
 * A `;` in `regexp_replace(t, '#', '\1;')` is data, not a statement boundary.
 * Comments are blanked here rather than deleted so that a `'` in `-- don't`
 * can't open a phantom literal.
 *
 * The mask is positionally identical to its input, so an offset found in the
 * mask indexes the original.
 */
export function maskTrivia(sql: string): string {
  const out = [...sql];
  const n = sql.length;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  // Scan to just past the closing `quote`, honouring the SQL doubling escape
  // (`''`, `""`).
  const closeQuoted = (start: number, quote: string): number => {
    let j = start + 1;
    while (j < n) {
      if (sql[j] === quote) {
        if (sql[j + 1] === quote)
          j += 2; // an escaped quote, not the end
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
      // Keep both quotes; blank only what lies between them.
      blank(i + 1, sql[end - 1] === sql[i] && end - 1 > i ? end - 1 : end);
      i = end;
    } else {
      const dollar = DOLLAR_QUOTE.exec(sql.slice(i));
      if (dollar) {
        const tag = dollar[0];
        const close = sql.indexOf(tag, i + tag.length);
        const end = close === -1 ? n : close + tag.length;
        blank(i + tag.length, close === -1 ? n : close);
        i = end;
      } else i++;
    }
  }
  return out.join("");
}

/**
 * One statement, without its terminating `;` and without leading or trailing
 * comments. `code` has trivia blanked (what a classifier reads); `raw` is
 * verbatim (what gets written back and what a human reads). The two are the
 * same length and aligned character for character.
 */
export interface Statement {
  code: string;
  raw: string;
}

const NON_SPACE = /\S/;

/**
 * Split into statements on the `;` that are real statement boundaries — i.e.
 * those outside every comment and literal.
 *
 * drizzle separates statements with "--> statement-breakpoint"; hand-written
 * SQL uses a plain ";". Both normalize to ";" first — the breakpoint marker is
 * itself a `--` comment, so it must be rewritten before trivia is masked.
 */
export function splitStatements(sql: string): Statement[] {
  const normalized = sql.replace(/-->\s*statement-breakpoint/g, ";");
  const masked = maskTrivia(normalized);

  const cuts: number[] = [];
  for (let i = 0; i < masked.length; i++) if (masked[i] === ";") cuts.push(i);

  const statements: Statement[] = [];
  let start = 0;
  for (const cut of [...cuts, masked.length]) {
    // Trim to the statement's code extent: comments are blank in the mask, so a
    // leading note or a trailing `-- …` never rides along into `raw` (where it
    // would comment out the `;` a writer appends).
    let from = start;
    let to = cut;
    while (from < to && !NON_SPACE.test(masked[from]!)) from++;
    while (to > from && !NON_SPACE.test(masked[to - 1]!)) to--;
    if (from < to) {
      statements.push({
        code: masked.slice(from, to),
        raw: normalized.slice(from, to),
      });
    }
    start = cut + 1;
  }
  return statements;
}
