import { type ReactNode } from "react";
import { MdAdd } from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import {
  FieldCell,
  pickPrimaryField,
  useFlatRows,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type CreateOption,
  type DataViewRenderProps,
  type FieldDef,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import type { CoverContent, GalleryViewOptions } from "../../core";
import { DataCard } from "./data-card";
import { useGridColumns } from "./use-grid-columns";

/** Above this card count the gallery windows its grid (lane-aware: each windowed
 *  row holds one measured row of `columns` cards). Smaller galleries keep the
 *  plain auto-fill `.map` — no probe / observer / absolute-positioning overhead,
 *  byte-for-byte the legacy markup. Cards carry far more DOM than a list row, so
 *  the threshold sits below the list view's 100. */
const VIRTUALIZE_THRESHOLD = 60;

/** One grid cell: a data row or the trailing dashed "+" create card. Modelling
 *  the create card as a cell keeps it in grid flow AND inside the windowed
 *  stream (rather than a special trailing element outside virtualization). */
type GalleryCell =
  | { kind: "row"; row: unknown; index: number }
  | { kind: "create" };

/** Split a flat list into rows of `size` (the lane count). */
function chunkRows<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Pick the cover field: explicit `coverField` id wins, else the field marked
 * `cover: true`, else the first `media` field. Undefined → no media region.
 */
function pickCoverField<TRow>(
  fields: FieldDef<TRow>[],
  coverField: string | undefined,
): FieldDef<TRow> | undefined {
  if (coverField) {
    return fields.find((f) => f.id === coverField);
  }
  return (
    fields.find((f) => f.cover === true) ??
    fields.find((f) => f.type === "media")
  );
}

/** Paint a structured cover descriptor into a uniform `aspect-video` frame. */
function renderCover(cover: CoverContent): ReactNode {
  switch (cover.kind) {
    case "image":
      return (
        <img
          src={cover.src}
          alt=""
          className="aspect-video w-full rounded-md object-cover"
        />
      );
    case "icon":
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-md bg-primary/10 text-primary">
          {cover.icon}
        </div>
      );
    case "node":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-muted/40">
          {cover.node}
        </div>
      );
  }
}

function renderMedia<TRow>(
  options: GalleryViewOptions<TRow>,
  coverFieldDef: FieldDef<TRow> | undefined,
  row: TRow,
): ReactNode {
  // The structured cover producer wins — the sanctioned icon/node/image path.
  if (options.cover) {
    const cover = options.cover(row);
    return cover ? renderCover(cover) : null;
  }
  // Else fall back to the field-driven image cover.
  if (!coverFieldDef) return null;
  const raw = coverFieldDef.value?.(row);
  if (typeof raw === "string" && raw.length > 0) {
    return renderCover({ kind: "image", src: raw });
  }
  // Non-URL media (or custom cell) falls back to the field's renderer.
  return coverFieldDef.cell ? <div>{coverFieldDef.cell(row)}</div> : null;
}

/**
 * Gallery view: a responsive card grid. Renders the consumer's custom card via
 * `options.renderCard` (the custom card owns its own click handling), or a
 * field-driven default `<DataCard>` wired to `onRowActivate`.
 *
 * The host passes RAW rows; this view applies its own search/filter/sort via the
 * shared `useFlatRows` hook. `rows`/`fields` arrive type-erased as `unknown`;
 * this is the documented re-cast boundary for the view child.
 */
