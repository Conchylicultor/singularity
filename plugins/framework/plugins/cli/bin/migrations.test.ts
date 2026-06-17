import { describe, expect, test } from "bun:test";
import {
  promptKey,
  resolveAnswer,
  reorderViewStatementsInSql,
  type DetectedPrompt,
  type MigrationAnswer,
} from "./migrations";

function tablePrompt(name: string, fromName?: string): DetectedPrompt {
  const options: DetectedPrompt["options"] = [
    { index: 0, action: "create", label: `+ ${name} create` },
  ];
  if (fromName) {
    options.push({
      index: 1,
      action: "rename",
      label: `~ ${fromName} › ${name} rename`,
      fromName,
    });
  }
  return {
    index: 0,
    entityType: "table",
    entityName: name,
    context: null,
    question: `Is ${name} table created or renamed from another table?`,
    options,
  };
}

function columnPrompt(table: string, col: string, fromName?: string): DetectedPrompt {
  const options: DetectedPrompt["options"] = [
    { index: 0, action: "create", label: `+ ${col} create` },
  ];
  if (fromName) {
    options.push({
      index: 1,
      action: "rename",
      label: `~ ${fromName} › ${col} rename`,
      fromName,
    });
  }
  return {
    index: 0,
    entityType: "column",
    entityName: col,
    context: table,
    question: `Is ${col} column in ${table} table created or renamed from another column?`,
    options,
  };
}

function enumPrompt(name: string): DetectedPrompt {
  return {
    index: 0,
    entityType: "enum",
    entityName: name,
    context: null,
    question: `Is ${name} enum created or renamed from another enum?`,
    options: [{ index: 0, action: "create", label: `+ ${name} create` }],
  };
}

describe("promptKey", () => {
  test("table prompt → table:<name>", () => {
    expect(promptKey(tablePrompt("staged_config_default"))).toBe(
      "table:staged_config_default",
    );
  });

  test("column prompt → column:<table>.<name>", () => {
    expect(promptKey(columnPrompt("tasks", "priority"))).toBe(
      "column:tasks.priority",
    );
  });

  test("enum prompt → enum:<name>", () => {
    expect(promptKey(enumPrompt("task_status"))).toBe("enum:task_status");
  });
});

describe("resolveAnswer (keyed replay)", () => {
  test("create resolves to option index 0", () => {
    const prompt = tablePrompt("staged_config_default", "reorder_staged_default");
    const answer: MigrationAnswer = { action: "create" };
    expect(resolveAnswer(prompt, answer)).toBe(0);
  });

  test("rename resolves to the matching option index", () => {
    const prompt = tablePrompt("staged_config_default", "reorder_staged_default");
    const answer: MigrationAnswer = {
      action: "rename",
      from: "reorder_staged_default",
    };
    expect(resolveAnswer(prompt, answer)).toBe(1);
  });

  test("keyed map lookup → resolveAnswer returns the right index", () => {
    const prompt = tablePrompt("b", "a");
    const keyed = new Map<string, MigrationAnswer>([
      [promptKey(prompt), { action: "rename", from: "a" }],
    ]);
    const a = keyed.get(promptKey(prompt));
    expect(a).toBeDefined();
    expect(resolveAnswer(prompt, a!)).toBe(1);
  });

  test("stale rename source not in options → throws (keyed path catches → unanswered)", () => {
    // The branch authored a rename from "old_a", but after rebase the prompt no
    // longer offers that source. resolveAnswer must throw so the keyed path can
    // mark it unanswered rather than silently picking a wrong option.
    const prompt = tablePrompt("b", "different_source");
    const answer: MigrationAnswer = { action: "rename", from: "old_a" };
    expect(() => resolveAnswer(prompt, answer)).toThrow(/rename from "old_a"/);
  });
});

const BP = "--> statement-breakpoint";

/** Join statements with the project's breakpoint delimiter. */
function sqlOf(...statements: string[]): string {
  return statements.join(BP);
}

const noPriorDefs = () => new Map<string, string>();

/**
 * Assert the canonical serialization invariant: every `--> statement-breakpoint`
 * marker is immediately followed by exactly one newline, so no statement ever
 * shares a line with a preceding marker (which would swallow it as a `--` comment).
 */
