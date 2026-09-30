import { describe, expect, test } from "bun:test";
import {
  analyzeSnapshotDag,
  NULL_SNAPSHOT_ID,
  snapshotAncestors,
  type SnapshotNode,
} from "./snapshot-dag";

const node = (
  file: string,
  id: string,
  prevId: string,
  mergeParents: string[] | null = null,
): SnapshotNode => ({ file, id, prevId, mergeParents });

const kinds = (nodes: SnapshotNode[]) =>
  analyzeSnapshotDag(nodes).problems.map((p) => p.kind);

describe("analyzeSnapshotDag", () => {
  test("a linear chain is healthy", () => {
    const dag = analyzeSnapshotDag([
      node("1", "a", NULL_SNAPSHOT_ID),
      node("2", "b", "a"),
      node("3", "c", "b"),
    ]);
    expect(dag.problems).toEqual([]);
    expect(dag.tips.map((t) => t.id)).toEqual(["c"]);
  });

  test("a Y-fork without a merge node has two tips", () => {
    expect(
      analyzeSnapshotDag([
        node("1", "a", NULL_SNAPSHOT_ID),
        node("2", "p", "a"),
        node("3", "u", "a"),
      ]).problems,
    ).toEqual([{ kind: "multiple-tips", files: ["2", "3"] }]);
  });

  test("a merge node joins the fork: one root, one tip", () => {
    const nodes = [
      node("1", "a", NULL_SNAPSHOT_ID),
      node("2", "p", "a"),
      node("3", "u", "a"),
      node("4", "m", "u", ["p", "u"]),
      node("5", "next", "m"),
    ];
    const dag = analyzeSnapshotDag(nodes);
    expect(dag.problems).toEqual([]);
    expect(dag.tips.map((t) => t.id)).toEqual(["next"]);
    expect([...snapshotAncestors(dag, "m")].sort()).toEqual([
      "a",
      "m",
      "p",
      "u",
    ]);
  });

  test("a merge parent that does not exist is reported", () => {
    expect(
      kinds([
        node("1", "a", NULL_SNAPSHOT_ID),
        node("2", "u", "a"),
        node("3", "m", "u", ["gone", "u"]),
      ]),
    ).toEqual(["missing-parent"]);
  });

  test("a merge node whose prevId is not among its parents is reported", () => {
    expect(
      kinds([
        node("1", "a", NULL_SNAPSHOT_ID),
        node("2", "p", "a"),
        node("3", "u", "a"),
        node("4", "m", "a", ["p", "u"]),
      ]),
    ).toEqual(["merge-prev-not-parent"]);
  });

  test("duplicate ids, several roots, and an orphan branch are reported", () => {
    expect(
      kinds([
        node("1", "a", NULL_SNAPSHOT_ID),
        node("2", "a", NULL_SNAPSHOT_ID),
        node("3", "b", "a"),
      ]),
    ).toEqual(["duplicate-id"]);
    expect(
      kinds([
        node("1", "a", NULL_SNAPSHOT_ID),
        node("2", "b", NULL_SNAPSHOT_ID),
      ]),
    ).toEqual(["multiple-roots", "multiple-tips"]);
  });

  test("a cycle through merge parents is reported", () => {
    expect(
      kinds([
        node("1", "a", NULL_SNAPSHOT_ID),
        node("2", "b", "a", ["a", "c"]),
        node("3", "c", "b"),
      ]),
    ).toContain("cycle");
  });
});
