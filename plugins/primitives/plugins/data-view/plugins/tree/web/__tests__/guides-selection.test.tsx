import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  DataViewSlots,
  type DataViewRenderProps,
  type FieldDef,
  type HierarchyConfig,
} from "@plugins/primitives/plugins/data-view/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { TreeView } from "../components/tree-view";
import type { TreeViewOptions } from "../internal/types";

/**
 * Two opt-in looks of the tree: indent guides (one hairline box per row,
 * covering its ancestor levels) and the selected row's text colours (the name
 * via `--selected-foreground`, the aligned meta cells via the row-published
 * `--row-meta`) — both of which must leave a tree that does not ask unchanged.
 */

const plugin = {
  id: "data-view-tree-guides-selection-test",
  description: "tree guides/selection fixture",
  contributions: [],
  slots: DataViewSlots,
} as unknown as LoadedPlugin;

type Row = { id: string; parent: string | null; name: string; size: string };

const ROWS: Row[] = [
  { id: "src", parent: null, name: "src", size: "—" },
  { id: "lib", parent: "src", name: "lib", size: "—" },
  { id: "deep", parent: "lib", name: "deep.ts", size: "1 KB" },
  { id: "readme", parent: null, name: "README.md", size: "2 KB" },
];

const fields: FieldDef<Row>[] = [
  {
    id: "name",
    label: "Name",
    type: "plain",
    primary: true,
    value: (r) => r.name,
  },
  {
    id: "size",
    label: "Size",
    type: "plain",
    width: "80px",
    value: (r) => r.size,
  },
];

function renderTree(
  options: TreeViewOptions<Row>,
  over: Partial<DataViewRenderProps<Row>> & {
    lazy?: HierarchyConfig<Row>["lazyChildren"];
  } = {},
) {
  const { lazy, ...rest } = over;
  const props: DataViewRenderProps<Row> = {
    revealSelection: true,
    rows: ROWS,
    fields,
    rowKey: (r) => r.id,
    state: { sort: [], query: "", filter: null },
    setSort: () => {},
    sortHeader: { active: [], sortable: new Set<string>() },
    setFilter: () => {},
    setExpanded: () => {},
    expanded: { src: true, lib: true },
    now: 0,
    groupOrder: "asc",
    rowsComplete: true,
    sectionOrder: "bucket",
    hierarchy: {
      getParentId: (r) => r.parent,
      getRank: (r) => Rank.from(r.id === "readme" ? "a1" : "a0"),
      lazyChildren: lazy,
    },
    options,
    ...rest,
  };
  return render(
    <PluginProvider plugins={[plugin]}>
      <TreeView {...(props as DataViewRenderProps<unknown>)} />
    </PluginProvider>,
  );
}

const rowOf = (getByText: (t: string) => HTMLElement, label: string) =>
  getByText(label).closest<HTMLElement>("[data-tree-row]")!;

// A selected row reveals itself on mount; jsdom has no scrolling.
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

afterEach(cleanup);

describe("data-view tree: indent guides", () => {
  it("draws none unless asked", () => {
    const { container } = renderTree({});
    expect(container.querySelector("[data-tree-guides]")).toBeNull();
  });

  it("draws one box per nested row, covering its ancestor levels", () => {
    const { getByText } = renderTree({ guides: true });
    const guidesOf = (label: string) =>
      rowOf(getByText, label)
        .querySelector("[data-tree-guides]")
        ?.getAttribute("data-tree-guides") ?? null;
    expect(guidesOf("src")).toBeNull();
    expect(guidesOf("README.md")).toBeNull();
    expect(guidesOf("lib")).toBe("1");
    expect(guidesOf("deep.ts")).toBe("2");
  });

  it("sits in the indent: starts after the row's lead, as wide as the levels", () => {
    const { getByText } = renderTree({ guides: true, columns: "aligned" });
    const box = rowOf(getByText, "deep.ts").querySelector<HTMLElement>(
      "[data-tree-guides]",
    )!;
    expect(box.getAttribute("aria-hidden")).toBe("true");
    expect(box.style.width).toBe("calc(2 * var(--tree-indent))");
    expect(box.style.backgroundSize).toContain("var(--tree-indent)");
    // The aligned cells are untouched: still the last, fixed-width cells.
    const cell = rowOf(getByText, "deep.ts").querySelector<HTMLElement>(
      "[data-aligned-cell='size']",
    )!;
    expect(cell.style.width).toBe("80px");
  });

  it("gives an open folder's placeholder row the guides its siblings have", () => {
    const { container } = renderTree(
      { guides: true },
      {
        rows: [ROWS[0]!, ROWS[3]!],
        expanded: { src: true },
        lazy: {
          hasChildren: (r) => r.id === "src",
          state: () => ({ kind: "loaded" }),
          load: () => {},
        },
      },
    );
    const placeholder = container.querySelector(
      "[data-tree-placeholder='empty']",
    )!;
    expect(
      placeholder
        .querySelector("[data-tree-guides]")
        ?.getAttribute("data-tree-guides"),
    ).toBe("1");
  });
});

describe("data-view tree: selected row colours", () => {
  it("routes the selected row's name and meta cells through the tokens", () => {
    const { getByText } = renderTree(
      { columns: "aligned" },
      { selectedRowId: "deep" },
    );
    const selected = rowOf(getByText, "deep.ts");
    expect(selected.className).toContain("text-selected-foreground");
    expect(selected.className).toContain(
      "[--row-meta:var(--selected-meta-foreground)]",
    );

    const other = rowOf(getByText, "README.md");
    expect(other.className).not.toContain("text-selected-foreground");
    expect(other.className).not.toContain("--row-meta");

    // Every aligned cell reads the row's meta colour (muted unless published).
    for (const row of [selected, other]) {
      const cell = row.querySelector<HTMLElement>("[data-aligned-cell]")!;
      expect(cell.className).toContain("text-row-meta");
      expect(cell.className).not.toContain("text-muted-foreground");
    }
  });
});
