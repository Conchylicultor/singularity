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
import { ListView } from "../components/list-view";

// Minimal local inline editor (a bare input) contributed for `type:"text"` —
// keeps the fixture self-contained (no cross-plugin field imports).
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
  id: "data-view-list-inline-edit-test",
  description: "list inline-edit fixture",
  contributions: [
    DataViewSlots.CellEditor({ match: "text", component: LocalTextEditor }),
  ],
} as unknown as LoadedPlugin;

type Row = { id: string; name?: string; status?: string };

function renderProps(
  fields: FieldDef<Row>[],
  rows: Row[] = [{ id: "1", name: "alpha", status: "todo" }],
): DataViewRenderProps<Row> {
  return {
    rows,
    fields,
    rowKey: (r) => r.id,
    state: { sort: null, query: "", filter: null },
    setSort: () => {},
    setFilter: () => {},
    options: undefined,
  };
}

afterEach(cleanup);

describe("data-view list inline cell editing", () => {
  it("edits the primary (title) field whose field declares onEdit", () => {
    const onEdit = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <ListView
          {...(renderProps([
            { id: "name", label: "Name", type: "text", value: (r) => r.name, primary: true, onEdit },
          ]) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    fireEvent.click(getByText("alpha"));
    const input = getByLabelText("cell-editor");
    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith({ id: "1", name: "alpha", status: "todo" }, "beta");
  });

  it("edits a trailing (align:end) field whose field declares onEdit", () => {
    const onEdit = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <ListView
          {...(renderProps([
            { id: "name", label: "Name", type: "text", value: (r) => r.name, primary: true },
            { id: "status", label: "Status", type: "text", value: (r) => r.status, align: "end", onEdit },
          ]) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    fireEvent.click(getByText("todo"));
    const input = getByLabelText("cell-editor");
    fireEvent.change(input, { target: { value: "done" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledWith({ id: "1", name: "alpha", status: "todo" }, "done");
  });

  it("does not enter edit mode for a field without onEdit", () => {
    const { getByText, queryByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <ListView
          {...(renderProps([
            { id: "name", label: "Name", type: "text", value: (r) => r.name, primary: true },
          ]) as DataViewRenderProps<unknown>)}
        />
      </PluginProvider>,
    );

    fireEvent.click(getByText("alpha"));
    expect(queryByLabelText("cell-editor")).toBeNull();
  });
});
