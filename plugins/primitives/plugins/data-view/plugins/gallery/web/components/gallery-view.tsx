import { type ReactNode } from "react";
import { MdAdd } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import {
  FieldCell,
  pickPrimaryField,
  resolveBodyFields,
  useDataViewSections,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type CreateOption,
  type DataViewAggregateConfig,
  type DataViewRenderProps,
  type FieldDef,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import type { CoverContent, GalleryViewOptions } from "../../core";
import { DataCard } from "./data-card";
import { useGridColumns } from "./use-grid-columns";

/** Above this card count the gallery windows its grid (lane-aware: each windowed
 *  row holds one measured row of `columns` cards). Smaller galleries keep the
 *  plain auto-fill `.map`. */
const VIRTUALIZE_THRESHOLD = 60;

/** One grid cell: a data row (carrying its precomputed key) or the trailing
 *  dashed "+" create card. */
type GalleryCell =
  | { kind: "row"; row: unknown; key: string; aggregateCount?: number }
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
        <Center className="aspect-video w-full rounded-md bg-primary/10 text-primary">
          {cover.icon}
        </Center>
      );
    case "node":
      return (
        <Clip className="aspect-video w-full rounded-md border border-border bg-muted/40">
          {cover.node}
        </Clip>
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
 * Gallery view: a responsive card grid. Renders against `useDataViewSections`:
 * ungrouped → the legacy single grid (byte-for-byte); grouped → one collapsible
 * grid per section. Windowing still applies WITHIN a section's cells.
 *
 * `rows`/`fields` arrive type-erased as `unknown`; this is the documented re-cast
 * boundary for the view child.
 */
export function GalleryView(props: DataViewRenderProps<unknown>): ReactNode {
  const resolveCell = useResolveCell();
  const resolveEditor = useResolveCellEditor();
  const resolveOperatorSet = useResolveOperatorSet();
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
    { rowKey: props.rowKey, aggregate },
  );
  // Body fields follow the view's Properties (visible-fields) policy; sort/filter/
  // search above keep using the full `props.fields`. `null` → identity, so the
  // cover/title/body picks are byte-for-byte the legacy schema-order behavior.
  const vis = resolveBodyFields(props.fields, props.state.visibleFields);
  const options = (props.options ?? {}) as GalleryViewOptions<unknown>;
  const minCardWidth = options.minCardWidth ?? 200;
  // Live column count for the windowed path (measured off the probe grid below).
  const { probeRef, columns } = useGridColumns(minCardWidth);
  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

  // Documented cast boundary: creators arrives type-erased via render props.
  const creators = props.creators as CreateOption[] | undefined;

  const totalCount = sections.reduce((sum, s) => sum + s.count, 0);
  if (totalCount === 0) {
    return (
      <Stack align="center" justify="center" gap="md" className="py-xl">
        <Text as="div" variant="body" className="text-muted-foreground">
          {props.emptyState}
        </Text>
        {creators?.length ? (
          <Stack align="center" gap="sm">
            {creators.map((c) => (
              <Button key={c.id} onClick={() => void c.onSelect()}>
                {c.icon}
                {c.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </Stack>
    );
  }

  const coverField = pickCoverField(vis, options.coverField);
  const titleField = pickPrimaryField(vis);

  // Single source of cell markup — shared by the plain and windowed branches.
  const renderCell = (cell: GalleryCell): ReactNode => {
    if (cell.kind === "create") {
      return (
        <Button
          variant="ghost"
          onClick={() => creators![0]!.onSelect()}
          className="focus-ring aspect-video rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-muted/40 hover:text-foreground"
        >
          <Stack gap="xs" align="center" justify="center" className="size-full">
            <MdAdd className="size-5" />
            <Text variant="label">{creators![0]!.label}</Text>
          </Stack>
        </Button>
      );
    }

    const { row, key } = cell;

    if (options.renderCard) {
      return <div className="contents">{options.renderCard(row)}</div>;
    }

    const media = renderMedia(options, coverField, row);
    const bodyFields = vis.filter(
      (f) => f.id !== titleField?.id && f.id !== coverField?.id,
    );

    // Aggregate representative → a persistent `×N` corner badge. Pinned top-left
    // so it never collides with the hover-revealed actions Pin (top-right).
    const aggregateCount = cell.aggregateCount;
    const card = (
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
          <Stack gap="2xs" className="mt-1">
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
          </Stack>
        ) : null}
      </DataCard>
    );
    if (!aggregateCount || aggregateCount <= 1) return card;
    return (
      <div className="relative">
        {card}
        <Pin to="top-left" offset="sm">
          <Badge variant="muted">{`×${aggregateCount}`}</Badge>
        </Pin>
      </div>
    );
  };

  const cellKey = (cell: GalleryCell): string =>
    cell.kind === "create" ? "::create" : cell.key;
  const estimateRowHeight = options.cover || coverField ? 240 : 132;

  // Render one section's cells: plain auto-fill grid below the threshold (exact
  // legacy markup), else the lane-aware windowed grid.
  const renderGrid = (cells: GalleryCell[]): ReactNode => {
    if (cells.length <= VIRTUALIZE_THRESHOLD) {
      return (
        <Grid minCellWidth={`${minCardWidth}px`} gap="lg" className="p-xl">
          {cells.map((cell) => (
            <div key={cellKey(cell)} className="contents">
              {renderCell(cell)}
            </div>
          ))}
        </Grid>
      );
    }
    const rowsOfCells = columns > 0 ? chunkRows(cells, columns) : [];
    return (
      <div className="p-xl">
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
              <Grid cols={columns} gap="lg" className="pb-lg">
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
  };

  // Ungrouped: the single implicit section renders as the legacy single grid,
  // with the trailing "+" create card appended.
  if (sections.length === 1 && sections[0]!.key === null) {
    const cells: GalleryCell[] = sections[0]!.entries.map((e) => ({
      kind: "row",
      row: e.row,
      key: e.key,
      aggregateCount: e.aggregateCount,
    }));
    if (options.showCreateCard && creators?.length === 1) {
      cells.push({ kind: "create" });
    }
    return renderGrid(cells);
  }

  // Grouped: one collapsible grid per section.
  return (
    <Stack gap="none">
      {sections.map((section) => {
        const key = section.key!;
        const collapsed = props.collapsedSections?.has(key) ?? false;
        const cells: GalleryCell[] = section.entries.map((e) => ({
          kind: "row",
          row: e.row,
          key: e.key,
        }));
        return (
          <Collapsible
            key={key}
            open={!collapsed}
            onOpenChange={(open) => props.setSectionCollapsed?.(key, !open)}
          >
            <SectionHeaderRow
              className="px-xl"
              actions={
                <Text variant="caption" tone="muted">
                  {section.count}
                </Text>
              }
            >
              {section.label}
            </SectionHeaderRow>
            <CollapsibleContent>{renderGrid(cells)}</CollapsibleContent>
          </Collapsible>
        );
      })}
    </Stack>
  );
}
