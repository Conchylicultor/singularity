/**
 * Tests for `resolveSortableDrop` / `sortableOrder` — how a sortable drop
 * (active released over another item) becomes a rank move, a reseat, or
 * nothing.
 */

import { test, expect, describe } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  resolveSortableDrop,
  sortableOrder,
  type DropRect,
  type RankReorderItem,
} from "./resolve-sortable-drop";

const mk = (id: string, rank: string, group?: string): RankReorderItem => ({
  id,
  rank: Rank.from(rank),
  group,
});

const row = (top: number): DropRect => ({
  top,
  left: 0,
  width: 100,
  height: 20,
});
const vertical = { layout: "vertical" as const, dragged: row(0), over: row(0) };

const between = (rank: Rank, lo: string, hi: string) => {
  expect(Rank.compare(rank, Rank.from(lo))).toBe(1);
  expect(Rank.compare(rank, Rank.from(hi))).toBe(-1);
};

describe("sortableOrder", () => {
  test("groups in first-listed order, rank-sorted within each", () => {
    const items = [
      mk("b2", "a4", "b"),
      mk("a1", "a2", "a"),
      mk("b1", "a0", "b"),
      mk("a0", "a0", "a"),
    ];
    expect(sortableOrder(items).map((i) => i.id)).toEqual([
      "b1",
      "b2",
      "a0",
      "a1",
    ]);
  });
});

describe("resolveSortableDrop", () => {
  const items = sortableOrder([
    mk("a", "a0"),
    mk("b", "a2"),
    mk("c", "a4"),
    mk("d", "a6"),
  ]);

  test("moving down lands after the item it is over", () => {
    const drop = resolveSortableDrop(items, "a", "c", vertical);
    expect(drop.kind).toBe("move");
    if (drop.kind !== "move") return;
    expect(drop.zone).toBe("after");
    expect(drop.targetId).toBe("c");
    between(drop.rank, "a4", "a6");
  });

  test("moving up lands before the item it is over", () => {
    const drop = resolveSortableDrop(items, "d", "b", vertical);
    expect(drop.kind).toBe("move");
    if (drop.kind !== "move") return;
    expect(drop.zone).toBe("before");
    expect(drop.targetId).toBe("b");
    between(drop.rank, "a0", "a2");
  });

  test("dropped back on its own slot → none", () => {
    expect(resolveSortableDrop(items, "b", "b", vertical)).toEqual({
      kind: "none",
    });
  });

  test("an unknown item throws", () => {
    expect(() => resolveSortableDrop(items, "a", "nope", vertical)).toThrow();
  });

  test("the rank is resolved within the group only", () => {
    const grouped = sortableOrder([
      mk("x1", "a0", "x"),
      mk("x2", "a2", "x"),
      mk("y1", "a1", "y"),
      mk("y2", "a3", "y"),
    ]);
    const drop = resolveSortableDrop(grouped, "y2", "y1", vertical);
    expect(drop.kind).toBe("move");
    if (drop.kind !== "move") return;
    expect(drop.group).toBe("y");
    // Before y1 with no group predecessor: x's ranks are not neighbours.
    expect(Rank.compare(drop.rank, Rank.from("a1"))).toBe(-1);
  });

  test("another group → reseat, side from the dragged centre", () => {
    const grouped = sortableOrder([mk("x1", "a0", "x"), mk("y1", "a0", "y")]);
    const above = resolveSortableDrop(grouped, "x1", "y1", {
      layout: "vertical",
      dragged: row(90),
      over: row(100),
    });
    expect(above).toEqual({
      kind: "reseat",
      group: "y",
      targetId: "y1",
      zone: "before",
    });
    const below = resolveSortableDrop(grouped, "x1", "y1", {
      layout: "vertical",
      dragged: row(110),
      over: row(100),
    });
    expect(below.kind === "reseat" && below.zone).toBe("after");
  });

  test("a grid reads the side along the row when level with the target", () => {
    const grouped = sortableOrder([mk("x1", "a0", "x"), mk("y1", "a0", "y")]);
    const tile = (left: number, top: number): DropRect => ({
      top,
      left,
      width: 50,
      height: 50,
    });
    const right = resolveSortableDrop(grouped, "x1", "y1", {
      layout: "grid",
      dragged: tile(130, 105),
      over: tile(100, 100),
    });
    expect(right.kind === "reseat" && right.zone).toBe("after");
    const left = resolveSortableDrop(grouped, "x1", "y1", {
      layout: "grid",
      dragged: tile(70, 105),
      over: tile(100, 100),
    });
    expect(left.kind === "reseat" && left.zone).toBe("before");
  });
});
