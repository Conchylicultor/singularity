import { describe, it, expect } from "bun:test";
import { extractReadTablesFromSql } from "./client";

// A loader's read-set contains only tables it READS (FROM / JOIN). Write targets
// (INSERT INTO / UPDATE / DELETE) must never appear — they are foreign
// observability leaks captured under a loader's ambient context, never a genuine
// read dependency. These tests pin that invariant so a future regex change that
// re-admits write targets is caught here rather than as read-set attribution
// noise in the Debug → Read-set pane.
describe("extractReadTablesFromSql", () => {
  it("captures FROM and JOIN targets, dedups repeats, order-insensitive", () => {
    const sql =
      'select * from "attempts_v" a join "conversations_v" c on c.attempt_id = a.id join "conversations_v" c2 on c2.id = c.parent';
    expect(extractReadTablesFromSql(sql).sort()).toEqual(
      ["attempts_v", "conversations_v"].sort(),
    );
  });

  it("ignores INSERT INTO write targets", () => {
    const sql =
      'insert into "notifications" (id, title) values ($1, $2) on conflict (id) do update set title = $2';
    expect(extractReadTablesFromSql(sql)).toEqual([]);
  });

  it("ignores UPDATE write targets", () => {
    const sql = 'update "notifications" set read = true where id = $1';
    expect(extractReadTablesFromSql(sql)).toEqual([]);
  });

  it("ignores DELETE FROM write targets", () => {
    const sql = 'delete from "notifications" where id = $1';
    expect(extractReadTablesFromSql(sql)).toEqual([]);
  });

  it("captures reads inside a subquery", () => {
    const sql =
      'select * from "tasks_v" where id in (select task_id from "attempts_v")';
    expect(extractReadTablesFromSql(sql).sort()).toEqual(
      ["attempts_v", "tasks_v"].sort(),
    );
  });
});
