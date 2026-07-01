import type { ReactNode } from "react";
import {
  DataTable,
  type ColumnDef,
  type DataTableGroup,
  type DataTableRowDecoration,
  type SortState as TableSortState,
} from "@plugins/primitives/plugins/data-table/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import {
  FieldCell,
  pickPrimaryField,
  resolveBodyFields,
  useDataViewSections,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type DataViewAggregateConfig,
  type DataViewRenderProps,
  type DataViewSection,
  type FieldValue,
  type ItemActionsDescriptor,
  type ManualOrderConfig,
  type SortRule,
} from "@plugins/primitives/plugins/data-view/web";
import {
  RankReorderProvider,
  useRankReorderItem,
} from "@plugins/primitives/plugins/rank-reorder/web";

/** FieldValue → data-table's `string | number | undefined` comparable projection. */
function coerce(value: FieldValue): string | number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return Number(value);
  if (value === null) return undefined;
  return value;
}

/**
 * Map the data-view PRIMARY sort rule onto data-table's single-column sort
 * indicator. Secondary rules don't paint a header arrow (the sort popover is the
 * full multi-sort surface); the data-table primitive stays single-sort.
 */
function mapPrimary(rules: SortRule[]): TableSortState | null {
  const p = rules[0];
  return p ? { columnId: p.fieldId, direction: p.direction } : null;
}

