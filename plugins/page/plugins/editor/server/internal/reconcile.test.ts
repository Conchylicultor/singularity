/**
 * Pure unit tests for the block diff (`reconcileBlocks`).
 * Run with `bun test plugins/page/plugins/editor/server/internal/reconcile.test.ts`.
 *
 * The handler loads the page, runs the pure reducer, and persists the diff this
 * function produces. These tests pin the diff contract: ids only in `after` are
 * inserted, ids only in `before` are deleted, and ids in both are `updated` iff a
 * persisted column (parentId | rank | data | expanded | type) differs — with
 * `data` compared by stable deep-equal so key-order-only changes are NOT updates.
 */

import { test, expect, describe } from "bun:test";
import type { BlockNode } from "../../core/block-ops";
import { reconcileBlocks } from "./reconcile";

function mk(
  id: string,
  parentId: string | null,
  rank: string,
  opts: { data?: unknown; expanded?: boolean; type?: string; pageId?: string | null } = {},
): BlockNode {
  return {
    id,
    pageId: opts.pageId === undefined ? "page-1" : opts.pageId,
    parentId,
    type: opts.type ?? "text",
    data: "data" in opts ? opts.data : { text: id },
    rank,
    expanded: opts.expanded ?? false,
  };
}

describe("reconcileBlocks", () => {
  test("no-op: equal arrays produce empty diff", () => {
    const before = [mk("a", null, "a0"), mk("b", null, "a1")];
    const after = before.map((b) => ({ ...b }));
    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);
    expect(inserted).toEqual([]);
    expect(updated).toEqual([]);
    expect(deletedIds).toEqual([]);
  });

  test("insert-only: ids in after not in before", () => {
    const before = [mk("a", null, "a0")];
    const newNode = mk("b", null, "a1");
    const after = [mk("a", null, "a0"), newNode];
    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);
    expect(inserted).toEqual([newNode]);
    expect(updated).toEqual([]);
    expect(deletedIds).toEqual([]);
  });

  test("update: rank change", () => {
    const before = [mk("a", null, "a0")];
    const after = [mk("a", null, "a5")];
    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);
    expect(inserted).toEqual([]);
    expect(updated).toEqual([{ id: "a", node: after[0]! }]);
    expect(deletedIds).toEqual([]);
  });

  test("update: parent change", () => {
    const before = [mk("a", null, "a0")];
    const after = [mk("a", "p", "a0")];
    const { updated } = reconcileBlocks(before, after);
    expect(updated).toEqual([{ id: "a", node: after[0]! }]);
  });

  test("update: data change", () => {
    const before = [mk("a", null, "a0", { data: { text: "hi" } })];
    const after = [mk("a", null, "a0", { data: { text: "bye" } })];
    const { updated } = reconcileBlocks(before, after);
    expect(updated).toEqual([{ id: "a", node: after[0]! }]);
  });

  test("update: expanded change", () => {
    const before = [mk("a", null, "a0", { expanded: false })];
    const after = [mk("a", null, "a0", { expanded: true })];
    const { updated } = reconcileBlocks(before, after);
    expect(updated).toEqual([{ id: "a", node: after[0]! }]);
  });

  test("update: type change", () => {
    const before = [mk("a", null, "a0", { type: "text" })];
    const after = [mk("a", null, "a0", { type: "to-do" })];
    const { updated } = reconcileBlocks(before, after);
    expect(updated).toEqual([{ id: "a", node: after[0]! }]);
  });

  test("data deep-equal: key reorder is NOT an update", () => {
    const before = [mk("a", null, "a0", { data: { text: "x", done: false } })];
    const after = [mk("a", null, "a0", { data: { done: false, text: "x" } })];
    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);
    expect(inserted).toEqual([]);
    expect(updated).toEqual([]);
    expect(deletedIds).toEqual([]);
  });

  test("delete with subtree: every removed id reported", () => {
    const before = [
      mk("a", null, "a0"),
      mk("child", "a", "a0"),
      mk("grandchild", "child", "a0"),
      mk("b", null, "a1"),
    ];
    // Reducer enumerates the full subtree into deletedIds; here a + descendants
    // are gone, b survives.
    const after = [mk("b", null, "a1")];
    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);
    expect(inserted).toEqual([]);
    expect(updated).toEqual([]);
    expect(deletedIds.sort()).toEqual(["a", "child", "grandchild"]);
  });

  test("split-shaped: one update + one insert", () => {
    // Splitting "a" truncates its text (update) and creates a sibling (insert).
    const before = [mk("a", null, "a0", { data: { text: "hello world" } })];
    const newSibling = mk("new", null, "a0V", { data: { text: " world" } });
    const after = [
      mk("a", null, "a0", { data: { text: "hello" } }),
      newSibling,
    ];
    const { inserted, updated, deletedIds } = reconcileBlocks(before, after);
    expect(inserted).toEqual([newSibling]);
    expect(updated).toEqual([{ id: "a", node: after[0]! }]);
    expect(deletedIds).toEqual([]);
  });
});
