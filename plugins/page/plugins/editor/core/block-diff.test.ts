import { describe, test, expect } from "bun:test";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { diffBlocks, patchesFromDiff, isEmptyPatch } from "./block-diff";
import type { Block } from "./schemas";

const r = (i: number) => Rank.from(String.fromCharCode(97 + i));

function mk(id: string, over: Partial<Block> = {}): Block {
  return {
    id,
    pageId: "P",
    parentId: null,
    type: "text",
    data: { text: [] },
    rank: r(0),
    expanded: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

describe("diffBlocks", () => {
  test("detects insert / update / delete by id", () => {
    const before = [mk("A"), mk("B", { type: "heading" })];
    const after = [
      mk("A", { parentId: "X" }), // updated (parent changed)
      mk("C"), // inserted
    ]; // B deleted

    const d = diffBlocks(before, after);
    expect(d.inserted.map((b) => b.id)).toEqual(["C"]);
    expect(d.updated.map((u) => u.after.id)).toEqual(["A"]);
    expect(d.updated[0]!.before.parentId).toBe(null);
    expect(d.updated[0]!.after.parentId).toBe("X");
    expect(d.deletedIds).toEqual(["B"]);
    expect(d.deleted.map((b) => b.id)).toEqual(["B"]);
  });

  test("no change yields an empty diff and empty patches", () => {
    const rows = [mk("A"), mk("B")];
    const d = diffBlocks(rows, rows);
    const { undo, redo } = patchesFromDiff(d);
    expect(isEmptyPatch(undo)).toBe(true);
    expect(isEmptyPatch(redo)).toBe(true);
  });

  test("ignores rank instance identity, compares by serialized value", () => {
    const before = [mk("A", { rank: Rank.from("m") })];
    const after = [mk("A", { rank: Rank.from("m") })]; // same value, different instance
    expect(diffBlocks(before, after).updated.length).toBe(0);
  });
});

describe("patchesFromDiff", () => {
  test("redo re-applies, undo inverts (insert ⇒ undo deletes it)", () => {
    const before = [mk("A")];
    const after = [mk("A"), mk("B")]; // inserted B
    const { redo, undo } = patchesFromDiff(diffBlocks(before, after));

    expect(redo.upserts.map((b) => b.id)).toEqual(["B"]);
    expect(redo.deleteIds).toEqual([]);
    expect(undo.deleteIds).toEqual(["B"]);
    expect(undo.upserts).toEqual([]);
  });

  test("delete ⇒ undo re-creates the deleted row's before state", () => {
    const before = [mk("A"), mk("B", { type: "quote" })];
    const after = [mk("A")]; // B deleted
    const { redo, undo } = patchesFromDiff(diffBlocks(before, after));

    expect(redo.deleteIds).toEqual(["B"]);
    expect(redo.upserts).toEqual([]);
    expect(undo.upserts.map((b) => b.id)).toEqual(["B"]);
    expect(undo.upserts[0]!.type).toBe("quote");
    expect(undo.deleteIds).toEqual([]);
  });

  test("update ⇒ redo carries after, undo carries before", () => {
    const before = [mk("A", { type: "text" })];
    const after = [mk("A", { type: "heading" })];
    const { redo, undo } = patchesFromDiff(diffBlocks(before, after));

    expect(redo.upserts[0]!.type).toBe("heading");
    expect(undo.upserts[0]!.type).toBe("text");
  });
});