export function TableView(props: DataViewRenderProps<unknown>): ReactNode {
  // Resolved unconditionally (hooks rules) BEFORE the early empty-state return.
  const resolveCell = useResolveCell();
  const resolveEditor = useResolveCellEditor();
  // Rows arrive RAW; the section pipeline applies flat search/filter/sort and
  // group-by partitioning.
  const resolveOperatorSet = useResolveOperatorSet();
  // Manual order arrives type-erased; present only when the host activated it.
  const manualOrder = props.manualOrder as ManualOrderConfig<unknown> | undefined;
  // Aggregate arrives type-erased; present only when the consumer supplied it.
  const aggregate = props.aggregate as
    | DataViewAggregateConfig<unknown>
    | undefined;
  const sections = useDataViewSections(
    props.rows,
    props.fields,
    props.state,
    resolveOperatorSet,
    props.searchAccessor,
    { rowKey: props.rowKey, manualRank: manualOrder?.getRank, aggregate },
  );

  // Per-row decoration hook (called once per row inside DataTable's row
  // component, so it may call hooks): the whole row is the rank-reorder drag
  // source, with hover before/after drop indicators. Defined unconditionally
  // (recognized as a hook by name); passed to DataTable only in manual mode.
  function useRowDecoration(
    row: unknown,
    i: number,
  ): DataTableRowDecoration | undefined {
    const id = props.rowKey(row, i);
    const { dragSource, isDragging, beforeRef, afterRef, isOverBefore, isOverAfter } =
      useRankReorderItem(id, manualOrder!.getRank(row));
    // Destructure-and-rename so we never do inline `dragSource.ref` member access
    // (react-hooks/refs flags member access on the hook output; destructuring is
    // fine — mirrors the tree's RowChrome precedent).
    const { ref: dragRef, attributes: dragAttributes, listeners: dragListeners } =
      dragSource;
    return {
      ref: dragRef,
      props: { ...dragAttributes, ...dragListeners },
      className: isDragging ? "opacity-40" : undefined,
      overlay: (
        <>
          <Pin ref={beforeRef} to="top" stretch decorative className="h-[6px]">
            {isOverBefore && (
              // eslint-disable-next-line layout/no-adhoc-layout -- DnD drop-indicator bar, inset on both x edges (Pin has no inset-both-edges anchor)
              <div className="bg-primary absolute inset-x-1 top-0 h-[2px] rounded-full" />
            )}
          </Pin>
          <Pin ref={afterRef} to="bottom" stretch decorative className="h-[6px]">
            {isOverAfter && (
              // eslint-disable-next-line layout/no-adhoc-layout -- DnD drop-indicator bar, inset on both x edges (Pin has no inset-both-edges anchor)
              <div className="bg-primary absolute inset-x-1 bottom-0 h-[2px] rounded-full" />
            )}
          </Pin>
        </>
      ),
    };
  }

  // The host owns loading→empty precedence (it skips this view while loading),
  // so an empty section set always means confirmed-empty.
  const totalCount = sections.reduce((sum, s) => sum + s.count, 0);
  // DataTable's `emptyLabel` is string-only; render a custom empty node here so
  // the host-provided `emptyState` (ReactNode) is honored.
  if (totalCount === 0 && props.emptyState !== undefined) {
    return <>{props.emptyState}</>;
  }

  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

  // Body columns follow the view's Properties (visible-fields) policy: which
  // fields and in what order. `null` → identity (`props.fields`), so a view with
  // no Properties configured renders every column unchanged. Sort/filter/search
  // above still run over the FULL `props.fields`.
  const vis = resolveBodyFields(props.fields, props.state.visibleFields);
  // Aggregate representatives carry a `×N` badge in the primary cell. Key the
  // count by row OBJECT identity (the cell renderer gets the row, not its index),
  // which is stable since the representative row object flows through unchanged.
  const aggregateCountByRow = new Map<unknown, number>();
  for (const section of sections) {
    for (const entry of section.entries) {
      if (entry.aggregateCount && entry.aggregateCount > 1) {
        aggregateCountByRow.set(entry.row, entry.aggregateCount);
      }
    }
  }
  // Primary picked over the VISIBLE subset so the badge lands on a rendered
  // column (matches the list/gallery `pickPrimaryField(vis)` semantics).
  const primaryFieldId = pickPrimaryField(vis)?.id ?? vis[0]?.id;

  const columns: ColumnDef<unknown>[] = vis.map((f) => ({
    id: f.id,
    header: f.label,
    width: f.width,
    align: f.align,
    value: f.value ? (row: unknown) => coerce(f.value!(row)) : undefined,
    cell: (row: unknown) => {
      const cell = (
        <FieldCell
          field={f}
          row={row}
          resolveCell={resolveCell}
          resolveEditor={resolveEditor}
        />
      );
      const count =
        f.id === primaryFieldId ? aggregateCountByRow.get(row) : undefined;
      if (!count) return cell;
      return (
        <Inline gap="xs">
          {cell}
          <Badge variant="muted">{`×${count}`}</Badge>
        </Inline>
      );
    },
  }));

  const rowActions = itemActions
    ? (row: unknown, i: number) => (
        <itemActions.Row
          row={row}
          hasChildren={props.hasChildren?.(props.rowKey(row, i)) ?? false}
        />
      )
    : undefined;

  const shared = {
    columns,
    rowKey: props.rowKey,
    sortState: mapPrimary(props.state.sort),
    onToggleSort: (columnId: string) => props.setSort(columnId),
    onRowClick: props.onRowActivate,
    selectedRowId: props.selectedRowId,
    filter: undefined,
    emptyLabel: "No results found",
    rowActions,
    // Manual order: per-row drag affordances (disables virtualization in
    // DataTable). Sort is already hidden by the host while manual order is on.
    useRowDecoration: manualOrder ? useRowDecoration : undefined,
  };

  // Ungrouped: the single implicit section renders as today (no group headers).
  const table =
    sections.length === 1 && sections[0]!.key === null ? (
      <DataTable data={sections[0]!.entries.map((e) => e.row)} {...shared} />
    ) : (
      // Grouped: interleave a full-width collapsible header row per section.
      <DataTable
        data={[]}
        groups={sections.map((section): DataTableGroup<unknown> => {
          const key = section.key!;
          const collapsed = props.collapsedSections?.has(key) ?? false;
          return {
            key,
            collapsed,
            rows: section.entries.map((e) => e.row),
            header: (
              <SectionHeaderRow
                open={!collapsed}
                onClick={() => props.setSectionCollapsed?.(key, !collapsed)}
                actions={
                  <Text variant="caption" tone="muted">
                    {section.count}
                  </Text>
                }
              >
                {section.label}
              </SectionHeaderRow>
            ),
          };
        })}
        {...shared}
      />
    );

  // Manual order: wrap the table in one rank-reorder DnD host spanning every
  // section, so a drag reseats within or across sections (the destination
  // section's key flows back as `dest.groupKey`).
  if (manualOrder) {
    return (
      <RankReorderProvider
        items={manualOrderItems(sections, manualOrder)}
        onMove={(id, dest) =>
          manualOrder.onMove(id, { rank: dest.rank, groupKey: dest.group })
        }
        dragOverlay={(id) => manualOrderOverlay(sections, columns, id)}
      >
        {table}
      </RankReorderProvider>
    );
  }
  return table;
}

/** Flatten the sections into the rank-reorder item list (id + rank + group). */
function manualOrderItems(
  sections: DataViewSection<unknown>[],
  manualOrder: ManualOrderConfig<unknown>,
) {
  return sections.flatMap((section) =>
    section.entries.map((entry) => ({
      id: entry.key,
      rank: manualOrder.getRank(entry.row),
      group: section.key,
    })),
  );
}

/** Drag-chip content: the dragged row's first column cell (host wraps it). */
function manualOrderOverlay(
  sections: DataViewSection<unknown>[],
  columns: ColumnDef<unknown>[],
  id: string,
): ReactNode {
  const entry = sections.flatMap((s) => s.entries).find((e) => e.key === id);
  const col = columns[0];
  if (!entry || !col?.cell) return entry ? id : null;
  return col.cell(entry.row);
}
