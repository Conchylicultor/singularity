import { type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  FieldCell,
  pickPrimaryField,
  useFlatRows,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type DataViewRenderProps,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import type { ListViewOptions } from "../../core";

/** Above this row count the list windows its rows (VirtualRows finds the nearest
 *  scroll ancestor); smaller lists keep the plain `.map` — no absolute
 *  positioning / measurement overhead, exact byte-for-byte legacy markup. */
const VIRTUALIZE_THRESHOLD = 100;

/**
 * List view: a compact, single-row-per-item dense list. Composes the `Row`
 * primitive (leading icon slot, selectable `bg-accent` highlight, hover-revealed
 * trailing actions) and maps the shared `FieldDef` schema field-driven:
 *
 * - primary field → top label line
 * - `align: "end"` fields → always-visible trailing region (inside the row body,
 *   before the hover actions) — e.g. a status badge
 * - remaining non-primary fields → muted subtitle line(s)
 *
 * `options.renderRow` is the escape hatch: it owns the whole body but is still
 * wrapped in the selectable/clickable `Row`.
 *
 * The host passes RAW rows; this view applies its own search/filter/sort via the
 * shared `useFlatRows` hook. `rows`/`fields` arrive type-erased as `unknown`;
 * this is the documented re-cast boundary for the view child.
 */
export function ListView(props: DataViewRenderProps<unknown>): ReactNode {
  const resolveCell = useResolveCell();
  const resolveEditor = useResolveCellEditor();
  const resolveOperatorSet = useResolveOperatorSet();
  const rows = useFlatRows(
    props.rows,
    props.fields,
    props.state,
    resolveOperatorSet,
    props.searchAccessor,
  );
  const fields = props.fields;
  const options = (props.options ?? {}) as ListViewOptions<unknown>;
  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

  // Loading wins over empty: emptyState requires confirmed-empty.
  if (props.loading) {
    return <>{props.loadingState ?? <Loading variant="rows" />}</>;
  }

  if (rows.length === 0) {
    return (
      <Center axis="both" className="py-xl">
        <Text as="div" variant="body" className="text-muted-foreground">
          {props.emptyState}
        </Text>
      </Center>
    );
  }

  const titleField = pickPrimaryField(fields);
  const trailingFields = fields.filter((f) => f.align === "end");
  const subtitleFields = fields.filter(
    (f) => f.id !== titleField?.id && f.align !== "end",
  );

  // Single source of row markup — shared verbatim by the plain and virtualized
  // branches so the two render identically.
  const renderRow = (row: unknown, i: number): ReactNode => {
    const key = props.rowKey(row, i);

    return (
      <Row
        key={key}
        selected={key === props.selectedRowId}
        size={options.size ?? "md"}
        onClick={() => props.onRowActivate?.(row)}
        icon={options.leading?.(row)}
        actions={
          itemActions ? (
            <itemActions.Row
              row={row}
              hasChildren={props.hasChildren?.(key) ?? false}
            />
          ) : undefined
        }
      >
        {options.renderRow ? (
          options.renderRow(row)
        ) : (
          <>
            <div className="flex min-w-0 flex-col overflow-hidden">
              {titleField ? (
                <Text
                  as="div"
                  variant="label"
                  className="truncate text-foreground"
                >
                  <FieldCell
                    field={titleField}
                    row={row}
                    resolveCell={resolveCell}
                    resolveEditor={resolveEditor}
                    display="block"
                  />
                </Text>
              ) : null}
              {subtitleFields.length > 0 ? (
                <Text
                  as="div"
                  variant="caption"
                  className="truncate text-muted-foreground"
                >
                  {subtitleFields.map((field, fi) => (
                    <span key={field.id}>
                      {fi > 0 ? " · " : null}
                      <FieldCell
                        field={field}
                        row={row}
                        resolveCell={resolveCell}
                        resolveEditor={resolveEditor}
                        display="inline"
                      />
                    </span>
                  ))}
                </Text>
              ) : null}
            </div>
            {trailingFields.length > 0 ? (
              <div className="ml-auto flex shrink-0 items-center gap-xs">
                {trailingFields.map((field) => (
                  <span key={field.id}>
                    <FieldCell
                      field={field}
                      row={row}
                      resolveCell={resolveCell}
                      resolveEditor={resolveEditor}
                      display="block"
                    />
                  </span>
                ))}
              </div>
            ) : null}
          </>
        )}
      </Row>
    );
  };

  // Window the render once the list is long enough to matter; otherwise keep the
  // plain `.map`. VirtualRows discovers the scroll ancestor itself — the pane's
  // single PaneScroll — so windowing is correct without threading a ref.
  const virtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const estimateSize = (options.size ?? "md") === "sm" ? 36 : 44;

  if (virtualize) {
    return (
      <VirtualRows<unknown>
        items={rows}
        estimateSize={estimateSize}
        getKey={(row, i) => props.rowKey(row, i)}
        itemClassName="px-sm"
      >
        {(row, i) => renderRow(row, i)}
      </VirtualRows>
    );
  }

  return (
    <Stack gap="none" className="p-sm">
      {rows.map((row, i) => renderRow(row, i))}
    </Stack>
  );
}
