import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  DataViewSlots,
  type DataViewRenderProps,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { TreeView } from "../components/tree-view";

/**
 * Every tree row carries `data-row-key` — the row's key in the DataView, the
 * marker the DataView measures the rows it has on screen by (a paged read
 * under a view whose rows carry none would see none of them on screen). An
 * alias (a second drawing of a row under a reference parent) carries none:
 * the real row already marks it.
 */

const plugin = {
  id: "data-view-tree-row-key-test",
  description: "tree row-key fixture",
  contributions: [],
  slots: DataViewSlots,
} as unknown as LoadedPlugin;

type Row = { key: string; name: string; parent: string | null };

const name: FieldDef<Row> = {
  id: "name",
  label: "Name",
  type: "plain",
  value: (r) => r.name,
};

const ROWS: Row[] = [
  { key: "k-root", name: "root", parent: null },
  { key: "k-child", name: "child", parent: "k-root" },
  { key: "k-other", name: "other", parent: null },
];

function renderTree() {
  const props: DataViewRenderProps<Row> = {
    revealSelection: true,
    rows: ROWS,
    fields: [name],
    rowKey: (r) => r.key,
    state: { sort: [], query: "", filter: null },
    setSort: () => {},
    sortHeader: { active: [], sortable: new Set<string>() },
    setFilter: () => {},
    setExpanded: () => {},
    now: 0,
    groupOrder: "asc",
    rowsComplete: true,
    sectioning: { kind: "bucket" },
    hierarchy: {
      getParentId: (r) => r.parent,
      getRank: () => Rank.from("a0"),
      // `child` also shows, as a reference, under `other`.
      getAliasParents: (r) => (r.key === "k-child" ? ["k-other"] : []),
    },
    options: { defaultExpanded: true },
  };
  return render(
    <PluginProvider plugins={[plugin]}>
      <TreeView {...(props as DataViewRenderProps<unknown>)} />
    </PluginProvider>,
  );
}

afterEach(cleanup);

describe("data-view tree row keys", () => {
  it("stamps each drawn row with its DataView row key, once", () => {
    const { container, getAllByText } = renderTree();
    const keys = [...container.querySelectorAll("[data-row-key]")].map((el) =>
      el.getAttribute("data-row-key"),
    );
    expect(keys.sort()).toEqual(["k-child", "k-other", "k-root"]);
    // The alias is drawn too, without a key of its own.
    expect(getAllByText("child")).toHaveLength(2);
  });
});
