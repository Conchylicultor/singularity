/**
 * Unit tests for the pure set-diff helper behind the
 * `database-migrations:drizzle-config-schema-globs` check.
 *
 * The check's job is to prove drizzle.config.ts's evaluated `schema:` array
 * equals SCHEMA_GLOBS; `diffGlobSets` is the comparison, working on already-
 * resolved absolute paths so the two anchors are normalised away.
 *
 * Run with `bun test` from the repo root.
 */

import { test, expect } from "bun:test";
import { diffGlobSets } from "./drizzle-config-schema-globs";

const EXPECTED = [
  "/repo/plugins/**/server/**/internal/tables.ts",
  "/repo/plugins/**/server/**/internal/tables-*.ts",
  "/repo/plugins/**/server/**/internal/schema.ts",
  "/repo/plugins/**/server/**/internal/schema-*.ts",
];

test("identical sets diff to nothing", () => {
  expect(diffGlobSets([...EXPECTED], EXPECTED)).toEqual({ missing: [], extra: [] });
});

test("order does not matter — these are SETS", () => {
  expect(diffGlobSets([...EXPECTED].reverse(), EXPECTED)).toEqual({ missing: [], extra: [] });
});

test("a pattern dropped from the config is reported as missing", () => {
  // The silent partial-DROP direction: drizzle-kit would never see schema-*.ts.
  expect(diffGlobSets(EXPECTED.slice(0, 3), EXPECTED)).toEqual({
    missing: ["/repo/plugins/**/server/**/internal/schema-*.ts"],
    extra: [],
  });
});

test("a pattern added only to the config is reported as extra", () => {
  expect(diffGlobSets([...EXPECTED, "/repo/plugins/**/server/**/internal/extra.ts"], EXPECTED)).toEqual({
    missing: [],
    extra: ["/repo/plugins/**/server/**/internal/extra.ts"],
  });
});

test("a swapped pattern is reported on BOTH sides", () => {
  const config = [...EXPECTED.slice(0, 3), "/repo/plugins/**/server/**/internal/other-*.ts"];
  expect(diffGlobSets(config, EXPECTED)).toEqual({
    missing: ["/repo/plugins/**/server/**/internal/schema-*.ts"],
    extra: ["/repo/plugins/**/server/**/internal/other-*.ts"],
  });
});

test("an empty config schema reports every expected pattern as missing", () => {
  expect(diffGlobSets([], EXPECTED).missing).toEqual([...EXPECTED].sort());
});
