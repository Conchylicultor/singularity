import { describe, expect, it } from "bun:test";
import { splitStatements } from "./index";

/** The blanked code of each statement — what the allowlist reads. */
const codes = (sql: string) => splitStatements(sql).map((s) => s.code);

describe("splitStatements — a `;` inside a literal is data, not a boundary", () => {
  it("keeps a regexp_replace whose replacement IS a semicolon in one statement", () => {
    // The exact shape that motivated this: rewriting `#` comments to `;`.
    const sql = `UPDATE t SET c = regexp_replace(c, '(^|[[:space:]|])#', '\\1;', 'g')
 WHERE c ~ '(^|[[:space:]|])#';`;
    const out = splitStatements(sql);
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toStartWith("UPDATE");
    expect(out[0]!.raw).toContain("regexp_replace");
  });

  it("does not split on a `;` inside a single-quoted literal", () => {
    expect(codes("SELECT 'a;b'")).toHaveLength(1);
  });

  it("does not split on a `;` inside a quoted identifier", () => {
    expect(codes('UPDATE "weird;name" SET a = 1')).toHaveLength(1);
  });

  it("does not split on a `;` inside a dollar-quoted body", () => {
    expect(codes("SELECT $tag$ a; b $tag$")).toHaveLength(1);
    expect(codes("SELECT $$ a; b $$")).toHaveLength(1);
  });

  it("honours the '' doubling escape rather than ending the literal early", () => {
    // The literal is `it's; fine` — one statement, not two.
    expect(codes("SELECT 'it''s; fine'")).toHaveLength(1);
  });

  it("still splits on a real boundary between statements", () => {
    expect(codes("UPDATE a SET x=1; DELETE FROM b")).toEqual([
      "UPDATE a SET x=1",
      "DELETE FROM b",
    ]);
  });

  it("splits on drizzle's statement-breakpoint marker", () => {
    expect(codes("UPDATE a SET x=1\n--> statement-breakpoint\nDELETE FROM b")).toEqual([
      "UPDATE a SET x=1",
      "DELETE FROM b",
    ]);
  });
});

describe("splitStatements — comments are blanked, and cannot open a literal", () => {
  it("drops a leading line comment so the keyword leads", () => {
    expect(codes("-- a note\nUPDATE t SET a = 1")).toEqual(["UPDATE t SET a = 1"]);
  });

  it("drops a block comment", () => {
    expect(codes("/* a\n note */ DELETE FROM t")).toEqual(["DELETE FROM t"]);
  });

  it("an apostrophe in a comment does not swallow the statement", () => {
    // A naive stripper that removed comments *after* scanning literals — or a
    // literal scanner that ran first — would open a literal at `don't`.
    expect(codes("-- don't do this\nUPDATE t SET a = 1")).toEqual([
      "UPDATE t SET a = 1",
    ]);
  });

  it("a `--` inside a literal is not a comment", () => {
    expect(codes("UPDATE t SET a = '-- not a comment'")).toHaveLength(1);
  });

  it("a `;` inside a comment is not a boundary", () => {
    expect(codes("UPDATE t SET a = 1 -- ; not a boundary")).toHaveLength(1);
  });
});

describe("splitStatements — the mask never hides real DDL", () => {
  // The allowlist is default-deny on the LEADING keyword of `code`. These are the
  // statements the check must keep rejecting; masking must not disguise them.
  //
  // The literal `CREATE TABLE` is deliberately absent: repo-wide, every real-code
  // occurrence of it must name an IMPERATIVE_PUBLIC_TABLES constant
  // (`imperative-create-table-allowlisted`), and these fixtures create nothing.
  // The splitter is keyword-agnostic — it only has to leave the leading token
  // visible — so the sibling DDL forms below prove exactly the same property.
  const rejected = [
    "ALTER TABLE t ADD COLUMN a int",
    "DROP TABLE t",
    "TRUNCATE t",
    "CREATE EXTENSION pgcrypto",
    "CREATE INDEX i ON t (a)",
    "CREATE MATERIALIZED VIEW v AS SELECT 1",
    "GRANT SELECT ON t TO someone",
  ];
  const ALLOWED_LEADING = /^(WITH|SELECT|INSERT|UPDATE|DELETE|SET\s+LOCAL)\b/i;

  for (const sql of rejected) {
    it(`still exposes the leading keyword of: ${sql.slice(0, 28)}…`, () => {
      const [stmt] = splitStatements(sql);
      expect(ALLOWED_LEADING.test(stmt!.code)).toBe(false);
    });
  }

  it("a DO $$…$$ block leads with DO even though its body is masked", () => {
    // The `;` inside the dollar-quoted body must not split the statement, and the
    // body must not be able to smuggle its leading keyword past the allowlist.
    const out = splitStatements("DO $$ BEGIN PERFORM 1; END $$");
    expect(out).toHaveLength(1);
    expect(out[0]!.code).toStartWith("DO");
    expect(ALLOWED_LEADING.test(out[0]!.code)).toBe(false);
  });

  it("SELECT … INTO is still visible as INTO (not hidden in a literal)", () => {
    const [stmt] = splitStatements("SELECT a INTO newtbl FROM t");
    expect(/^SELECT\b/i.test(stmt!.code) && /\bINTO\b/i.test(stmt!.code)).toBe(true);
  });

  it("but an INTO inside a literal does not trip the SELECT…INTO guard", () => {
    const [stmt] = splitStatements("SELECT 'INTO' AS a");
    expect(/\bINTO\b/i.test(stmt!.code)).toBe(false);
  });
});