function expectCanonicalBreakpoints(sql: string): void {
  expect(/statement-breakpoint(?!\n)/.test(sql)).toBe(false);
}

/** Count statements that begin a line with `DROP VIEW`. */
function countDropViewLines(sql: string): number {
  return (sql.match(/^DROP VIEW /gm) ?? []).length;
}

describe("reorderViewStatementsInSql", () => {
  test("no-op: zero view statements", () => {
    const sql = sqlOf(
      `ALTER TABLE "tasks" ADD COLUMN "x" text;`,
      `\nALTER TABLE "tasks" ADD COLUMN "y" text;`,
    );
    expect(reorderViewStatementsInSql(sql, noPriorDefs)).toBe(sql);
  });

  test("no-op: single view statement", () => {
    const sql = sqlOf(`DROP VIEW "public"."tasks_v";`);
    expect(reorderViewStatementsInSql(sql, noPriorDefs)).toBe(sql);
  });

  test("no-op: independent views stay byte-identical", () => {
    const sql = sqlOf(
      `CREATE VIEW "public"."a_v" AS (select 1 from "t");`,
      `\nCREATE VIEW "public"."b_v" AS (select 2 from "t");`,
    );
    // No interdependency → order unchanged, output identical.
    expect(reorderViewStatementsInSql(sql, noPriorDefs)).toBe(sql);
  });

  test("CREATE order: dependency created before dependent", () => {
    // drizzle emits tasks_v (depends on attempts_v) BEFORE attempts_v — wrong.
    const sql = sqlOf(
      `CREATE VIEW "public"."tasks_v" AS (select * from "attempts_v");`,
      `\nCREATE VIEW "public"."attempts_v" AS (select * from "attempts");`,
    );
    const out = reorderViewStatementsInSql(sql, noPriorDefs);
    const attemptsIdx = out.indexOf("attempts_v");
    const tasksIdx = out.indexOf("tasks_v");
    // attempts_v's CREATE must come before tasks_v's CREATE.
    expect(out.indexOf(`CREATE VIEW "public"."attempts_v"`)).toBeLessThan(
      out.indexOf(`CREATE VIEW "public"."tasks_v"`),
    );
    expect(attemptsIdx).toBeGreaterThanOrEqual(0);
    expect(tasksIdx).toBeGreaterThanOrEqual(0);
  });

  test("DROP order: dependent dropped before dependency (from snapshot)", () => {
    // Pure drops — bodies come from the prior snapshot, not the migration.
    const sql = sqlOf(
      // drizzle alphabetical order: attempts_v dropped before tasks_v — wrong.
      `DROP VIEW "public"."attempts_v";`,
      `\nDROP VIEW "public"."tasks_v";`,
    );
    const priorDefs = () =>
      new Map<string, string>([
        ["attempts_v", `select * from "attempts"`],
        ["tasks_v", `select * from "attempts_v"`], // tasks_v depends on attempts_v
      ]);
    const out = reorderViewStatementsInSql(sql, priorDefs);
    // tasks_v (dependent) must be dropped before attempts_v (dependency).
    expect(out.indexOf(`DROP VIEW "public"."tasks_v"`)).toBeLessThan(
      out.indexOf(`DROP VIEW "public"."attempts_v"`),
    );
    expectCanonicalBreakpoints(out);
  });

  test("non-view statements keep their positions", () => {
    const sql = sqlOf(
      `ALTER TABLE "t" ADD COLUMN "a" text;`,
      `\nDROP VIEW "public"."attempts_v";`,
      `\nALTER TABLE "t" ADD COLUMN "b" text;`,
      `\nDROP VIEW "public"."tasks_v";`,
      `\nALTER TABLE "t" ADD COLUMN "c" text;`,
    );
    const priorDefs = () =>
      new Map<string, string>([
        ["attempts_v", `select * from "attempts"`],
        ["tasks_v", `select * from "attempts_v"`],
      ]);
    const out = reorderViewStatementsInSql(sql, priorDefs);
    const parts = out.split(BP);
    // Non-view ALTER statements remain in slots 0, 2, 4.
    expect(parts[0]).toContain(`ADD COLUMN "a"`);
    expect(parts[2]).toContain(`ADD COLUMN "b"`);
    expect(parts[4]).toContain(`ADD COLUMN "c"`);
    // The two DROP slots (1, 3) now hold tasks_v first, attempts_v second.
    expect(parts[1]).toContain(`DROP VIEW "public"."tasks_v"`);
    expect(parts[3]).toContain(`DROP VIEW "public"."attempts_v"`);
  });

  test("mixed DROP+CREATE: drops reverse-topo, creates topo", () => {
    // Both views change: drizzle emits all drops then all creates, alphabetical.
    const sql = sqlOf(
      `DROP VIEW "public"."attempts_v";`,
      `\nDROP VIEW "public"."tasks_v";`,
      `\nCREATE VIEW "public"."tasks_v" AS (select * from "attempts_v");`,
      `\nCREATE VIEW "public"."attempts_v" AS (select * from "attempts");`,
    );
    const out = reorderViewStatementsInSql(sql, noPriorDefs);
    // DROP: tasks_v before attempts_v. CREATE: attempts_v before tasks_v.
    expect(out.indexOf(`DROP VIEW "public"."tasks_v"`)).toBeLessThan(
      out.indexOf(`DROP VIEW "public"."attempts_v"`),
    );
    expect(out.indexOf(`CREATE VIEW "public"."attempts_v"`)).toBeLessThan(
      out.indexOf(`CREATE VIEW "public"."tasks_v"`),
    );
    expectCanonicalBreakpoints(out);
  });

  test("three-view chain orders transitively", () => {
    // c → b → a. drizzle order c,b,a creates (wrong). Want a,b,c.
    const sql = sqlOf(
      `CREATE VIEW "public"."c_v" AS (select * from "b_v");`,
      `\nCREATE VIEW "public"."b_v" AS (select * from "a_v");`,
      `\nCREATE VIEW "public"."a_v" AS (select * from "t");`,
    );
    const out = reorderViewStatementsInSql(sql, noPriorDefs);
    const ia = out.indexOf(`CREATE VIEW "public"."a_v"`);
    const ib = out.indexOf(`CREATE VIEW "public"."b_v"`);
    const ic = out.indexOf(`CREATE VIEW "public"."c_v"`);
    expect(ia).toBeLessThan(ib);
    expect(ib).toBeLessThan(ic);
  });

  test("materialized views are handled", () => {
    const sql = sqlOf(
      `CREATE MATERIALIZED VIEW "public"."tasks_mv" AS (select * from "attempts_mv");`,
      `\nCREATE MATERIALIZED VIEW "public"."attempts_mv" AS (select * from "attempts");`,
    );
    const out = reorderViewStatementsInSql(sql, noPriorDefs);
    expect(out.indexOf(`"public"."attempts_mv"`)).toBeLessThan(
      out.indexOf(`"public"."tasks_mv"`),
    );
  });

  test("schema-qualified reference is detected", () => {
    const sql = sqlOf(
      `CREATE VIEW "public"."tasks_v" AS (select * from "public"."attempts_v");`,
      `\nCREATE VIEW "public"."attempts_v" AS (select * from "attempts");`,
    );
    const out = reorderViewStatementsInSql(sql, noPriorDefs);
    expect(out.indexOf(`"public"."attempts_v"`)).toBeLessThan(
      out.indexOf(`"public"."tasks_v"`),
    );
  });

  test("throws on a cycle", () => {
    const sql = sqlOf(
      `CREATE VIEW "public"."a_v" AS (select * from "b_v");`,
      `\nCREATE VIEW "public"."b_v" AS (select * from "a_v");`,
    );
    expect(() => reorderViewStatementsInSql(sql, noPriorDefs)).toThrow(/Cycle/);
  });

  test("already-correct order is a no-op", () => {
    const sql = sqlOf(
      `CREATE VIEW "public"."attempts_v" AS (select * from "attempts");`,
      `\nCREATE VIEW "public"."tasks_v" AS (select * from "attempts_v");`,
    );
    expect(reorderViewStatementsInSql(sql, noPriorDefs)).toBe(sql);
  });

  test("real transition: drop all four views in reverse-topo", () => {
    // Mirrors the one-time transition migration: pure drops of all 4 views,
    // only tasks_v → attempts_v is interdependent.
    const sql = sqlOf(
      `DROP VIEW "public"."agents_v";`,
      `\nDROP VIEW "public"."attempts_v";`,
      `\nDROP VIEW "public"."conversations_v";`,
      `\nDROP VIEW "public"."tasks_v";`,
    );
    const priorDefs = () =>
      new Map<string, string>([
        ["agents_v", `select "id" from "agents"`],
        ["attempts_v", `select "id" from "attempts"`],
        ["conversations_v", `select "id" from "conversations"`],
        ["tasks_v", `with x as (select 1 from "attempts_v" a) select * from "tasks"`],
      ]);
    const out = reorderViewStatementsInSql(sql, priorDefs);
    // tasks_v must be dropped before attempts_v.
    expect(out.indexOf(`DROP VIEW "public"."tasks_v"`)).toBeLessThan(
      out.indexOf(`DROP VIEW "public"."attempts_v"`),
    );
    // All four drops still present.
    for (const v of ["agents_v", "attempts_v", "conversations_v", "tasks_v"]) {
      expect(out).toContain(`DROP VIEW "public"."${v}"`);
    }
    // Serialization invariant: no marker swallows the following statement, and
    // every dropped view still begins its own line.
    expectCanonicalBreakpoints(out);
    expect(countDropViewLines(out)).toBe(4);
  });

  test("regression: first statement moved to last slot keeps its breakpoint newline", () => {
    // The exact bug: agents_v (originally FIRST) gets reordered to the LAST slot.
    // A naive rejoin glued `--> statement-breakpoint` to it with no newline,
    // commenting out the whole DROP. Here tasks_v depends on attempts_v, so the
    // reverse-topo drop order is tasks_v, conversations_v, attempts_v, agents_v —
    // i.e. agents_v (first input) ends up last.
    const sql = sqlOf(
      `DROP VIEW "public"."agents_v";`,
      `\nDROP VIEW "public"."attempts_v";`,
      `\nDROP VIEW "public"."conversations_v";`,
      `\nDROP VIEW "public"."tasks_v";`,
    );
    const priorDefs = () =>
      new Map<string, string>([
        ["agents_v", `select "id" from "agents"`],
        ["attempts_v", `select "id" from "attempts"`],
        ["conversations_v", `select "id" from "conversations"`],
        ["tasks_v", `select 1 from "attempts_v" a`],
      ]);
    const out = reorderViewStatementsInSql(sql, priorDefs);
    // No marker may be directly followed by non-newline (the reported corruption).
    expect(/statement-breakpoint(?!\n)/.test(out)).toBe(false);
    // agents_v's DROP must start its own line and remain an executable statement.
    expect(out).toMatch(/^DROP VIEW "public"\."agents_v";/m);
    // Every breakpoint marker is followed by exactly one newline.
    const markerCount = (out.match(/--> statement-breakpoint/g) ?? []).length;
    const markerNewlineCount =
      (out.match(/--> statement-breakpoint\n/g) ?? []).length;
    expect(markerNewlineCount).toBe(markerCount);
    // Drop count preserved.
    expect(countDropViewLines(out)).toBe(4);
  });

  test("preserves a leading blank line drizzle emits before the first statement", () => {
    // drizzle prefixes the file with a blank line. Reordering must keep exactly
    // one leading newline (not zero, not doubled).
    const sql =
      `\n` +
      sqlOf(
        `CREATE VIEW "public"."tasks_v" AS (select * from "attempts_v");`,
        `\nCREATE VIEW "public"."attempts_v" AS (select * from "attempts");`,
      );
    const out = reorderViewStatementsInSql(sql, noPriorDefs);
    expect(out.startsWith("\n")).toBe(true);
    expect(out.startsWith("\n\n")).toBe(false);
    expect(out.indexOf(`"public"."attempts_v"`)).toBeLessThan(
      out.indexOf(`"public"."tasks_v"`),
    );
    expectCanonicalBreakpoints(out);
  });
});
