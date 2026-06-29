import { describe, expect, test } from "bun:test";
import { planMigrations } from "./runner";

interface Migration {
  file: string;
  hash: string;
  sortKey: string;
  sqlText: string;
}

// Build a Migration inline, mirroring listMigrationFiles's shape.
function mig(date: string, time: string, hash: string, slug: string, sql: string): Migration {
  return {
    file: `${date}_${time}_${hash}__${slug}.sql`,
    hash,
    sortKey: `${date}${time}`,
    sqlText: sql,
  };
}

describe("planMigrations", () => {
  test("two byte-identical-hash files (the real bug): the second is a same-run duplicate", () => {
    // Exactly the improve_pending_queue_top case: an add migration that recurs
    // byte-identical at a later timestamp (DDL elided — planMigrations ignores
    // sqlText; what matters is that both files carry the same sha8).
    const ddl = `-- identical recurring DDL`;
    const first = mig("20260501", "182228", "2a407315", "add_improve_pending_queue_top", ddl);
    const second = mig("20260503", "222323", "2a407315", "add_improve_pending_queue_top", ddl);

    const { toApply, skippedDuplicates } = planMigrations([first, second], new Set());

    expect(toApply).toEqual([first]);
    expect(skippedDuplicates).toEqual([{ file: second.file, original: first.file }]);
  });

  test("a hash already in appliedHashes is a normal prior-boot skip, not a collision", () => {
    const a = mig("20260101", "000000", "aaaaaaaa", "a", "SELECT 1");
    const b = mig("20260102", "000000", "bbbbbbbb", "b", "SELECT 2");

    const { toApply, skippedDuplicates } = planMigrations([a, b], new Set(["aaaaaaaa"]));

    // `a` is excluded from toApply (already applied)...
    expect(toApply).toEqual([b]);
    // ...and is NOT reported as a same-run duplicate (it's a normal skip).
    expect(skippedDuplicates).toEqual([]);
  });

  test("a prior-applied file still makes a later byte-identical sibling a duplicate", () => {
    const ddl = `-- identical recurring DDL for x`;
    const first = mig("20260101", "000000", "2a407315", "add_x", ddl);
    const second = mig("20260102", "000000", "2a407315", "add_x", ddl);

    // first already in the ledger from a prior boot.
    const { toApply, skippedDuplicates } = planMigrations(
      [first, second],
      new Set(["2a407315"]),
    );

    expect(toApply).toEqual([]);
    expect(skippedDuplicates).toEqual([{ file: second.file, original: first.file }]);
  });

  test("normal distinct-hash migrations: all applied, none skipped", () => {
    const a = mig("20260101", "000000", "aaaaaaaa", "a", "SELECT 1");
    const b = mig("20260102", "000000", "bbbbbbbb", "b", "SELECT 2");
    const c = mig("20260103", "000000", "cccccccc", "c", "SELECT 3");

    const { toApply, skippedDuplicates } = planMigrations([a, b, c], new Set());

    expect(toApply).toEqual([a, b, c]);
    expect(skippedDuplicates).toEqual([]);
  });
});
