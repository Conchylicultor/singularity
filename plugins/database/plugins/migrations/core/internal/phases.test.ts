import { describe, expect, test } from "bun:test";
import {
  mergeSnapshotParents,
  migrationClaimId,
  parseMigration,
  renderMergeSnapshotMigration,
  renderPhasedMigration,
} from "./phases";

describe("phased migration grammar", () => {
  test("render → parse round-trips", () => {
    const m = {
      expand: 'CREATE INDEX IF NOT EXISTS "i" ON "x" ("id");',
      contract: 'ALTER TABLE "a" DROP COLUMN IF EXISTS "b";',
      claims: ["20260927_182347__remap_saved_icons_to_symbols"],
    };
    expect(parseMigration(renderPhasedMigration(m))).toEqual({
      kind: "phased",
      ...m,
    });
  });

  test("empty sections and no claims round-trip", () => {
    const m = { expand: "", contract: 'DROP TABLE "q" CASCADE;', claims: [] };
    expect(parseMigration(renderPhasedMigration(m))).toEqual({
      kind: "phased",
      ...m,
    });
  });

  test("a file without the header is legacy", () => {
    const sql = 'ALTER TABLE "agents" ADD COLUMN "x" text;';
    expect(parseMigration(sql)).toEqual({ kind: "legacy", sql });
  });

  test("a phased file missing a marker throws rather than reading as legacy", () => {
    expect(() =>
      parseMigration("-- singularity:phase expand\nDROP INDEX x;\n"),
    ).toThrow(/malformed/);
  });

  test("markers out of order throw", () => {
    expect(() =>
      parseMigration(
        "-- singularity:phase expand\n-- singularity:claims\n-- singularity:phase contract\n",
      ),
    ).toThrow(/malformed/);
  });

  test("a malformed claim throws", () => {
    expect(() =>
      parseMigration(
        "-- singularity:phase expand\n-- singularity:phase contract\n-- singularity:claims\n-- nope\n",
      ),
    ).toThrow(/malformed migration claim/);
  });

  test("claim id drops the content hash", () => {
    expect(
      migrationClaimId(
        "20260927_182347_81e713f0__remap_saved_icons_to_symbols.sql",
      ),
    ).toBe("20260927_182347__remap_saved_icons_to_symbols");
  });
});

describe("merge-snapshot header", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  test("a merge node is an empty phased migration behind its header", () => {
    const sql = renderMergeSnapshotMigration([A, B]);
    expect(sql.split("\n")[0]).toBe(
      `-- singularity:merge-snapshot parents=${A},${B}`,
    );
    expect(mergeSnapshotParents(sql)).toEqual([A, B]);
    expect(parseMigration(sql)).toEqual({
      kind: "phased",
      expand: "",
      contract: "",
      claims: [],
    });
  });

  test("any other migration has no merge parents", () => {
    expect(mergeSnapshotParents("SELECT 1;")).toBeNull();
    expect(
      mergeSnapshotParents(
        renderPhasedMigration({ expand: "", contract: "", claims: [] }),
      ),
    ).toBeNull();
  });

  test("a malformed header throws rather than dropping the edge", () => {
    expect(() =>
      mergeSnapshotParents(`-- singularity:merge-snapshot parents=${A}\n`),
    ).toThrow(/malformed/);
    expect(() =>
      mergeSnapshotParents("-- singularity:merge-snapshot parents=x,y\n"),
    ).toThrow(/malformed/);
  });

  test("a header over a legacy body throws", () => {
    expect(() =>
      parseMigration(
        `-- singularity:merge-snapshot parents=${A},${B}\nSELECT 1;\n`,
      ),
    ).toThrow(/must be phased/);
    expect(() =>
      parseMigration(`-- singularity:merge-snapshot parents=${A},${B}`),
    ).toThrow(/must be phased/);
  });

  test("fewer than two parents cannot be rendered", () => {
    expect(() => renderMergeSnapshotMigration([A])).toThrow(/at least two/);
  });
});
