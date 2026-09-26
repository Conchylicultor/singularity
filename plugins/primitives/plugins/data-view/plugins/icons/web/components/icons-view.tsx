import { type ReactNode } from "react";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  Avatar,
  AvatarPresentationProvider,
} from "@plugins/primitives/plugins/avatar/web";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import {
  RankReorderProvider,
  useRankSortableItem,
} from "@plugins/primitives/plugins/rank-reorder/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import {
  FieldCell,
  FoldLine,
  GroupedSections,
  leadingSlot,
  pickLeadingField,
  pickPrimaryField,
  resolveBodyFields,
  useDataViewSections,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type DataViewRenderProps,
  type DataViewRowEntry,
  type DataViewSection,
  type FieldDef,
  type ManualOrderConfig,
} from "@plugins/primitives/plugins/data-view/web";
import { useIconColumns } from "./use-icon-columns";

/** Above this tile count a section windows its grid, one measured lane per
 *  windowed row. Smaller launchers keep the plain grid. */
const VIRTUALIZE_THRESHOLD = 120;

/**
 * The grid's geometry, on every grid (and the probe) rather than the view root:
 * a container query styles the container's DESCENDANTS, never the container.
 * Wide: 116px columns, 72px tiles, `lg` column gap. Under 760px of view
 * width: 92px columns, 60px tiles, `sm` column gap. The row gap is the grid's
 * own `gap` (`2xl`); `gap-x-*` refines only the column axis. The view starts
 * flush: space above the first row belongs to whatever sits there (a toolbar
 * arrangement's `spaceBelow`).
 */
const GRID_GEOMETRY = cn(
  "gap-x-lg [--icons-cell:116px] [--icons-tile:72px]",
  "@max-[760px]/icons:gap-x-sm @max-[760px]/icons:[--icons-cell:92px] @max-[760px]/icons:[--icons-tile:60px]",
);
const CELL_WIDTH = "var(--icons-cell)";

/** Split a flat list into lanes of `size` (the column count). */
function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Wraps one tile with its sortable drag wiring: the tile follows the pointer
 * while dragged and the others of its section reflow around it (the grid
 * strategy moves each tile to the slot it will take). Only mounted in
 * manual-order mode.
 */
function ManualOrderTile({
  id,
  rank,
  group,
  children,
}: {
  id: string;
  rank: Rank;
  group: string | null;
  children: ReactNode;
}): ReactNode {
  // Destructured so render never reads a member off the hook output
  // (react-hooks/refs), mirroring the list view.
  const { ref, attributes, listeners, style } = useRankSortableItem(
    id,
    rank,
    group,
  );
  return (
    <div ref={ref} style={style} {...attributes} {...listeners}>
      {children}
    </div>
  );
}

/**
 * Icons view: a launcher grid — fixed-width cells centred in the view, each a
 * coloured tile with the row's name underneath (a phone home screen).
 *
 * The tile is the schema's leading field (`FieldDef.leading`) drawn inside
 * `<AvatarPresentationProvider value="tile">`, so an avatar cell fills it
 * flat; a schema with no leading field gets a derived-colour letter tile, so
 * switching any DataView to icons still draws something. The name is the
 * primary field. Item actions, selection and aggregation are not rendered — a
 * launcher has none.
 *
 * `rows`/`fields` arrive type-erased as `unknown`; this is the documented
 * re-cast boundary for the view child.
 */
