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
import { GalleryView } from "../components/gallery-view";

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
  id: "data-view-gallery-inline-edit-test",
  description: "gallery inline-edit fixture",
  contributions: [
    DataViewSlots.CellEditor({ match: "text", component: LocalTextEditor }),
  ],
} as unknown as LoadedPlugin;

type Row = { id: string; name?: string };

function renderProps(
  fields: FieldDef<Row>[],
  rows: Row[] = [{ id: "1", name: "alpha" }],
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

describe("data-view gallery inline cell editing", () => {
  it("edits a card field whose field declares onEdit", () => {
    const onEdit = vi.fn();
    const { getByText, getByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <GalleryView
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

  it("does not enter edit mode for a card field without onEdit", () => {
    const { getByText, queryByLabelText } = render(
      <PluginProvider plugins={[plugin]}>
        <GalleryView
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
