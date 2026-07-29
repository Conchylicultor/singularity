import { describe, expect, test } from "bun:test";
import { assertNoReservedColumns, extensionIndexName } from "./index-names";

describe("extensionIndexName", () => {
  test("derives <table>_<suffix>_idx", () => {
    expect(extensionIndexName("tasks_ext_prompt_block", "block_created")).toBe(
      "tasks_ext_prompt_block_block_created_idx",
    );
  });

  test("accepts digits and underscores in the suffix", () => {
    expect(extensionIndexName("tasks_ext_health_review", "review_id2")).toBe(
      "tasks_ext_health_review_review_id2_idx",
    );
  });

  test.each([
    ["empty", ""],
    ["uppercase", "blockCreated"],
    ["hyphen", "block-created"],
    ["dot", "block.created"],
    ["space", "block created"],
  ])("rejects a %s suffix", (_label, suffix) => {
    expect(() => extensionIndexName("tasks_ext_prompt_block", suffix)).toThrow(
      /defineExtension\("tasks_ext_prompt_block"\)/,
    );
  });

  test("names the offending suffix in the error", () => {
    expect(() => extensionIndexName("tasks_ext_x", "Block-Created")).toThrow(
      /"Block-Created"/,
    );
  });

  // Postgres truncates past 63 BYTES rather than erroring, so the throw is the
  // only thing standing between a long name and a silent collision.
  test("throws when the derived name exceeds 63 bytes", () => {
    // 50 + 1 + 20 + 4 = 75 bytes.
    const tableName = "a".repeat(50);
    const suffix = "b".repeat(20);
    const name = `${tableName}_${suffix}_idx`;
    expect(name.length).toBe(75);
    expect(() => extensionIndexName(tableName, suffix)).toThrow(
      new RegExp(`"${name}" is 75 bytes`),
    );
  });

  test("allows a name of exactly 63 bytes", () => {
    // 40 + 1 + 18 + 4 = 63 bytes.
    const tableName = "a".repeat(40);
    const suffix = "b".repeat(18);
    expect(extensionIndexName(tableName, suffix)).toHaveLength(63);
  });

  // The limit is bytes, not chars: multi-byte table names must be measured as
  // Postgres measures them.
  test("measures bytes, not characters", () => {
    // 30 two-byte chars = 60 bytes, + "_" + "b" + "_idx" = 66 bytes, but only
    // 36 characters — a `.length` check would wrongly let this through.
    const tableName = "é".repeat(30);
    expect(() => extensionIndexName(tableName, "b")).toThrow(/66 bytes/);
  });
});

describe("assertNoReservedColumns", () => {
  test.each(["parentId", "createdAt", "updatedAt"])(
    "throws when the columns record declares %s",
    (key) => {
      expect(() =>
        assertNoReservedColumns("tasks_ext_thing", { [key]: {} }),
      ).toThrow(
        new RegExp(
          `defineExtension\\("tasks_ext_thing"\\): column "${key}" is reserved`,
        ),
      );
    },
  );

  test("passes a normal column record", () => {
    expect(() =>
      assertNoReservedColumns("tasks_ext_prompt_block", {
        pageId: {},
        blockId: {},
      }),
    ).not.toThrow();
  });

  test("passes an empty column record", () => {
    expect(() => assertNoReservedColumns("tasks_ext_marker", {})).not.toThrow();
  });
});
