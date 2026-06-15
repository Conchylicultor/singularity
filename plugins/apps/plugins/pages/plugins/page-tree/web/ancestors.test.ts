import { test, expect } from "bun:test";
import type { Block } from "@plugins/page/plugins/editor/core";
import { pageAncestors } from "./ancestors";

/** Minimal Block fixture — pageAncestors only reads `id` and `parentId`. */
function mk(id: string, parentId: string | null): Block {
  return { id, parentId } as Block;
}

test("root page (parentId null) has no ancestors", () => {
  const pages = [mk("a", null), mk("b", "a")];
  expect(pageAncestors(pages, "a")).toEqual([]);
});

test("unknown id has no ancestors", () => {
  const pages = [mk("a", null), mk("b", "a")];
  expect(pageAncestors(pages, "missing").map((p) => p.id)).toEqual([]);
});

test("a→b→c chain returns ancestors root-first", () => {
  const pages = [mk("a", null), mk("b", "a"), mk("c", "b")];
  expect(pageAncestors(pages, "c").map((p) => p.id)).toEqual(["a", "b"]);
  expect(pageAncestors(pages, "b").map((p) => p.id)).toEqual(["a"]);
});

test("a cycle terminates without infinite loop", () => {
  const pages = [mk("a", "b"), mk("b", "a")];
  const result = pageAncestors(pages, "a").map((p) => p.id);
  // Walks b once, then stops at the already-seen `a` — no infinite loop.
  expect(result).toEqual(["b"]);
});
