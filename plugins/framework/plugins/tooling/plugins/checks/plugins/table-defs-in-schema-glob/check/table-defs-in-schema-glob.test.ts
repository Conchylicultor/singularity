/**
 * Unit tests for the pure path-classification helpers of the
 * `table-defs-in-schema-glob` check: the drizzle-config glob parser and the
 * candidate predicate that decides which server files are in scope.
 *
 * Run with `bun test` from the repo root.
 */

import { test, expect } from "bun:test";
import { parseSchemaGlobs } from "@plugins/database/plugins/migrations/core";
import {
  isCandidatePath,
  parseImperativeTableNameConsts,
  isImperativeReadHandle,
} from "./index";

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

// --- imperative-table read-handle exemption ---

const IMPERATIVE_TABLES_SOURCE = `
export const MIGRATIONS_TABLE_NAME = "__singularity_migrations";
export const TASK_LATEST_CONVERSATION_TABLE = "task_latest_conversation";
export const IMPERATIVE_PUBLIC_TABLES: readonly string[] = [
  MIGRATIONS_TABLE_NAME,
  DERIVED_VIEW_STATE_TABLE_NAME,
  TASK_LATEST_CONVERSATION_TABLE,
];
`;

test("parseImperativeTableNameConsts extracts the listed name constants", () => {
  expect(parseImperativeTableNameConsts(IMPERATIVE_TABLES_SOURCE)).toEqual(
    new Set(["MIGRATIONS_TABLE_NAME", "DERIVED_VIEW_STATE_TABLE_NAME", "TASK_LATEST_CONVERSATION_TABLE"]),
  );
});

test("parseImperativeTableNameConsts returns empty (fail closed) when the array is absent", () => {
  expect(parseImperativeTableNameConsts("export const x = 1;").size).toBe(0);
});

const names = parseImperativeTableNameConsts(IMPERATIVE_TABLES_SOURCE);

test("a pgTable read handle on an imperative name constant is exempt", () => {
  expect(
    isImperativeReadHandle(
      "export const _task_latest_conversation = pgTable(TASK_LATEST_CONVERSATION_TABLE, {",
      names,
    ),
  ).toBe(true);
});

test("a pgTable on a non-imperative identifier is NOT exempt", () => {
  expect(isImperativeReadHandle("export const x = pgTable(SOME_OTHER_TABLE, {", names)).toBe(false);
});

test("a pgTable with a string-literal name is NOT exempt", () => {
  expect(isImperativeReadHandle('export const x = pgTable("agents", {', names)).toBe(false);
});
