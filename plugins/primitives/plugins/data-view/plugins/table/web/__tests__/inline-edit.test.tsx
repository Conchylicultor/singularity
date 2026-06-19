import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, fireEvent } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import {
  PluginProvider,
  type LoadedPlugin,
} from "@plugins/framework/plugins/web-sdk/core";
import {
  DataViewSlots,
  type CellEditorProps,
  type DataViewRenderProps,
  type FieldDef,
  type TableCellProps,
} from "@plugins/primitives/plugins/data-view/web";
import { TableView } from "../components/table-view";

// A minimal local inline editor (a bare input) contributed for `type:"text"`.
// Keeping the fixture self-contained means the test depends only on the table
// plugin's own components + the data-view barrel — no cross-plugin field imports
// (which would form a data-view ⇄ fields cycle).
function LocalTextEditor(props: CellEditorProps): ReactNode {
  const [v, setV] = useState(props.value == null ? "" : String(props.value));
  return (
    <input
      autoFocus
      aria-label="cell-editor"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onCommit(v === "" ? null : v);
        else if (e.key === "Escape") props.onCancel();
      }}
    />
  );
}

// A minimal multi-value (tags-style) fixture for `type:"multi"`: the read cell
// reads the threaded `TableCellProps.values`; the editor commits a new array via
// the multi-value commit channel (`onCommitValues`).
function LocalMultiCell(props: TableCellProps): ReactNode {
  return <span>{(props.values ?? []).join(",")}</span>;
}
function LocalMultiEditor(props: CellEditorProps): ReactNode {
  return (
    <button
      aria-label="multi-cell-editor"
      onClick={() => props.onCommitValues([...(props.values ?? []), "added"])}
    >
      commit
    </button>
  );
}

const plugin = {
  id: "data-view-table-inline-edit-test",
  description: "inline-edit fixture",
  contributions: [
    DataViewSlots.CellEditor({ match: "text", component: LocalTextEditor }),
    DataViewSlots.Cell({ match: "multi", component: LocalMultiCell }),
    DataViewSlots.CellEditor({ match: "multi", component: LocalMultiEditor }),
  ],
} as unknown as LoadedPlugin;

type Row = { id: string; name?: string; tags?: string[] };

function renderProps(
  fields: FieldDef<Row>[],
  rows: Row[] = [{ id: "1", name: "alpha" }],
): DataViewRenderProps<Row> {
  return {
    rows,
    fields,
    rowKey: (r) => r.id,
    state: { sort: [], query: "", filter: null },
    setSort: () => {},
    setFilter: () => {},
    options: undefined,
  };
}

afterEach(cleanup);

describe("data-view table inline cell editing", () => {
  it("edits a cell whose field declares onEdit", () => {
    const onEdit = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView
          {...(renderProps([
            { id: "name", label: "Name", type: "text", value: (r) => r.name, onEdit },
          ]) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    fireEvent.click(getByText("alpha"));
    const input = getByLabelText("cell-editor");
    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith({ id: "1", name: "alpha" }, "beta");
  });

  it("edits an EMPTY editable cell via its 'Empty' hint affordance", () => {
    const onEdit = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView
          {...(renderProps(
            [
              {
                id: "name",
                label: "Name",
                type: "text",
                value: (r) => r.name || null,
                onEdit,
              },
            ],
            [{ id: "1", name: "" }],
          ) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    // An empty cell still presents a clickable hint instead of a zero-size void.
    fireEvent.click(getByText("Empty"));
    const input = getByLabelText("cell-editor");
    fireEvent.change(input, { target: { value: "filled" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith({ id: "1", name: "" }, "filled");
  });

  it("never enters edit mode for a field without onEdit", () => {
    const { getByText, queryByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView
          {...(renderProps([
            { id: "name", label: "Name", type: "text", value: (r) => r.name },
          ]) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    fireEvent.click(getByText("alpha"));
    expect(queryByLabelText("cell-editor")).toBeNull();
  });

  it("edits a multi-value cell via the onCommitValues → onEditValues channel", () => {
    const onEditValues = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView
          {...(renderProps(
            [
              {
                id: "tags",
                label: "Tags",
                type: "multi",
                values: (r) => r.tags ?? [],
                onEditValues,
              },
            ],
            [{ id: "1", tags: ["a"] }],
          ) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    // The read cell renders the threaded `TableCellProps.values`.
    fireEvent.click(getByText("a"));
    fireEvent.click(getByLabelText("multi-cell-editor"));

    expect(onEditValues).toHaveBeenCalledTimes(1);
    expect(onEditValues).toHaveBeenCalledWith({ id: "1", tags: ["a"] }, ["a", "added"]);
  });

  it("edits an EMPTY multi-value cell via its 'Empty' hint affordance", () => {
    const onEditValues = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView
          {...(renderProps(
            [
              {
                id: "tags",
                label: "Tags",
                type: "multi",
                values: (r) => r.tags ?? [],
                onEditValues,
              },
            ],
            [{ id: "1", tags: [] }],
          ) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    // An empty multi-value cell shows the clickable hint (not a zero-size void).
    fireEvent.click(getByText("Empty"));
    fireEvent.click(getByLabelText("multi-cell-editor"));

    expect(onEditValues).toHaveBeenCalledTimes(1);
    expect(onEditValues).toHaveBeenCalledWith({ id: "1", tags: [] }, ["added"]);
  });

  it("never enters edit mode for a multi-value field without onEditValues", () => {
    const { getByText, queryByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView
          {...(renderProps(
            [
              {
                id: "tags",
                label: "Tags",
                type: "multi",
                values: (r) => r.tags ?? [],
              },
            ],
            [{ id: "1", tags: ["a"] }],
          ) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    fireEvent.click(getByText("a"));
    expect(queryByLabelText("multi-cell-editor")).toBeNull();
  });
});
