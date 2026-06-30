import { describe, expect, test } from "bun:test";
import { classifyCollisions, type MigrationGroup } from "./index";

const file = (name: string, content: string, tracked: boolean) => ({ name, content, tracked });

// Fixture contents are opaque to the classifier (it only compares byte-equality),
// so use plain placeholders — not real DDL, which would trip the
// imperative-create-table-allowlisted source check.

describe("classifyCollisions", () => {
  test("byte-identical + all-tracked -> flagged (byte-identical)", () => {
    const groups: MigrationGroup[] = [
      {
        hash: "2a407315",
        files: [
          file("20260501_182228_2a407315__add_x.sql", "sql-x", true),
          file("20260503_222323_2a407315__add_x.sql", "sql-x", true),
        ],
      },
    ];
    const flagged = classifyCollisions(groups);
    expect(flagged).toEqual([
      {
        hash: "2a407315",
        files: ["20260501_182228_2a407315__add_x.sql", "20260503_222323_2a407315__add_x.sql"],
        kind: "byte-identical",
      },
    ]);
  });

  test("differing-content + all-tracked -> not flagged (frozen true collision exemption)", () => {
    const groups: MigrationGroup[] = [
      {
        hash: "deadbeef",
        files: [
          file("20260101_000000_deadbeef__a.sql", "sql-a", true),
          file("20260102_000000_deadbeef__b.sql", "sql-b", true),
        ],
      },
    ];
    expect(classifyCollisions(groups)).toEqual([]);
  });

  test("differing-content + branch-local -> flagged (differing-branch-local)", () => {
    const groups: MigrationGroup[] = [
      {
        hash: "cafef00d",
        files: [
          file("20260101_000000_cafef00d__a.sql", "sql-a", true),
          file("20260102_000000_cafef00d__b.sql", "sql-b", false),
        ],
      },
    ];
    const flagged = classifyCollisions(groups);
    expect(flagged).toEqual([
      {
        hash: "cafef00d",
        files: ["20260101_000000_cafef00d__a.sql", "20260102_000000_cafef00d__b.sql"],
        kind: "differing-branch-local",
      },
    ]);
  });

  test("single file per hash -> not flagged", () => {
    const groups: MigrationGroup[] = [
      { hash: "11111111", files: [file("20260101_000000_11111111__a.sql", "sql-a", true)] },
      { hash: "22222222", files: [file("20260102_000000_22222222__b.sql", "sql-b", false)] },
    ];
    expect(classifyCollisions(groups)).toEqual([]);
  });

  test("byte-identical takes precedence even when a member is branch-local", () => {
    const groups: MigrationGroup[] = [
      {
        hash: "33333333",
        files: [
          file("20260101_000000_33333333__a.sql", "sql-a", true),
          file("20260102_000000_33333333__a.sql", "sql-a", false),
        ],
      },
    ];
    expect(classifyCollisions(groups)[0]!.kind).toBe("byte-identical");
  });
});