export function GalleryView(props: DataViewRenderProps<unknown>): ReactNode {
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
  const options = (props.options ?? {}) as GalleryViewOptions<unknown>;
  const minCardWidth = options.minCardWidth ?? 200;
  // Live column count for the windowed path (measured off the probe grid below).
  const { probeRef, columns } = useGridColumns(minCardWidth);
  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

  // Loading wins over empty: emptyState requires confirmed-empty.
  if (props.loading) {
    return <>{props.loadingState ?? <Loading variant="cards" count={8} />}</>;
  }

  // Documented cast boundary: creators arrives type-erased via render props.
  const creators = props.creators as CreateOption[] | undefined;

  if (rows.length === 0) {
    return (
      <Stack
        align="center"
        justify="center"
        gap="md"
        className={cn(props.embedded ? "py-xl" : "h-full p-xl")}
      >
        <Text as="div" variant="body" className="text-muted-foreground">
          {props.emptyState}
        </Text>
        {creators?.length ? (
          <Stack align="center" gap="sm">
            {creators.map((c) => (
              <Button key={c.id} size="sm" onClick={() => void c.onSelect()}>
                {c.icon}
                {c.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </Stack>
    );
  }

  const coverField = pickCoverField(fields, options.coverField);
  const titleField = pickPrimaryField(fields);

  // Single source of cell markup — shared verbatim by the plain and windowed
  // branches so the two render identically (the list view's `renderRow` twin).
  const renderCell = (cell: GalleryCell): ReactNode => {
    if (cell.kind === "create") {
      // Trailing "+" card: single-creator only. Multiple creators → omitted (a
      // single dashed card can't express an N-way choice; they get the toolbar
      // menu instead).
      return (
        <Button
          variant="ghost"
          onClick={() => creators![0]!.onSelect()}
          className="focus-ring flex aspect-video flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-muted/40 hover:text-foreground"
        >
          <MdAdd className="size-5" />
          <Text variant="label">{creators![0]!.label}</Text>
        </Button>
      );
    }

    const { row, index } = cell;
    const key = props.rowKey(row, index);

    if (options.renderCard) {
      // Custom card owns click + actions; never wrapped or re-wired here.
      // `display:contents` dissolves this key-holder wrapper so the card
      // itself is the grid item (stretched by justify-items, like the
      // default DataCard path) — a plain block wrapper would let a
      // width-less custom card shrink-wrap to its content.
      return (
        <div className="contents">{options.renderCard(row)}</div>
      );
    }

    const media = renderMedia(options, coverField, row);
    const bodyFields = fields.filter(
      (f) => f.id !== titleField?.id && f.id !== coverField?.id,
    );

    return (
      <DataCard
        selected={key === props.selectedRowId}
        onActivate={() => props.onRowActivate?.(row)}
        media={media}
        actions={
          itemActions ? (
            <itemActions.Row
              row={row}
              hasChildren={props.hasChildren?.(key) ?? false}
            />
          ) : undefined
        }
      >
        {titleField ? (
          <Text
            as="div"
            variant="label"
            className="truncate font-semibold text-foreground"
          >
            <FieldCell
              field={titleField}
              row={row}
              resolveCell={resolveCell}
              resolveEditor={resolveEditor}
            />
          </Text>
        ) : null}
        {bodyFields.length > 0 ? (
          // eslint-disable-next-line spacing/no-adhoc-spacing -- top offset separating the body block from the card title
          <div className="mt-1 flex flex-col gap-2xs">
            {bodyFields.map((field) => (
              <Text
                as="div"
                key={field.id}
                variant="caption"
                className="truncate text-muted-foreground"
              >
                <FieldCell
                  field={field}
                  row={row}
                  resolveCell={resolveCell}
                  resolveEditor={resolveEditor}
                />
              </Text>
            ))}
          </div>
        ) : null}
      </DataCard>
    );
  };

  // Flat cell stream: every data row, plus the trailing create card when
  // exactly one creator is present.
  const cells: GalleryCell[] = rows.map((row, index) => ({
    kind: "row",
    row,
    index,
  }));
  if (options.showCreateCard && creators?.length === 1) {
    cells.push({ kind: "create" });
  }
  const cellKey = (cell: GalleryCell): string =>
    cell.kind === "create" ? "::create" : props.rowKey(cell.row, cell.index);

  // Below the threshold keep the plain responsive auto-fill grid — exact legacy
  // markup, no probe / observer / windowing overhead.
  if (cells.length <= VIRTUALIZE_THRESHOLD) {
    return (
      <Grid
        minCellWidth={`${minCardWidth}px`}
        gap="lg"
        className={cn(!props.embedded && "p-xl")}
      >
        {cells.map((cell) => (
          <div key={cellKey(cell)} className="contents">
            {renderCell(cell)}
          </div>
        ))}
      </Grid>
    );
  }

  // Windowed (lane-aware): a zero-height probe grid (same gap as the real grid)
  // is measured to derive how many columns fit at the current width; we chunk
  // the cells into rows of that many lanes and window the row stream through the
  // shared <VirtualRows>. Each windowed row is a fixed `columns`-wide grid, so
  // its layout is pixel-identical to the auto-fill grid at the same width.
  // `pb-lg` re-creates the inter-row vertical gap the windowing sizer drops
  // (rows are absolutely stacked at measured offsets with no gap of their own).
  const rowsOfCells = columns > 0 ? chunkRows(cells, columns) : [];
  const estimateRowHeight = options.cover || coverField ? 240 : 132;

  return (
    <div className={cn(!props.embedded && "p-xl")}>
      <Grid
        ref={probeRef}
        aria-hidden
        minCellWidth={`${minCardWidth}px`}
        gap="lg"
        className="h-0"
      />
      {columns > 0 ? (
        <VirtualRows<GalleryCell[]>
          items={rowsOfCells}
          estimateSize={estimateRowHeight}
          getKey={(chunk) => chunk.map(cellKey).join("|")}
        >
          {(chunk) => (
            <Grid
              cols={columns}
              minCellWidth={`${minCardWidth}px`}
              gap="lg"
              className="pb-lg"
            >
              {chunk.map((cell) => (
                <div key={cellKey(cell)} className="contents">
                  {renderCell(cell)}
                </div>
              ))}
            </Grid>
          )}
        </VirtualRows>
      ) : null}
    </div>
  );
}
