import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  classifyBranchLocal,
  findResetUnstablePairs,
  type BranchLocalMigration,
} from "./data-migration-reset-stable";

/** Terse fixture builders — `s` is a schema migration, `d` a data migration. */
const s = (name: string): BranchLocalMigration => ({ name, isSchema: true });
const d = (name: string): BranchLocalMigration => ({ name, isSchema: false });

// Realistic names: the runner sorts on the `YYYYMMDD_HHMMSS_<sha8>__` prefix.
const T1 = "20260808_010000_aaaaaaaa__create_thing.sql";
const T2 = "20260808_020000_bbbbbbbb__backfill_thing.sql";
const T3 = "20260808_030000_cccccccc__drop_old_thing.sql";
const T4 = "20260808_040000_dddddddd__backfill_other.sql";

describe("findResetUnstablePairs", () => {
  test("data before schema is stable — the reset only pushes schema later", () => {
    expect(findResetUnstablePairs([d(T1), s(T2)])).toEqual([]);
  });

  test("data after schema is flagged, naming both files", () => {
    expect(findResetUnstablePairs([s(T1), d(T2)])).toEqual([
      { dataMigration: T2, afterSchemaMigration: T1 },
    ]);
  });

  test("the schema→data→schema sequence is flagged on its middle backfill", () => {
    expect(findResetUnstablePairs([s(T1), d(T2), s(T3)])).toEqual([
      { dataMigration: T2, afterSchemaMigration: T1 },
    ]);
  });

  test("every offending backfill is reported, all against the EARLIEST schema migration", () => {
    expect(findResetUnstablePairs([s(T1), d(T2), s(T3), d(T4)])).toEqual([
      { dataMigration: T2, afterSchemaMigration: T1 },
      { dataMigration: T4, afterSchemaMigration: T1 },
    ]);
  });

  test("input order does not matter — the verdict is on timestamp order", () => {
    expect(findResetUnstablePairs([d(T4), s(T3), d(T2), s(T1)])).toEqual([
      { dataMigration: T2, afterSchemaMigration: T1 },
      { dataMigration: T4, afterSchemaMigration: T1 },
    ]);
  });

  test("data migrations only — nothing to reorder against", () => {
    expect(findResetUnstablePairs([d(T1), d(T2)])).toEqual([]);
  });

  test("schema migrations only — no backfill to strand", () => {
    expect(findResetUnstablePairs([s(T1), s(T2)])).toEqual([]);
  });

  test("empty branch (no branch-local migrations at all) passes", () => {
    expect(findResetUnstablePairs([])).toEqual([]);
  });

  // The caller filters tracked files out before calling, so a migration already
  // on main never appears here. Pinned as the contract that makes that filtering
  // load-bearing: a tracked schema migration is immutable and never restamped, so
  // a later branch-local backfill reading it is legitimate.
  test("only the branch-local set is judged (tracked files are the caller's filter)", () => {
    const branchLocalOnly = [d(T4)];
    expect(findResetUnstablePairs(branchLocalOnly)).toEqual([]);
  });
});

/**
 * A fixture `data/` + `data/meta/`: `schema` names get a sibling snapshot (which
 * is what makes them schema migrations), `data` names do not.
 */
function fixture(names: { schema?: string[]; data?: string[] }): {
  dataDir: string;
  metaDir: string;
} {
  const dataDir = mkdtempSync(join(tmpdir(), "reset-stable-"));
  const metaDir = join(dataDir, "meta");
  mkdirSync(metaDir);
  for (const n of names.schema ?? []) {
    writeFileSync(join(dataDir, n), "-- ddl");
    writeFileSync(join(metaDir, `${n.slice(0, -4)}_snapshot.json`), "{}");
  }
  for (const n of names.data ?? []) writeFileSync(join(dataDir, n), "-- dml");
  return { dataDir, metaDir };
}

describe("classifyBranchLocal", () => {
  test("snapshot presence is what makes a migration a schema migration", () => {
    const { dataDir, metaDir } = fixture({ schema: [T1], data: [T2] });
    expect(
      classifyBranchLocal(dataDir, metaDir, new Set()).sort((a, b) =>
        a.name < b.name ? -1 : 1,
      ),
    ).toEqual([
      { name: T1, isSchema: true },
      { name: T2, isSchema: false },
    ]);
  });

  test("files tracked on main are excluded from the branch-local set", () => {
    const { dataDir, metaDir } = fixture({ schema: [T1], data: [T2] });
    expect(classifyBranchLocal(dataDir, metaDir, new Set([T1]))).toEqual([
      { name: T2, isSchema: false },
    ]);
  });

  test("non-migration files in data/ are ignored", () => {
    const { dataDir, metaDir } = fixture({ data: [T2] });
    writeFileSync(join(dataDir, "README.md"), "notes");
    writeFileSync(join(dataDir, "0NaN_half_generated.sql"), "-- mid-generate");
    expect(classifyBranchLocal(dataDir, metaDir, new Set())).toEqual([
      { name: T2, isSchema: false },
    ]);
  });

  // The end-to-end the unit tests above only cover in halves: a real directory
  // in the schema→data order flows through classification into a flagged pair.
  test("a real data/ dir in the unsafe order produces the flagged pair", () => {
    const { dataDir, metaDir } = fixture({ schema: [T1, T3], data: [T2] });
    expect(
      findResetUnstablePairs(classifyBranchLocal(dataDir, metaDir, new Set())),
    ).toEqual([{ dataMigration: T2, afterSchemaMigration: T1 }]);
  });

  test("the same dir is clean once the schema migrations are already on main", () => {
    const { dataDir, metaDir } = fixture({ schema: [T1, T3], data: [T2] });
    const tracked = new Set([T1, T3]);
    expect(
      findResetUnstablePairs(classifyBranchLocal(dataDir, metaDir, tracked)),
    ).toEqual([]);
  });
});
