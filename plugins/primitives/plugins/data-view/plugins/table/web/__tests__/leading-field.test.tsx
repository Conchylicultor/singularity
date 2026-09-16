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
  type TableCellProps,
} from "@plugins/primitives/plugins/data-view/web";
import { TableView } from "../components/table-view";

/**
 * The table has no leading slot: a `leading: true` field is an ordinary column,
 * its `data` drawn by its type's cell like any other. Local fixture cell for a
 * synthetic type (no `fields/*` import: that is a cycle).
 */
function SpecCell(props: TableCellProps) {
  return <span data-testid="spec-cell">{String(props.data)}</span>;
}

const plugin = {
  id: "data-view-table-leading-field-test",
  description: "table leading-field fixture",
  contributions: [DataViewSlots.Cell({ match: "spec", component: SpecCell })],
  slots: DataViewSlots,
} as unknown as LoadedPlugin;

type Row = { id: string; name: string; glyph: string };

const FIELDS: FieldDef<Row>[] = [
  { id: "name", label: "Name", type: "plain", value: (r) => r.name },
  {
    id: "avatar",
    label: "Avatar",
    type: "spec",
    data: (r) => r.glyph,
    leading: true,
  },
];

afterEach(cleanup);

describe("data-view table leading field", () => {
  it("renders the leading field as an ordinary column", () => {
    const props: DataViewRenderProps<Row> = {
      rows: [{ id: "1", name: "alpha", glyph: "★" }],
      fields: FIELDS,
      rowKey: (r) => r.id,
      state: { sort: [], query: "", filter: null },
      setSort: () => {},
      setFilter: () => {},
      setExpanded: () => {},
      // Grouping inputs. These fixtures render UNGROUPED, so the clock is never
      // consulted — a pinned zero states that rather than borrowing the real one.
      now: 0,
      groupOrder: "asc",
      options: undefined,
    };
    const { getByText, getByTestId } = render(
      <PluginProvider plugins={[plugin]}>
        <TableView {...(props as DataViewRenderProps<unknown>)} />
      </PluginProvider>,
    );
    const header = getByText("Avatar");
    const cell = getByTestId("spec-cell");
    expect(cell.textContent).toBe("★");
    // Column order follows the schema: Name's header, then Avatar's, then cells.
    expect(
      getByText("Name").compareDocumentPosition(header) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      getByText("alpha").compareDocumentPosition(cell) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
