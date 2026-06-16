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

const plugin = {
  id: "data-view-table-inline-edit-test",
  description: "inline-edit fixture",
  contributions: [
    DataViewSlots.CellEditor({ match: "text", component: LocalTextEditor }),
  ],
} as unknown as LoadedPlugin;

type Row = { id: string; name: string };

function renderProps(
  fields: FieldDef<Row>[],
): DataViewRenderProps<Row> {
  return {
    rows: [{ id: "1", name: "alpha" }],
    fields,
    rowKey: (r) => r.id,
    state: { sort: null, query: "", filter: null },
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
});
