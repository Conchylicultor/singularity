import { test, expect } from "bun:test";
import type { Block } from "@plugins/page/plugins/editor/core";
import { pageAncestors } from "./ancestors";

/** Minimal Block fixture — pageAncestors only reads `id` and `pageId` (the
 * denormalized nearest page ancestor). */
function mk(id: string, pageId: string | null): Block {
  return { id, pageId } as Block;
}

test("root page (pageId null) has no ancestors", () => {
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

test("chain is pageId-based: a content-nested sub-page still climbs to its page", () => {
  // Physically `c`'s block sits under a text block inside `b` — pageAncestors
  // never sees that block; the `pageId` chain is the page hierarchy.
  const pages = [mk("a", null), mk("b", "a"), mk("c", "b")];
  expect(pageAncestors(pages, "c").map((p) => p.id)).toEqual(["a", "b"]);
});

test("a cycle terminates without infinite loop", () => {
  const pages = [mk("a", "b"), mk("b", "a")];
  const result = pageAncestors(pages, "a").map((p) => p.id);
  // Walks b once, then stops at the already-seen `a` — no infinite loop.
  expect(result).toEqual(["b"]);
});
