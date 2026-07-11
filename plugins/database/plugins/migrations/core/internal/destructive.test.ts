import { describe, expect, test } from "bun:test";

import { classifyMigrationSql } from "./destructive";

describe("classifyMigrationSql", () => {
  test("empty / whitespace-only → not destructive, no statements", () => {
    expect(classifyMigrationSql("")).toEqual({
      destructive: false,
      statements: [],
    });
    expect(classifyMigrationSql("   \n\t  \n")).toEqual({
      destructive: false,
      statements: [],
    });
  });

  // Additive DDL (index + column add). Fixtures deliberately avoid the literal
  // table-creation keyword pair: the repo-wide imperative-create-table-allowlisted
  // check greps every file for it, and a bare fixture string would trip that scan.
  test("additive DDL (CREATE INDEX + ADD COLUMN) → not destructive", () => {
    const sql = `CREATE INDEX "reports_created_at_idx" ON "reports" ("created_at");--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "operation_kind" text;`;
    const result = classifyMigrationSql(sql);
    expect(result.destructive).toBe(false);
    expect(result.statements).toEqual([]);
  });

  test("DROP TABLE → destructive with kind drop-table", () => {
    const result = classifyMigrationSql(
      `DROP TABLE "push_and_exit_jobs" CASCADE;`,
    );
    expect(result.destructive).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.kind).toBe("drop-table");
    expect(result.statements[0]!.text).toContain("push_and_exit_jobs");
  });

  test("DROP COLUMN → destructive with kind drop-column", () => {
    const result = classifyMigrationSql(
      `ALTER TABLE "reports" DROP COLUMN "legacy_flag";`,
    );
    expect(result.destructive).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.kind).toBe("drop-column");
    expect(result.statements[0]!.text).toContain("legacy_flag");
  });

  test("RENAME COLUMN → destructive with kind rename", () => {
    const result = classifyMigrationSql(
      `ALTER TABLE "events_test_pinged_triggers" RENAME COLUMN "action_name" TO "job_name";`,
    );
    expect(result.destructive).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.kind).toBe("rename");
    expect(result.statements[0]!.text).toContain("action_name");
  });

  test("RENAME TO (table rename) → destructive with kind rename", () => {
    const result = classifyMigrationSql(
      `ALTER TABLE "crashes" RENAME TO "reports";`,
    );
    expect(result.destructive).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.kind).toBe("rename");
    expect(result.statements[0]!.text).toContain("crashes");
  });

  test("mixed case + extra whitespace → still detected", () => {
    const result = classifyMigrationSql(
      `alter   table  "foo"\n  drop\tCOLUMN "bar";`,
    );
    expect(result.destructive).toBe(true);
    expect(result.statements[0]!.kind).toBe("drop-column");
  });

  test("DROP COLUMN inside a line comment → ignored", () => {
    const sql = `-- DROP COLUMN foo was here once, kept for history
ALTER TABLE "reports" ADD COLUMN "note" text;`;
    expect(classifyMigrationSql(sql)).toEqual({
      destructive: false,
      statements: [],
    });
  });

  test("DROP TABLE inside a block comment → ignored", () => {
    const sql = `/* legacy plan: DROP TABLE "old_thing";
   superseded by the additive migration below */
CREATE INDEX "new_thing_idx" ON "existing" ("id");`;
    expect(classifyMigrationSql(sql)).toEqual({
      destructive: false,
      statements: [],
    });
  });

  test("additive stmt + real DROP COLUMN → destructive, exactly one statement", () => {
    const sql = `ALTER TABLE "reports" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "reports" DROP COLUMN "legacy_flag";`;
    const result = classifyMigrationSql(sql);
    expect(result.destructive).toBe(true);
    expect(result.statements).toHaveLength(1);
    expect(result.statements[0]!.kind).toBe("drop-column");
    expect(result.statements[0]!.text).toContain("legacy_flag");
  });

  test("multiple destructive statements → all captured", () => {
    const sql = `ALTER TABLE "a" DROP COLUMN "x";--> statement-breakpoint
DROP TABLE "b" CASCADE;--> statement-breakpoint
ALTER TABLE "c" RENAME TO "d";`;
    const result = classifyMigrationSql(sql);
    expect(result.destructive).toBe(true);
    expect(result.statements.map((s) => s.kind)).toEqual([
      "drop-column",
      "drop-table",
      "rename",
    ]);
  });

  test("DROP CONSTRAINT alone → NOT destructive (soft reshape, out of blocking set)", () => {
    const result = classifyMigrationSql(
      `ALTER TABLE "reports" DROP CONSTRAINT "reports_task_id_fk";`,
    );
    expect(result.destructive).toBe(false);
    expect(result.statements).toEqual([]);
  });

  test("SET NOT NULL alone → NOT destructive (soft reshape, out of blocking set)", () => {
    const result = classifyMigrationSql(
      `ALTER TABLE "reports" ALTER COLUMN "note" SET NOT NULL;`,
    );
    expect(result.destructive).toBe(false);
    expect(result.statements).toEqual([]);
  });

  test("ALTER COLUMN ... TYPE alone → NOT destructive (soft reshape, out of blocking set)", () => {
    const result = classifyMigrationSql(
      `ALTER TABLE "reports" ALTER COLUMN "count" SET DATA TYPE bigint;`,
    );
    expect(result.destructive).toBe(false);
    expect(result.statements).toEqual([]);
  });
});
