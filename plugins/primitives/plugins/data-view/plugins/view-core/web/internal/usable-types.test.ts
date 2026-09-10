import { describe, expect, it } from "bun:test";
import type { ComponentType } from "react";
import type { SealContributions } from "@plugins/framework/plugins/web-sdk/core";
import type { ViewSourceEntry, ViewTypeMeta } from "../../core";
import { usableTypes } from "./usable-types";

const Icon: ComponentType<{ className?: string }> = () => null;

const table = { type: "table", title: "Table", icon: Icon, order: 1 };
const gallery = { type: "gallery", title: "Gallery", icon: Icon, order: 0 };
const tree = {
  type: "tree",
  title: "Tree",
  icon: Icon,
  order: 2,
  hierarchical: true,
};
const contributions = [
  table,
  gallery,
  tree,
] as unknown as SealContributions<ViewTypeMeta>[];

const flatEntry: ViewSourceEntry = { contributions, hasHierarchy: false };
const treeEntry: ViewSourceEntry = { contributions, hasHierarchy: true };

const typesOf = (entry: ViewSourceEntry) =>
  usableTypes(entry).map((c) => c.type);

describe("usableTypes", () => {
  it("drops hierarchical types when the source has no hierarchy", () => {
    // The whole point: a flat surface must not be OFFERED the tree — neither in
    // the `+` menu nor in the settings popover's type picker, both of which read
    // this one function. A tree row on a flat source resolves to null, so
    // offering it is offering a view that vanishes the moment it is chosen.
    expect(typesOf(flatEntry)).toEqual(["gallery", "table"]);
  });

  it("keeps hierarchical types when the source has a hierarchy", () => {
    expect(typesOf(treeEntry)).toEqual(["gallery", "table", "tree"]);
  });

  it("applies the entry's `views` whitelist", () => {
    expect(typesOf({ ...treeEntry, views: ["tree", "table"] })).toEqual([
      "table",
      "tree",
    ]);
  });

  it("orders by `order`, then title", () => {
    const unordered = [
      { type: "b", title: "B", icon: Icon },
      { type: "a", title: "A", icon: Icon },
    ] as unknown as SealContributions<ViewTypeMeta>[];
    expect(typesOf({ contributions: unordered, hasHierarchy: false })).toEqual([
      "a",
      "b",
    ]);
  });
});
