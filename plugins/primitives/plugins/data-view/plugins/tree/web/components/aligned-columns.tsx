import type { CSSProperties, ReactNode } from "react";
import {
  FieldCell,
  DATA_VIEW_HEADER_OFFSET_VAR,
  useResolveCell,
  useResolveCellEditor,
  type FieldDef,
  type SortRule,
} from "@plugins/primitives/plugins/data-view/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Sticky } from "@plugins/primitives/plugins/css/plugins/sticky/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const arrowUpwardIcon = symbol("arrow-upward");
const arrowDownwardIcon = symbol("arrow-downward");

/** A column's width when its field declares none a row can use. */
const DEFAULT_COLUMN_WIDTH = "6rem";

/**
 * The fixed width of an aligned column, from the field's `width`.
 *
 * `FieldDef.width` is a table GRID TRACK (`"12rem"`, `"auto"`, `"minmax(0,1fr)"`).
 * A tree row is a flex line, not a grid, so only a definite length carries over;
 * a content-sized or flexible track has no meaning when each row sizes its own
 * cells, and falls back to the default — every row must agree on the width, or
 * the columns stop lining up, which is the whole point of the mode.
 */
export function alignedColumnWidth(field: FieldDef<unknown>): string {
  const w = field.width?.trim();
  if (!w || /auto|minmax|content|\dfr\b/.test(w)) {
    return DEFAULT_COLUMN_WIDTH;
  }
  return w;
}

/** Aligned cells default to the end edge (dates, sizes, counts read right-aligned). */
function alignClass(field: FieldDef<unknown>): string {
  const align = field.align ?? "end";
  return align === "end"
    ? "text-right"
    : align === "center"
      ? "text-center"
      : "text-left";
}

function columnStyle(field: FieldDef<unknown>): CSSProperties {
  return { width: alignedColumnWidth(field) };
}

/**
 * A row's secondary fields as fixed-width, edge-aligned cells — the aligned
 * twin of the trailing chips. Rendered LAST in the row (after the flexible
 * label), so whatever the row's depth, its cells sit on the same right edge as
 * every other row's and as the header's.
 */
export function AlignedCells<TRow>({
  row,
  fields,
}: {
  row: TRow;
  fields: FieldDef<TRow>[];
}): ReactNode {
  const resolveCell = useResolveCell();
  const resolveEditor = useResolveCellEditor();
  return (
    <>
      {fields.map((f) => (
        <span
          key={f.id}
          data-aligned-cell={f.id}
          // A fixed-width cell of the tree row's flex line: it truncates
          // inside its own width, so every row's column lines up.
          className={cn(
            rigidClass(),
            // `text-row-meta`: muted, or the selected row's meta colour when
            // the row is selected and the theme sets one.
            "truncate text-caption text-row-meta",
            alignClass(f as FieldDef<unknown>),
          )}
          style={columnStyle(f as FieldDef<unknown>)}
        >
          <FieldCell
            field={f as FieldDef<unknown>}
            row={row}
            resolveCell={resolveCell}
            resolveEditor={resolveEditor}
            display="inline"
          />
        </span>
      ))}
      <AlignedEndInset />
    </>
  );
}

/**
 * The last column's end inset: the cells (and their titles) stop a step in from
 * the row's edge rather than on its padding, so the row's fill reaches past
 * them. Rigid, so it survives the label's truncation.
 */
function AlignedEndInset(): ReactNode {
  return <span aria-hidden className={cn(rigidClass(), "pl-xs")} />;
}

/**
 * One column title: a sort toggle when the field sorts (writing the view's own
 * sort, the same `setSort` the table's headers call), plain text otherwise.
 */
function HeaderCell({
  field,
  sortHeader,
  setSort,
  className,
  style,
}: {
  field: FieldDef<unknown>;
  sortHeader: { active: readonly SortRule[]; sortable: ReadonlySet<string> };
  setSort: (fieldId: string) => void;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const title = typeof field.header === "string" ? field.header : field.label;
  const text = field.header === false ? "" : title;
  if (!sortHeader.sortable.has(field.id)) {
    return (
      <span className={className} style={style}>
        {text}
      </span>
    );
  }
  const active = sortHeader.active.find((r) => r.fieldId === field.id);
  return (
    <button
      type="button"
      onClick={() => setSort(field.id)}
      aria-label={`Sort by ${field.label}`}
      aria-sort={
        active
          ? active.direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
      data-aligned-header={field.id}
      className={cn(
        "hover:text-foreground",
        active && "text-foreground",
        className,
      )}
      style={style}
    >
      {text}
      {active && (
        <Icon
          icon={
            active.direction === "asc" ? arrowUpwardIcon : arrowDownwardIcon
          }
          // eslint-disable-next-line spacing/no-adhoc-spacing -- one-off inline sort-arrow offset beside the column title (mirrors the table header)
          className="ml-0.5 inline-block size-3 align-middle"
        />
      )}
    </button>
  );
}

/**
 * The aligned tree's column header: the primary field's title over the label
 * column, then one title per aligned cell, each the same width as the cells
 * beneath it. Pinned under the DataView's own toolbar (the host-published
 * header offset), so the titles stay readable while the tree scrolls.
 *
 * Geometry mirrors `TreeRowChrome` at depth 0 — the same inline padding, the
 * chevron slot's width and the same gap — so the titles sit over the label and
 * the cells by construction rather than by a measured offset.
 */
export function AlignedHeader({
  primaryField,
  fields,
  sortHeader,
  setSort,
}: {
  primaryField: FieldDef<unknown> | undefined;
  fields: FieldDef<unknown>[];
  sortHeader: { active: readonly SortRule[]; sortable: ReadonlySet<string> };
  setSort: (fieldId: string) => void;
}): ReactNode {
  return (
    <Sticky
      mask
      data-tree-column-header
      style={{ top: `var(${DATA_VIEW_HEADER_OFFSET_VAR}, 0px)` }}
    >
      <Stack
        direction="row"
        align="center"
        gap="xs"
        role="row"
        // A row tall, its rule inside; the titles in the small caption rung,
        // faint.
        className="min-h-tree-row border-b border-border px-xs text-caption-compact font-medium text-faint-foreground"
        // Depth 0's indent in `TreeRowChrome` (`depth * --tree-indent + 4px`).
        style={{ paddingLeft: 4 }}
      >
        {/* The chevron / icon slot's width, so the Name title sits on the label. */}
        <span className="size-5" aria-hidden />
        <Fill>
          {primaryField ? (
            <HeaderCell
              field={primaryField}
              sortHeader={sortHeader}
              setSort={setSort}
              className="text-left"
            />
          ) : null}
        </Fill>
        {fields.map((f) => (
          <HeaderCell
            key={f.id}
            field={f}
            sortHeader={sortHeader}
            setSort={setSort}
            className={cn(rigidClass(), alignClass(f))}
            style={columnStyle(f)}
          />
        ))}
        <AlignedEndInset />
      </Stack>
      {/* A 4px breath under the rule before the first row. */}
      <div aria-hidden className="pt-xs" />
    </Sticky>
  );
}
