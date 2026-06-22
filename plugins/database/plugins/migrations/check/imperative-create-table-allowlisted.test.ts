import { describe, expect, test } from "bun:test";
import type { CodeMatch } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { findOffenders, parseAllowlistIdentifiers } from "./imperative-create-table-allowlisted";

const SAMPLE_ALLOWLIST_SRC = `
export const MIGRATIONS_TABLE_NAME = "__singularity_migrations";
export const DERIVED_VIEW_STATE_TABLE_NAME = "derived_view_state";
export const LIVE_STATE_SNAPSHOT_TABLE = "live_state_snapshot";

export const IMPERATIVE_PUBLIC_TABLES: readonly string[] = [
  MIGRATIONS_TABLE_NAME,
  DERIVED_VIEW_STATE_TABLE_NAME,
  LIVE_STATE_SNAPSHOT_TABLE,
];
`;

const m = (path: string, line: number, text: string): CodeMatch => ({ path, line, text });

// Real DDL lines are spelled with the keyword split so this source file never
// contains the literal token the check greps for (belt-and-suspenders; the file
// is also exempt via ALLOWED_PATHS).
const CT = "CREATE " + "TABLE";

describe("parseAllowlistIdentifiers", () => {
  test("extracts the identifier names listed in the array literal", () => {
    expect(parseAllowlistIdentifiers(SAMPLE_ALLOWLIST_SRC)).toEqual(
      new Set(["MIGRATIONS_TABLE_NAME", "DERIVED_VIEW_STATE_TABLE_NAME", "LIVE_STATE_SNAPSHOT_TABLE"]),
    );
  });

  test("ignores constants that are defined but NOT in the array", () => {
    const src = `
export const FOO_TABLE = "foo";
export const BAR_TABLE = "bar";
export const IMPERATIVE_PUBLIC_TABLES: readonly string[] = [FOO_TABLE];
`;
    expect(parseAllowlistIdentifiers(src)).toEqual(new Set(["FOO_TABLE"]));
  });

  test("throws when the array is missing", () => {
    expect(() => parseAllowlistIdentifiers("export const x = 1;")).toThrow();
  });

  test("throws when the array is empty (would enforce a vacuous allowlist)", () => {
    expect(() =>
      parseAllowlistIdentifiers("export const IMPERATIVE_PUBLIC_TABLES: readonly string[] = [];"),
    ).toThrow();
  });
});

describe("findOffenders", () => {
  const ids = new Set(["MIGRATIONS_TABLE_NAME", "LIVE_STATE_SNAPSHOT_TABLE"]);

  test("passes a line that names an allowlist constant", () => {
    const matches = [
      m("plugins/database/plugins/migrations/server/internal/runner.ts", 63, `    ${CT} IF NOT EXISTS \${drizzleSql.raw(MIGRATIONS_TABLE_NAME)} (`),
      m("plugins/database/plugins/live-state-snapshot/server/internal/tables-ddl.ts", 18, `${CT} IF NOT EXISTS \${LIVE_STATE_SNAPSHOT_TABLE} (`),
    ];
    expect(findOffenders(matches, ids)).toEqual([]);
  });

  test("flags a bare CREATE TABLE with a literal name", () => {
    const matches = [m("plugins/database/plugins/migrations/server/internal/x.ts", 10, `  ${CT} IF NOT EXISTS rogue_tbl (id int)`)];
    expect(findOffenders(matches, ids)).toEqual([
      "plugins/database/plugins/migrations/server/internal/x.ts:10:" + `${CT} IF NOT EXISTS rogue_tbl (id int)`,
    ]);
  });

  test("flags a CREATE TABLE using a non-allowlist constant", () => {
    const matches = [m("plugins/database/plugins/migrations/server/internal/x.ts", 5, `${CT} IF NOT EXISTS \${SOME_OTHER_CONST} (`)];
    expect(findOffenders(matches, ids).length).toBe(1);
  });

  test("flags CREATE UNLOGGED TABLE without an allowlist constant", () => {
    const matches = [m("plugins/database/plugins/migrations/server/internal/x.ts", 7, `CREATE UNLOGGED ${"TABLE"} scratch (id int)`)];
    expect(findOffenders(matches, ids).length).toBe(1);
  });

  test("does not require a full-word identifier match on a substring collision", () => {
    // A constant that merely CONTAINS an allowlist id as a substring must not pass.
    const matches = [m("plugins/database/plugins/migrations/server/internal/x.ts", 9, `${CT} IF NOT EXISTS \${XMIGRATIONS_TABLE_NAMEX} (`)];
    expect(findOffenders(matches, ids).length).toBe(1);
  });

  test("exempts this check's own test fixture path", () => {
    const matches = [
      m(
        "plugins/database/plugins/migrations/check/imperative-create-table-allowlisted.test.ts",
        1,
        `${CT} foo (id int)`,
      ),
    ];
    expect(findOffenders(matches, ids)).toEqual([]);
  });
});
