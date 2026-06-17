import { type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
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
import type { ListViewOptions } from "../../core";

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
      <Text
        as="div"
        variant="body"
        className={cn(
          "flex items-center justify-center text-muted-foreground",
          props.embedded ? "py-xl" : "h-full p-xl",
        )}
      >
        {props.emptyState}
      </Text>
    );
  }

  const titleField = pickPrimaryField(fields);
  const trailingFields = fields.filter((f) => f.align === "end");
  const subtitleFields = fields.filter(
    (f) => f.id !== titleField?.id && f.align !== "end",
  );

  return (
    <div className={cn("flex flex-col", !props.embedded && "p-sm")}>
      {rows.map((row, i) => {
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
                <div className="flex min-w-0 flex-col">
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
      })}
    </div>
  );
}
