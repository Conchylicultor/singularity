import { describe, expect, test } from "bun:test";
import { activeLineUuids } from "./branch-filter";

// Shorthand: a line is {uuid, parentUuid}. File order = array order.
const ln = (uuid: string, parentUuid: string | null) => ({ uuid, parentUuid });

describe("activeLineUuids", () => {
  test("linear chain keeps every line", () => {
    const lines = [ln("a", null), ln("b", "a"), ln("c", "b")];
    expect(activeLineUuids(lines)).toEqual(new Set(["a", "b", "c"]));
  });

  test("empty / uuid-less input keeps nothing (caller passes those through)", () => {
    expect(activeLineUuids([])).toEqual(new Set());
    expect(activeLineUuids([{ type: "permission-mode" } as never])).toEqual(new Set());
  });

  test("rewind branch: drops the abandoned subtree, keeps the resubmitted path", () => {
    // a → b ; then b branches: c1→d1 (abandoned, earlier) and c2→d2 (kept, later)
    const lines = [
      ln("a", null),
      ln("b", "a"),
      ln("c1", "b"), // abandoned attempt
      ln("d1", "c1"),
      ln("c2", "b"), // resubmitted branch (appended later → active)
      ln("d2", "c2"),
    ];
    expect(activeLineUuids(lines)).toEqual(new Set(["a", "b", "c2", "d2"]));
  });

  test("the abandoned branch can be longer than the kept one", () => {
    // The active leaf is the highest-index node, not the deepest branch.
    const lines = [
      ln("a", null),
      ln("b", "a"),
      ln("long1", "b"),
      ln("long2", "long1"),
      ln("long3", "long2"), // long abandoned branch
      ln("short1", "b"), // shorter, but appended last → active
    ];
    expect(activeLineUuids(lines)).toEqual(new Set(["a", "b", "short1"]));
  });

  test("multiple disjoint roots (resume / compaction) are all kept", () => {
    // Two independent trees in one file — both segments are real history.
    const lines = [
      ln("r1", null),
      ln("r1b", "r1"),
      ln("r2", null), // new root: resumed/compacted segment
      ln("r2b", "r2"),
      ln("r2c", "r2b"),
    ];
    expect(activeLineUuids(lines)).toEqual(new Set(["r1", "r1b", "r2", "r2b", "r2c"]));
  });

  test("a rewind inside a later segment only prunes that segment", () => {
    const lines = [
      ln("r1", null),
      ln("r1b", "r1"),
      ln("r2", null),
      ln("x1", "r2"), // abandoned in segment 2
      ln("x2", "r2"), // kept in segment 2
    ];
    expect(activeLineUuids(lines)).toEqual(new Set(["r1", "r1b", "r2", "x2"]));
  });

  test("dangling parent (ref into a prior transcript) is treated as a root", () => {
    const lines = [ln("a", "not-in-file"), ln("b", "a")];
    expect(activeLineUuids(lines)).toEqual(new Set(["a", "b"]));
  });

  test("a cyclic chain cannot loop forever", () => {
    const lines = [ln("a", "b"), ln("b", "a")];
    // Both reference each other; the guard terminates and keeps the reachable path.
    expect(activeLineUuids(lines).size).toBeGreaterThan(0);
  });
});
