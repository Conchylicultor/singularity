import { describe, expect, test } from "bun:test";
import type { Block } from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { derivePageMap, type PageMapLayerSpec } from "./derive";

function block(id: string, pageId: string): Block {
  const at = new Date("2026-01-01T00:00:00.000Z");
  return {
    id,
    pageId,
    parentId: pageId,
    type: "thing",
    data: {},
    rank: Rank.from("a0"),
    expanded: true,
    createdAt: at,
    updatedAt: at,
  };
}

/** A layer pinning every block it sees at (0, 0), and reporting a fixed unplaced count. */
function layer(id: string, unplaced = 0): PageMapLayerSpec {
  return {
    id,
    overlays: (blocks) => ({
      overlays: blocks.map((b) => ({
        overlay: {
          kind: "pin",
          id: b.id,
          pinType: id,
          position: { lat: 0, lng: 0 },
        },
        blockId: b.id,
      })),
      unplaced,
    }),
    describeUnplaced: (n) => `${n} ${id} missing`,
    emptyHint: `add a ${id}`,
  };
}

describe("derivePageMap", () => {
  test("keeps only this page's blocks", () => {
    const view = derivePageMap(
      [block("a", "p1"), block("b", "sub-page"), block("c", "p1")],
      "p1",
      [layer("x")],
    );
    expect(view.overlays.map((o) => o.id)).toEqual(["x:a", "x:c"]);
  });

  test("namespaces overlay ids per layer and maps them back to blocks", () => {
    const view = derivePageMap([block("a", "p1")], "p1", [
      layer("x"),
      layer("y"),
    ]);
    expect(view.overlays.map((o) => o.id)).toEqual(["x:a", "y:a"]);
    expect(view.blockIdOf.get("x:a")).toBe("a");
    expect(view.blockIdOf.get("y:a")).toBe("a");
  });

  test("notes unplaced items only for layers that have some", () => {
    const view = derivePageMap([], "p1", [layer("x", 2), layer("y", 0)]);
    expect(view.unplacedNotes).toEqual(["2 x missing"]);
    expect(view.emptyHints).toEqual(["add a x", "add a y"]);
  });
});
