import { Fragment, type ReactNode } from "react";
import {
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { useVirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import {
  StickyStack,
  StickyStackItem,
} from "@plugins/primitives/plugins/css/plugins/sticky/plugins/stack/web";
import { useElementSize } from "@plugins/primitives/plugins/element-size/web";
import {
  MdArrowDownward,
  MdArrowUpward,
  MdUnfoldMore,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import type {
  ColumnDef,
  DataTableGroup,
  DataTableProps,
  DataTableRowDecoration,
} from "./types";
import { useDataTable } from "./use-data-table";

/** No-op decoration hook so `DataTableRow` always calls a hook unconditionally
 *  (rules-of-hooks), whether or not the consumer supplied `useRowDecoration`. */
const noRowDecoration = (): DataTableRowDecoration | undefined => undefined;

/** Above this row count the table windows its rows via the shared virtualizer
 *  (keeps the subgrid + sticky header; only the visible slice is in the DOM).
 *  Smaller tables keep the plain map — no virtualizer overhead. Exported because
 *  a drag-reordering consumer must know whether the body windows to decide
 *  whether its `RankReorderProvider` needs `measuringAlways`. */
export const VIRTUALIZE_THRESHOLD = 100;

/**
 * Compose two callback refs into one. A row can be a drag source (decoration
 * ref) AND a virtualizer measurement target (measure ref) at the same time, and
 * a DOM node takes one `ref`. The repo has no `mergeRefs`/`composeRefs` helper
 * today; lift this into a primitive if a second caller needs it.
 */
function composeRefs(
  a: ((el: HTMLElement | null) => void) | undefined,
  b: ((el: Element | null) => void) | undefined,
): ((el: HTMLDivElement | null) => void) | undefined {
  if (!a) return b;
  if (!b) return a;
  return (el) => {
    a(el);
    b(el);
  };
}

/** Estimated px per row; dynamic measurement via `virtualizer.measureElement`
 *  refines it after mount. */
const ROW_ESTIMATE = 36;

export function DataTable<TRow>({
  data,
  columns,
  groups,
  filter,
  rowKey,
  emptyLabel = "No results found",
  sortState: controlledSort,
  onToggleSort,
  onRowClick,
  rowActions,
  selectedRowId,
  useRowDecoration,
  keepMountedRowKeys,
  controlSize = "xs",
  stickyHeaderOffset = "0px",
}: DataTableProps<TRow>) {
  const { rows, sortState, toggleSort } = useDataTable(
    data,
    columns,
    filter,
    controlledSort,
    onToggleSort,
  );

  // Measure the sticky column-header row so group headers can stack directly
  // below it: their sticky `top` is `stickyHeaderOffset + this height`. Synchronous
  // initial measure (element-size) → correct on first paint, before any scroll.
  const [headerRef, { height: headerHeight }] = useElementSize();

  // In grouped mode the body rows come from each group (pre-sorted by the host
  // pipeline), not `data`; count them for the empty check.
  const bodyRowCount = groups
    ? groups.reduce((n, g) => n + g.rows.length, 0)
    : rows.length;

  if (bodyRowCount === 0) {
    return (
      <ControlSizeProvider size={controlSize}>
        <Center axis="both" className="h-32">
          <Text as="div" variant="caption" className="text-muted-foreground">
            {emptyLabel}
          </Text>
        </Center>
      </ControlSizeProvider>
    );
  }

  // One grid owns the column tracks; the header and every row are full-span
  // subgrids that inherit those exact tracks (and the column gap), so columns
  // align structurally — independent of content. Dynamic template → inline style.
  // A trailing `auto` track holds the hover-revealed per-row actions column.
  const template = [
    ...columns.map((col) => col.width ?? "auto"),
    ...(rowActions ? ["auto"] : []),
  ].join(" ");

  // Shared row renderer so the plain branch and the windowed branch render
  // identical rows. The optional `measure` handle is supplied only by the
  // virtualized branch (tanstack's measureElement reads the data-index). Routed
  // through `DataTableRow` (a component) so per-row decoration may call hooks.
  const decorate = useRowDecoration ?? noRowDecoration;
  const renderRow = (
    row: TRow,
    i: number,
    measure?: { ref: (el: Element | null) => void; index: number },
  ) => (
    <DataTableRow
      key={rowKey(row, i)}
      row={row}
      index={i}
      columns={columns}
      rowKey={rowKey}
      selectedRowId={selectedRowId}
      onRowClick={onRowClick}
      rowActions={rowActions}
      useRowDecoration={decorate}
      measure={measure}
    />
  );

  // Group headers pin flush beneath the sticky column header (which itself pins
  // at `stickyHeaderOffset`, below any consumer chrome such as a DataView toolbar).
  const groupHeaderTop = `calc(${stickyHeaderOffset} + ${Math.round(headerHeight)}px)`;

  return (
    <ControlSizeProvider size={controlSize}>
      {/* eslint-disable-next-line layout/no-adhoc-layout -- subgrid table host: a dynamic gridTemplateColumns grid whose rows are full-span subgrids (no Frame/Grid equivalent) */}
      <div className="grid gap-x-sm" style={{ gridTemplateColumns: template }}>
      {/* The column-header row pins to the scroll viewport at `stickyHeaderOffset`
          (0 by default; a DataView passes its toolbar height so the header stacks
          BELOW the toolbar instead of hiding behind it). `mask` follows the
          embedding surface so rows never show through the pinned bar. */}
      <Sticky
        as="div"
        ref={headerRef}
        edge="top"
        mask
        layer="raised"
        // eslint-disable-next-line layout/no-adhoc-layout -- sticky header is itself a full-span subgrid row inheriting the host's column tracks
        className="col-span-full grid grid-cols-subgrid border-b p-control text-3xs font-medium uppercase tracking-wider text-muted-foreground"
        style={{ top: stickyHeaderOffset }}
      >
        {columns.map((col) => {
          const sortable = !!col.value;
          const active = sortState?.columnId === col.id;
          return (
            <Text
              as="span"
              key={col.id}
              className={cn(
                alignClass(col.align),
                sortable && "cursor-pointer select-none",
              )}
              onClick={sortable ? () => toggleSort(col.id) : undefined}
            >
              {col.header}
              {sortable && (
                <SortIcon active={active} direction={active ? sortState!.direction : null} />
              )}
            </Text>
          );
        })}
        {rowActions && <span aria-hidden />}
      </Sticky>
      {groups
        ? renderGroupedBody(groups, renderRow, groupHeaderTop)
        : rows.length > VIRTUALIZE_THRESHOLD ? (
            <VirtualTableBody
              rows={rows}
              rowKey={rowKey}
              selectedRowId={selectedRowId}
              renderRow={renderRow}
              keepMounted={keepMountedRowKeys}
            />
          ) : (
            rows.map((row, i) => renderRow(row, i))
          )}
      </div>
    </ControlSizeProvider>
  );
}

/**
 * One table row. A component (not an inline closure) so `useRowDecoration` may be
 * called as a hook per row (e.g. `useRankReorderItem` for drag reorder). The
 * decoration adds a drag-source ref, spreads drag props, extra classes, and an
 * in-row overlay (drop indicators). Markup is byte-for-byte the legacy row when
 * no decoration is returned.
 */
function DataTableRow<TRow>({
  row,
  index,
  columns,
  rowKey,
  selectedRowId,
  onRowClick,
  rowActions,
  useRowDecoration,
  measure,
}: {
  row: TRow;
  index: number;
  columns: ColumnDef<TRow>[];
  rowKey: (row: TRow, index: number) => string;
  selectedRowId: string | undefined;
  onRowClick: ((row: TRow) => void) | undefined;
  rowActions: ((row: TRow, index: number) => ReactNode) | undefined;
  useRowDecoration: (row: TRow, index: number) => DataTableRowDecoration | undefined;
  measure?: { ref: (el: Element | null) => void; index: number };
}): ReactNode {
  const decoration = useRowDecoration(row, index);
  const key = rowKey(row, index);
  // Destructure-and-rename so render never does inline `decoration.ref` member
  // access on the hook output (react-hooks/refs flags member access on a ref
  // value in render; destructuring is fine — mirrors the tree's RowChrome).
  const decorationRef = decoration?.ref;
  const decorationProps = decoration?.props;
  const decorationClassName = decoration?.className;
  const decorationOverlay = decoration?.overlay;
  // A decorated row in a windowed body is BOTH a drag source and a measurement
  // target, so the two refs compose (they were mutually exclusive back when
  // decoration disabled virtualization).
  const rowRef = composeRefs(decorationRef, measure?.ref);
  return (
    <div
      ref={rowRef}
      data-index={measure?.index}
      // eslint-disable-next-line layout/no-adhoc-layout -- CSS subgrid row inheriting the outer grid's column tracks (no Frame/Grid equivalent for subgrid); `relative` hosts the decoration overlay
      className={cn(
        "group/dt-row col-span-full grid grid-cols-subgrid items-center border-b border-border/30 p-control text-caption hover:bg-accent/30",
        hoverRevealGroup,
        key === selectedRowId && "bg-accent",
        onRowClick && "cursor-pointer",
        decoration && "relative",
        decorationClassName,
      )}
      onClick={onRowClick ? () => onRowClick(row) : undefined}
      role={onRowClick ? "button" : undefined}
      tabIndex={onRowClick ? 0 : undefined}
      onKeyDown={
        onRowClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onRowClick(row);
              }
            }
          : undefined
      }
      {...decorationProps}
    >
      {columns.map((col) => (
        <Text as="div" key={col.id} className={alignClass(col.align)}>
          {col.cell
            ? col.cell(row)
            : col.value
              ? String(col.value(row) ?? "")
              : null}
        </Text>
      ))}
      {rowActions && (
        <Stack
          direction="row"
          align="center"
          justify="end"
          gap="xs"
          className={hoverRevealTarget}
          onClick={(e) => e.stopPropagation()}
        >
          {rowActions(row, index)}
        </Stack>
      )}
      {decorationOverlay}
    </div>
  );
}

/**
 * Windowed table body: renders only the visible slice of rows in normal grid
 * flow, with `col-span-full` spacers reserving the off-screen height — so the
 * outer subgrid column tracks and the sticky header stay intact (unlike the
 * absolute/translateY layout `VirtualRows` uses, which would drop rows out of
 * grid flow). A separate component so the virtualizer hook never runs for small
 * tables.
 *
 * `keepMounted` pins a row (an in-flight drag source) into the rendered range,
 * which makes `virtualItems` a NON-contiguous index sequence. So there is one
 * spacer per *gap*, not just a leading and a trailing one. With nothing pinned
 * the range is contiguous, every interior gap is 0, and the emitted DOM is
 * identical to the two-spacer form this generalizes.
 */
function VirtualTableBody<TRow>({
  rows,
  rowKey,
  selectedRowId,
  renderRow,
  keepMounted,
}: {
  rows: readonly TRow[];
  rowKey: (row: TRow, index: number) => string;
  selectedRowId: string | undefined;
  renderRow: (
    row: TRow,
    i: number,
    measure?: { ref: (el: Element | null) => void; index: number },
  ) => ReactNode;
  keepMounted: readonly string[] | undefined;
}) {
  // Reveal the selected row when selection changes off-screen.
  const selectedIndex = selectedRowId
    ? rows.findIndex((row, i) => rowKey(row, i) === selectedRowId)
    : -1;

  const { measureRef, virtualizer, virtualItems, totalSize, scrollMargin } =
    useVirtualRows<TRow>({
      items: rows,
      estimateSize: ROW_ESTIMATE,
      getKey: rowKey,
      scrollToIndex: selectedIndex >= 0 ? selectedIndex : null,
      keepMounted,
    });

  // The marker sits at the start of the row region (right after the sticky
  // header); scrollMargin is measured from it.
  // eslint-disable-next-line layout/no-adhoc-layout -- full-span spacer in the subgrid table that reserves the off-screen windowed height
  const marker = <div ref={measureRef} aria-hidden className="col-span-full h-0" />;

  if (virtualItems.length === 0) {
    return (
      <>
        {marker}
        {/* eslint-disable-next-line layout/no-adhoc-layout -- full-span spacer reserving the windowed table's total height */}
        <div aria-hidden className="col-span-full" style={{ height: totalSize }} />
      </>
    );
  }

  // Leading spacer: the rows above the first rendered one. `scrollMargin` is the
  // region's offset inside the scroller, which the virtualizer folds into every
  // `start`/`end` — so it is subtracted here (and at the trailing spacer), but
  // cancels in an interior gap, where both endpoints carry it.
  const paddingTop = virtualItems[0]!.start - scrollMargin;
  const paddingBottom =
    totalSize - (virtualItems[virtualItems.length - 1]!.end - scrollMargin);

  return (
    <>
      {marker}
      {paddingTop > 0 && (
        // eslint-disable-next-line layout/no-adhoc-layout -- full-span spacer reserving the off-screen rows above the window
        <div aria-hidden className="col-span-full" style={{ height: paddingTop }} />
      )}
      {virtualItems.map((vi, i) => {
        // Interior gap: nonzero only where the range skips indexes — i.e. between
        // a pinned row and the window. Contiguous items satisfy `start === prev.end`.
        const prev = i > 0 ? virtualItems[i - 1]! : null;
        const gap = prev ? vi.start - prev.end : 0;
        return (
          <Fragment key={vi.key}>
            {gap > 0 && (
              // eslint-disable-next-line layout/no-adhoc-layout -- full-span spacer reserving the rows skipped between a pinned row and the window
              <div aria-hidden className="col-span-full" style={{ height: gap }} />
            )}
            {renderRow(rows[vi.index]!, vi.index, {
              ref: virtualizer.measureElement,
              index: vi.index,
            })}
          </Fragment>
        );
      })}
      {paddingBottom > 0 && (
        // eslint-disable-next-line layout/no-adhoc-layout -- full-span spacer reserving the off-screen rows below the window
        <div aria-hidden className="col-span-full" style={{ height: paddingBottom }} />
      )}
    </>
  );
}

/**
 * Grouped (non-virtualized) body: a caller-built full-span header per group,
 * then the group's rows when not collapsed — all inside the single subgrid so
 * columns stay aligned across groups. The row index counter is global so
 * `rowKey(row, i)` stays stable/unique across groups.
 */
function renderGroupedBody<TRow>(
  groups: DataTableGroup<TRow>[],
  renderRow: (row: TRow, i: number) => ReactNode,
  groupHeaderTop: string,
): ReactNode {
  let i = 0;
  // Group headers accumulate: with few enough groups every header stays pinned,
  // each below the last (StickyStack sums their measured heights); past the
  // stack's cap it degrades to the swap hand-off, where each arriving header
  // covers the pinned one. `base` is the column header's own pinned bottom edge,
  // so the first group header pins flush beneath it.
  //
  // All group headers already share the one grid as their sticky containing block
  // (the subgrid table can't wrap a group in its own block without breaking column
  // alignment), which is exactly what the stack needs — and StickyStack renders no
  // element of its own, so the `col-span-full` headers stay direct grid children
  // and the tracks still line up. `mask` keeps rows from showing through.
  return (
    <StickyStack keys={groups.map((group) => group.key)} base={groupHeaderTop}>
      {groups.map((group) => (
        <Fragment key={group.key}>
          <StickyStackItem
            itemKey={group.key}
            as="div"
            mask
            layer="raised"
            // eslint-disable-next-line layout/no-adhoc-layout -- full-span sticky group-header row spanning the subgrid table's column tracks
            className="col-span-full"
          >
            {group.header}
          </StickyStackItem>
          {group.collapsed ? null : group.rows.map((row) => renderRow(row, i++))}
        </Fragment>
      ))}
    </StickyStack>
  );
}

function alignClass(align: ColumnDef<unknown>["align"]): string | undefined {
  return align === "end" ? "text-right" : align === "center" ? "text-center" : undefined;
}

function SortIcon({
  active,
  direction,
}: {
  active: boolean;
  direction: "asc" | "desc" | null;
}) {
  const Icon =
    direction === "asc"
      ? MdArrowUpward
      : direction === "desc"
        ? MdArrowDownward
        : MdUnfoldMore;
  return (
    <Icon
      size={12}
      // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off inline sort-icon offset next to the column header text
      className={cn(
        "mb-px ml-0.5 inline-block align-middle",
        active ? "text-foreground" : "text-muted-foreground/40",
      )}
    />
  );
}
