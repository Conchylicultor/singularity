import { describe, expect, test } from "bun:test";
import {
  migrationClaimId,
  parseMigration,
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