export function IconsView(props: DataViewRenderProps<unknown>): ReactNode {
  const resolveCell = useResolveCell();
  const resolveEditor = useResolveCellEditor();
  const resolveOperatorSet = useResolveOperatorSet();
  // Manual order arrives type-erased; present only when the host activated it.
  const manualOrder = props.manualOrder as
    ManualOrderConfig<unknown> | undefined;
  const onReseat = manualOrder?.onReseat;
  const sections = useDataViewSections(
    props.rows,
    props.fields,
    props.state,
    resolveOperatorSet,
    props.searchAccessor,
    {
      rowKey: props.rowKey,
      manualRank: manualOrder?.getRank,
      now: props.now,
      groupOrder: props.groupOrder,
      openFolds: props.foldLines?.open,
      selectedRowId: props.selectedRowId,
    },
  );
  const { probeRef, columns } = useIconColumns();
  const vis = resolveBodyFields(props.fields, props.state.visibleFields);

  const totalCount = sections.reduce((sum, s) => sum + s.count, 0);
  if (totalCount === 0) {
    return (
      <Center axis="both" className="py-xl">
        <Text as="div" variant="body" className="text-muted-foreground">
          {props.emptyState}
        </Text>
      </Center>
    );
  }

  const leadingField = pickLeadingField(vis);
  const titleField = pickPrimaryField(vis.filter((f) => f !== leadingField));

  const renderName = (row: unknown): ReactNode =>
    titleField ? (
      <FieldCell
        field={titleField}
        row={row}
        resolveCell={resolveCell}
        resolveEditor={resolveEditor}
        display="inline"
      />
    ) : null;

  const renderTile = (row: unknown, key: string): ReactNode => {
    const activate = props.rowActivation?.(row);
    return (
      <Stack
        gap="md"
        align="center"
        role={activate ? "button" : undefined}
        tabIndex={activate ? 0 : undefined}
        // Straight through, `undefined` and all: a non-activating tile is a
        // plain container, not a button that does nothing.
        onClick={activate}
        onKeyDown={
          activate
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate();
                }
              }
            : undefined
        }
        data-row-key={key}
        className={cn(
          "group/icon focus-ring rounded-xl px-xs pt-md pb-sm",
          activate && "cursor-pointer",
        )}
      >
        <Center
          className={cn(
            "size-[var(--icons-tile)]",
            // The mock's press/lift: lift on hover or keyboard focus, sink on
            // press, on a slightly overshooting curve.
            "transition-transform duration-200 ease-[cubic-bezier(.3,.7,.4,1.3)]",
            "group-hover/icon:-translate-y-0.5 group-focus-visible/icon:-translate-y-0.5",
            "group-active/icon:translate-y-0 group-active/icon:scale-[.96]",
          )}
        >
          <AvatarPresentationProvider value="tile">
            {leadingSlot({
              field: leadingField,
              row,
              resolveCell,
              resolveEditor,
              // A launcher tile has no per-view leading option to add.
              own: undefined,
            }) ?? (
              <Avatar
                shape="squircle"
                fallbackKey={key}
                fallbackGlyph={initialOf(titleField, row, key)}
              />
            )}
          </AvatarPresentationProvider>
        </Center>
        <Text
          as="div"
          variant="caption"
          className="max-w-full truncate text-center text-muted-foreground transition-colors group-hover/icon:text-foreground group-focus-visible/icon:text-foreground"
        >
          {renderName(row)}
        </Text>
      </Stack>
    );
  };

  // One entry's node: in manual-order mode wrapped in its drag affordances,
  // except a null-rank (non-orderable) entry, which renders plain.
  const renderEntry = (
    entry: DataViewRowEntry<unknown>,
    group: string | null,
  ): ReactNode => {
    const tile = renderTile(entry.row, entry.key);
    const rank = manualOrder?.getRank(entry.row);
    if (rank == null) return <div key={entry.key}>{tile}</div>;
    return (
      <ManualOrderTile key={entry.key} id={entry.key} rank={rank} group={group}>
        {tile}
      </ManualOrderTile>
    );
  };

  const renderGrid = (
    entries: DataViewRowEntry<unknown>[],
    activeId: string | null,
    group: string | null,
  ): ReactNode => {
    // A section whose tiles are all folded draws no grid — its header and fold
    // line say everything.
    if (entries.length === 0) return null;
    if (entries.length <= VIRTUALIZE_THRESHOLD) {
      return (
        <Grid
          cellWidth={CELL_WIDTH}
          gap="2xl"
          className={cn(GRID_GEOMETRY, "rail-follow pb-sm")}
        >
          {entries.map((entry) => renderEntry(entry, group))}
        </Grid>
      );
    }
    const lanes = columns > 0 ? chunk(entries, columns) : [];
    const laneKey = (lane: DataViewRowEntry<unknown>[]) =>
      lane.map((e) => e.key).join("|");
    // Pin the lane holding the drag source, so scrolling it out of the window
    // does not unmount its draggable and cancel the drop — and raise it, so the
    // dragged tile paints over the lanes it crosses.
    const activeLane = activeId
      ? lanes.find((lane) => lane.some((e) => e.key === activeId))
      : undefined;
    return (
      <div className="rail-follow pb-sm">
        <Grid
          ref={probeRef}
          aria-hidden
          cellWidth={CELL_WIDTH}
          gap="2xl"
          className={cn(GRID_GEOMETRY, "h-0")}
        />
        {columns > 0 ? (
          <VirtualRows<DataViewRowEntry<unknown>[]>
            items={lanes}
            estimateSize={152}
            getKey={laneKey}
            keepMounted={activeLane ? [laneKey(activeLane)] : undefined}
            raisedKey={activeLane ? laneKey(activeLane) : undefined}
          >
            {(lane) => (
              <Grid
                cellWidth={CELL_WIDTH}
                gap="2xl"
                className={cn(GRID_GEOMETRY, "pb-2xl")}
              >
                {lane.map((entry) => renderEntry(entry, group))}
              </Grid>
            )}
          </VirtualRows>
        ) : null}
      </div>
    );
  };

  const renderBody = (activeId: string | null): ReactNode =>
    sections.length === 1 && sections[0]!.key === null ? (
      <>
        {renderGrid(sections[0]!.entries, activeId, null)}
        <FoldLine section={sections[0]!} foldLines={props.foldLines} />
      </>
    ) : (
      <GroupedSections
        sections={sections}
        collapsedSections={props.collapsedSections}
        setSectionCollapsed={props.setSectionCollapsed}
        headerStyle={props.groupHeaders}
        foldLines={props.foldLines}
      >
        {(section) => renderGrid(section.entries, activeId, section.key)}
      </GroupedSections>
    );

  // The container the grid geometry's queries read: the view's own width, not
  // the viewport's, so a narrow pane gets the compact tiles too.
  const root = (activeId: string | null): ReactNode => (
    <div className="@container/icons">{renderBody(activeId)}</div>
  );

  if (!manualOrder) return root(null);
  const anyWindowed = sections.some(
    (s) => s.entries.length > VIRTUALIZE_THRESHOLD,
  );
  return (
    <RankReorderProvider
      items={manualOrderItems(sections, manualOrder)}
      layout="grid"
      measuringAlways={anyWindowed}
      onMove={(id, dest) =>
        manualOrder.onMove(id, {
          rank: dest.rank,
          targetId: dest.targetId,
          zone: dest.zone,
        })
      }
      onReseat={
        onReseat
          ? (id, dest) =>
              onReseat(id, {
                groupKey: dest.group,
                targetId: dest.targetId,
                zone: dest.zone,
              })
          : undefined
      }
    >
      {(activeId) => root(activeId)}
    </RankReorderProvider>
  );
}

/** The fallback tile's letter: the name's first character, else the row key's. */
function initialOf(
  titleField: FieldDef<unknown> | undefined,
  row: unknown,
  key: string,
): string {
  const raw = titleField?.value?.(row);
  const text = typeof raw === "string" && raw.length > 0 ? raw : key;
  return text.charAt(0);
}

/** Flatten the sections into the rank-reorder item list. Null-rank entries are
 *  non-orderable, so they are neither scope members nor drop targets. */
function manualOrderItems(
  sections: DataViewSection<unknown>[],
  manualOrder: ManualOrderConfig<unknown>,
) {
  return sections.flatMap((section) =>
    section.entries.flatMap((entry) => {
      const rank = manualOrder.getRank(entry.row);
      return rank != null ? [{ id: entry.key, rank, group: section.key }] : [];
    }),
  );
}
