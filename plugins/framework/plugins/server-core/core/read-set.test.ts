// The runtime-owned loader → table read-set (`./read-set`): the union the legacy
// change router inverts, the per-run capture the L2 persist seam stores, and the
// version counter the router memoizes on. Module state is process-wide, so each
// test uses its own keys.
import { describe, expect, test } from "bun:test";
import {
  getLastLoaderReadSet,
  getReadSetIndex,
  readSetOf,
  readSetVersion,
  recordLoaderReadSet,
  removeReadSetTable,
  seedReadSetIndex,
} from "./read-set";

describe("read-set — union vs per-run capture", () => {
  test("the index unions every run; the per-run capture is only the LAST run", () => {
    recordLoaderReadSet(
      "u-attempts",
      new Set(["attempts_v", "conversations_v"]),
    );
    recordLoaderReadSet("u-attempts", new Set(["attempts_v"]));
    expect(readSetOf("u-attempts")).toEqual(["attempts_v", "conversations_v"]);
    expect(getLastLoaderReadSet("u-attempts")).toEqual(["attempts_v"]);
  });

  test("a run that read nothing changes neither", () => {
    recordLoaderReadSet("u-p", new Set(["p_table"]));
    recordLoaderReadSet("u-p", new Set());
    expect(readSetOf("u-p")).toEqual(["p_table"]);
    expect(getLastLoaderReadSet("u-p")).toEqual(["p_table"]);
  });

  test("undefined per-run capture and [] read-set for a key no loader ran", () => {
    expect(getLastLoaderReadSet("u-never-ran")).toBeUndefined();
    expect(readSetOf("u-never-ran")).toEqual([]);
  });
});

describe("read-set — version counter (the router's memo key)", () => {
  test("moves on a new edge, never on a re-read of known tables", () => {
    const v0 = readSetVersion();
    recordLoaderReadSet("v-k", new Set(["t1"]));
    const v1 = readSetVersion();
    expect(v1).toBeGreaterThan(v0);
    recordLoaderReadSet("v-k", new Set(["t1"]));
    expect(readSetVersion()).toBe(v1);
  });

  // The size-based signature it replaced could not see this: one table out, one
  // in, the same total size — and a stale inversion kept routing to the old one.
  test("moves on a removal, even one a later addition balances in size", () => {
    recordLoaderReadSet("v-a", new Set(["x"]));
    const before = readSetVersion();
    removeReadSetTable("x", []);
    recordLoaderReadSet("v-a", new Set(["y"]));
    expect(readSetVersion()).toBeGreaterThan(before);
    expect(readSetOf("v-a")).toEqual(["y"]);
  });

  test("moves on a seed that adds an edge; an empty seed entry adds nothing", () => {
    const before = readSetVersion();
    seedReadSetIndex({ "v-seeded": ["s_table"], "v-empty": [] });
    expect(readSetVersion()).toBeGreaterThan(before);
    expect(readSetOf("v-seeded")).toEqual(["s_table"]);
    expect("v-empty" in getReadSetIndex()).toBe(false);
  });
});

describe("read-set — removeReadSetTable", () => {
  test("evicts a mis-attributed table from non-kept keys, leaving kept keys untouched", () => {
    seedReadSetIndex({
      "r-attempts": ["attempts_v", "r-notifications"],
      "r-notifications": ["r-notifications"],
    });
    const changed = removeReadSetTable("r-notifications", ["r-notifications"]);
    expect(changed).toEqual(["r-attempts"]);
    const index = getReadSetIndex();
    expect(index["r-attempts"]).toEqual(["attempts_v"]);
    expect(index["r-notifications"]).toEqual(["r-notifications"]); // kept
  });

  test("a removal that changes nothing leaves the version alone", () => {
    const before = readSetVersion();
    expect(removeReadSetTable("r-no-such-table", [])).toEqual([]);
    expect(readSetVersion()).toBe(before);
  });
});
