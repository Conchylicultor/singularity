/**
 * Unit tests for the pure path-classification helpers of the
 * `table-defs-in-schema-glob` check: the drizzle-config glob parser and the
 * candidate predicate that decides which server files are in scope.
 *
 * Run with `bun test` from the repo root.
 */

import { test, expect } from "bun:test";
import { parseSchemaGlobs, isCandidatePath } from "./index";

const DRIZZLE_CONFIG_SCHEMA = `
export default defineConfig({
  dialect: "postgresql",
  schema: [
    "../../../../plugins/**/server/**/internal/tables.ts",
    "../../../../plugins/**/server/**/internal/tables-*.ts",
    "../../../../plugins/**/server/**/internal/schema.ts",
    "../../../../plugins/**/server/**/internal/schema-*.ts",
  ],
  out: "./data",
});
`;

test("parseSchemaGlobs extracts the four schema globs", () => {
  expect(parseSchemaGlobs(DRIZZLE_CONFIG_SCHEMA)).toEqual([
    "../../../../plugins/**/server/**/internal/tables.ts",
    "../../../../plugins/**/server/**/internal/tables-*.ts",
    "../../../../plugins/**/server/**/internal/schema.ts",
    "../../../../plugins/**/server/**/internal/schema-*.ts",
  ]);
});

test("parseSchemaGlobs returns null when the array is absent", () => {
  expect(parseSchemaGlobs("export default defineConfig({ dialect: 'postgresql' });")).toBeNull();
});

// Sample paths use the real `improve` plugin so the `plugin-refs-resolve` check
// (which validates every `plugins/...` string literal repo-wide) stays happy —
// the predicate itself only cares about path structure + the supplied globFiles.
// A glob-matched schema file (would be in globFiles) is NOT a candidate.
const globFiles = new Set(["plugins/improve/server/internal/tables.ts"]);

test("a glob-matched tables.ts path is excluded (not a candidate)", () => {
  expect(isCandidatePath("plugins/improve/server/internal/tables.ts", globFiles)).toBe(false);
});

test("a non-glob server file is an in-scope candidate", () => {
  expect(isCandidatePath("plugins/improve/server/internal/helpers.ts", globFiles)).toBe(true);
});

test("a factory-body server file is a candidate (excluded later by FACTORY_DEFINITION_FILES, not the predicate)", () => {
  // The predicate only knows about globFiles; factory bodies are non-glob server
  // files, so they ARE candidates here and must be filtered separately.
  expect(
    isCandidatePath("plugins/infra/plugins/attachments/server/internal/define-link.ts", globFiles),
  ).toBe(true);
});

test("a .test.ts server file is out of scope", () => {
  expect(isCandidatePath("plugins/improve/server/internal/helpers.test.ts", globFiles)).toBe(false);
});

test("a __tests__ server file is out of scope", () => {
  expect(isCandidatePath("plugins/improve/server/__tests__/helpers.ts", globFiles)).toBe(false);
});

test("a non-server file is out of scope", () => {
  expect(isCandidatePath("plugins/improve/web/internal/tables.ts", globFiles)).toBe(false);
});
