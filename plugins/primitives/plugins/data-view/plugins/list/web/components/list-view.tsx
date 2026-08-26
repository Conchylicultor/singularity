import { type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { clipClasses } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  FieldCell,
  GroupedSections,
  pickPrimaryField,
  resolveBodyFields,
  rowToneClass,
  useDataViewSections,
  useIsChipField,
  useItemActionZones,
  useResolveCell,
  useResolveCellEditor,
  useResolveOperatorSet,
  type DataViewAggregateConfig,
  type DataViewRowEntry,
  type DataViewRenderProps,
  type DataViewSection,
  type ItemActionsDescriptor,
  type ManualOrderConfig,
} from "@plugins/primitives/plugins/data-view/web";
import {
  RankReorderProvider,
  useRankReorderItem,
} from "@plugins/primitives/plugins/rank-reorder/web";
import type { Rank } from "@plugins/primitives/plugins/rank/core";
import { VirtualRows } from "@plugins/primitives/plugins/virtual-rows/web";
import type { ListViewOptions } from "../../core";

/**
 * Wraps one list row with rank-reorder drag affordances: the whole row is the
 * drag source (Notion-style, no grip), with hover before/after drop indicators.
 * Mirrors the tree's RowChrome drop-indicator markup. Only mounted in
 * manual-order mode, in both the windowed and the plain branch.
 *
 * `group` is the row's section key: while a drag from another section is in
 * flight and the config declared no `onReseat`, the primitive switches this
 * row's drop zones off, so the indicators below simply never paint.
 */
function ManualOrderRow({
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
  const {
    dragSource,
    isDragging,
    beforeRef,
    afterRef,
    isOverBefore,
    isOverAfter,
  } = useRankReorderItem(id, rank, group);
  // Destructure-and-rename at the top so render never does inline `dragSource.ref`
  // member access — react-hooks/refs flags member access on the hook output in
  // render, but not destructuring (mirrors the tree's RowChrome precedent).
  const {
    ref: dragRef,
    attributes: dragAttributes,
    listeners: dragListeners,
  } = dragSource;
  return (
    <div
      ref={dragRef}
      {...dragAttributes}
      {...dragListeners}
      className={cn("relative", isDragging && "opacity-40")}
    >
      {children}
      <Pin ref={beforeRef} to="top" stretch decorative className="h-[6px]">
        {isOverBefore && (
          <Pin
            to="top"
            spanOffset="xs"
            decorative
            className="bg-primary h-[2px] rounded-full"
          />
        )}
      </Pin>
      <Pin ref={afterRef} to="bottom" stretch decorative className="h-[6px]">
        {isOverAfter && (
          <Pin
            to="bottom"
            spanOffset="xs"
            decorative
            className="bg-primary h-[2px] rounded-full"
          />
        )}
      </Pin>
    </div>
  );
}

/** Above this row count the list windows its rows (VirtualRows finds the nearest
 *  scroll ancestor); smaller lists keep the plain `.map` — no absolute
 *  positioning / measurement overhead, exact byte-for-byte legacy markup. */
const VIRTUALIZE_THRESHOLD = 100;

/**
 * List view: a compact, single-row-per-item dense list. Composes the `Row`
 * primitive and maps the shared `FieldDef` schema field-driven (primary →
 * label, `align:"end"` → trailing, rest → subtitle).
 *
 * Renders against `useDataViewSections`: ungrouped → one implicit section
 * rendered headerless (byte-for-byte the legacy markup); grouped → one
 * collapsible section per group key with a header + count. Windowing still
 * applies WITHIN a section's rows.
 *
 * `rows`/`fields` arrive type-erased as `unknown`; this is the documented re-cast
 * boundary for the view child.
 */
export function ListView(props: DataViewRenderProps<unknown>): ReactNode {
  const resolveCell = useResolveCell();
  // "Does this field render as a chip?", asked of the SAME registry `resolveCell`
  // consults — so the subtitle's separators follow the field types' own
  // declarations and this view names none of them.
  const isChipField = useIsChipField();
  const resolveEditor = useResolveCellEditor();
  const resolveOperatorSet = useResolveOperatorSet();
  // Manual order arrives type-erased; present only when the host activated it.
  const manualOrder = props.manualOrder as
    ManualOrderConfig<unknown> | undefined;
  // Cross-section capability: present ⇒ a drop into another section is offered
  // and reported; absent ⇒ the primitive refuses those drops visibly.
  const onReseat = manualOrder?.onReseat;
  // Aggregate arrives type-erased; present only when the consumer supplied it.
  const aggregate = props.aggregate as
    DataViewAggregateConfig<unknown> | undefined;
  const sections = useDataViewSections(
    props.rows,
    props.fields,
    props.state,
    resolveOperatorSet,
    props.searchAccessor,
    {
      rowKey: props.rowKey,
      manualRank: manualOrder?.getRank,
      aggregate,
      now: props.now,
      groupOrder: props.groupOrder,
    },
  );
  // Body fields follow the view's Properties (visible-fields) policy; the section
  // pipeline above keeps using the full `props.fields` for sort/filter/search.
  // `null` → identity, so the title/subtitle/trailing split is unchanged.
  const vis = resolveBodyFields(props.fields, props.state.visibleFields);
  const options = (props.options ?? {}) as ListViewOptions<unknown>;
  // One line is the default shape (see `ListViewOptions.lines`); a surface whose
  // subtitle is prose opts back into the stacked one.
  const lines = options.lines ?? 1;
  // Density is the SURFACE's declaration, not the view's: a compact surface gets
  // the tighter row unless this view instance pinned a size of its own.
  const rowSize = options.size ?? (props.density === "compact" ? "sm" : "md");
  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    ItemActionsDescriptor<unknown> | undefined;
  // A list row has no permanent trailing region (a reserved one would take width
  // from the title in the app's narrowest surfaces), so EVERY action — persistent
  // zone included — renders in the one hover cluster. Resolved unconditionally
  // (hooks rules) BEFORE the early empty-state return.
  const { revealed } = useItemActionZones(itemActions, {
    hasPersistentSlot: false,
  });

  // The host owns the loading→empty precedence: it renders the skeleton and
  // skips this view while loading, so an empty section set always means empty.
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

  const titleField = pickPrimaryField(vis);
  const trailingFields = vis.filter((f) => f.align === "end");
  const subtitleFields = vis.filter(
    (f) => f.id !== titleField?.id && f.align !== "end",
  );

  // Which terms of the row's run are chips. Resolved once per render (the schema
  // is per-view, not per-row), so a long list pays one lookup per field.
  const titleIsChip = titleField != null && isChipField(titleField);
  const subtitleIsChip = subtitleFields.map((f) => isChipField(f));

  /**
   * The separator drawn BEFORE subtitle term `fi`.
   *
   * ` · ` is a punctuation mark between two pieces of text; it is not what
   * separates two chips, which already carry their own boundary. So the middot
   * is drawn only between two adjacent NON-chip terms, and a chip is separated
   * by spacing alone — otherwise a row of three enum fields renders
   * `name · [Web page] · [Daily] · [Failed]`, middots glued to pills.
   *
   * The run is inline content inside one truncating `<Text>` leaf (that is what
   * lets the subtitle ellipsize as a single leaf of the row's line), so the
   * spacing is a literal space in the flow, not a flex `gap` — a flex container
   * here would make each chip its own leaf and take the truncation with it.
   *
   * `precededByTitle` covers the one-line seam: on one line the title is simply
   * the run's first term, so the first subtitle term is separated from it by the
   * same rule. Stacked, the title owns its own line and there is no seam.
   */
  const subtitleSeparator = (
    fi: number,
    precededByTitle: boolean,
  ): ReactNode => {
    const prevIsChip =
      fi > 0 ? subtitleIsChip[fi - 1]! : precededByTitle ? titleIsChip : null;
    if (prevIsChip == null) return null; // nothing before it — no separator
    return prevIsChip || subtitleIsChip[fi] ? " " : " · ";
  };

  // The trailing cell — `align: "end"` fields plus the aggregate `×N` badge —
  // is identical in both row shapes, so it is written once. It is a rigid leaf:
  // it renders what it renders and never gives width back to the title. Only
  // its flush-right MECHANIC differs, which is why the class comes in from the
  // caller: the single-line shape puts an empty `<Fill>` ahead of it, the
  // stacked one keeps the `ml-auto` it has always used.
  const hasTrailing = (aggregateCount?: number): boolean =>
    trailingFields.length > 0 || (aggregateCount != null && aggregateCount > 1);
  const renderTrailing = (
    row: unknown,
    aggregateCount: number | undefined,
    className?: string,
  ): ReactNode => (
    <Stack
      direction="row"
      gap="xs"
      align="center"
      className={cn(className, rigidClass())}
    >
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
      {aggregateCount && aggregateCount > 1 ? (
        <Badge variant="muted">{`×${aggregateCount}`}</Badge>
      ) : null}
    </Stack>
  );

  // Single source of row markup — shared verbatim by the plain and virtualized
  // branches so the two render identically.
  const renderRow = (
    row: unknown,
    key: string,
    aggregateCount?: number,
  ): ReactNode => {
    const trailing = hasTrailing(aggregateCount);
    // Per-row emphasis: composed ON TOP of the title's own `text-foreground`, so
    // a switched-off / archived / finished row reads inactive. The subtitle and
    // the trailing cell are already muted, so the title is the whole difference.
    const toneClass = rowToneClass(props.rowTone?.(row));
    return (
      <Row
        key={key}
        selected={key === props.selectedRowId}
        size={rowSize}
        onClick={() => props.onRowActivate?.(row)}
        icon={options.leading?.(row)}
        actions={revealed?.({
          row,
          hasChildren: props.hasChildren?.(key) ?? false,
        })}
      >
        {options.renderRow ? (
          options.renderRow(row)
        ) : lines === 2 ? (
          // TWO LINES — the opt-in stacked shape, for a subtitle that is prose.
          // `Stack` is a flow container, so it RESETS the row's single-line
          // context: each `<Text>` must ask for its own `truncate`, exactly as
          // it did when this was the only shape.
          <>
            {/* Clipping already floors this flex item's automatic minimum size at
                0, so the cell needs no min-w-0 of its own. */}
            <Stack
              gap="none"
              className={clipClasses({ axis: "both", fill: false })}
            >
              {titleField ? (
                <Text
                  as="div"
                  variant="label"
                  className={cn("truncate text-foreground", toneClass)}
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
                      {subtitleSeparator(fi, false)}
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
            </Stack>
            {trailing ? renderTrailing(row, aggregateCount, "ml-auto") : null}
          </>
        ) : (
          // ONE LINE (the default) — title and subtitle are sibling truncating
          // leaves of the row itself. `Row` composes `Line`, so this is already
          // a `region-line` + `SingleLineProvider` context: every `<Text>` here
          // ellipsizes on one line without asking, and nothing wraps.
          //
          // What gives first: both leaves shrink (CSS's default factor of 1,
          // weighted by content width), so the longer of the two yields more —
          // and the subtitle, being the muted `·`-joined metadata run, is
          // normally the longer one. That is the intent (the title identifies
          // the row) without inventing a shrink-priority primitive for it.
          <>
            {titleField ? (
              <Text
                variant="label"
                className={cn("text-foreground", toneClass)}
              >
                {/* `display="inline"` here, not `"block"`: a block cell asks for
                    `w-full`, which in a flex line means the whole row rather
                    than the cell it means in the stacked shape. */}
                <FieldCell
                  field={titleField}
                  row={row}
                  resolveCell={resolveCell}
                  resolveEditor={resolveEditor}
                  display="inline"
                />
              </Text>
            ) : null}
            {subtitleFields.length > 0 ? (
              <Text variant="caption" className="text-muted-foreground">
                {subtitleFields.map((field, fi) => (
                  <span key={field.id}>
                    {/* The same join, extended to the seam with the title: on one
                        line the title is simply the run's first term. */}
                    {subtitleSeparator(fi, titleField != null)}
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
            {trailing ? (
              <>
                {/* The slack lives in its own cell, so the trailing group sits
                    flush right in a real track (the structural replacement for
                    `ml-auto`) and the identity leaves keep their natural width. */}
                <Fill />
                {renderTrailing(row, aggregateCount)}
              </>
            ) : null}
          </>
        )}
      </Row>
    );
  };

  // One entry's node, shared by both branches. In manual-order mode the row is
  // wrapped in its drag affordances — except when its rank is null, which marks
  // the row non-orderable: it renders plain, so the `useRankReorderItem` hook
  // (inside ManualOrderRow) is never mounted for it. This is an element-type
  // choice, not a conditional hook.
  const renderEntry = (
    entry: DataViewRowEntry<unknown>,
    group: string | null,
  ): ReactNode => {
    const row = renderRow(entry.row, entry.key, entry.aggregateCount);
    if (!manualOrder) return row;
    const rank = manualOrder.getRank(entry.row);
    if (rank == null) return row;
    return (
      <ManualOrderRow key={entry.key} id={entry.key} rank={rank} group={group}>
        {row}
      </ManualOrderRow>
    );
  };

  // Window the render once a section is long enough to matter; otherwise keep the
  // plain `.map`. VirtualRows discovers the scroll ancestor itself. Manual order
  // composes with windowing: `activeId` (from the RankReorderProvider render-prop)
  // pins the drag source so it stays mounted when it scrolls out of the window —
  // it renders at its true measured offset, so it is invisible and harmless.
  // Both dimensions of the row's height: its text density, and whether the
  // subtitle is a second line. `VirtualRows` measures every mounted row anyway,
  // so this only has to be close enough that the scrollbar doesn't jump — but a
  // single-line row is roughly a caption-line shorter than the stacked one it
  // replaced, and keeping the old estimate would size the sizer ~35% long.
  const estimateSize =
    lines === 2 ? (rowSize === "sm" ? 36 : 44) : rowSize === "sm" ? 28 : 32;
  const renderEntries = (
    entries: DataViewRowEntry<unknown>[],
    activeId: string | null,
    group: string | null,
  ): ReactNode => {
    if (entries.length > VIRTUALIZE_THRESHOLD) {
      return (
        <VirtualRows<DataViewRowEntry<unknown>>
          items={entries}
          estimateSize={estimateSize}
          getKey={(entry) => entry.key}
          itemClassName={cn("rail-follow")}
          keepMounted={activeId ? [activeId] : undefined}
        >
          {(entry) => renderEntry(entry, group)}
        </VirtualRows>
      );
    }
    return (
      <Stack gap="none" className="rail-follow py-sm">
        {entries.map((entry) => renderEntry(entry, group))}
      </Stack>
    );
  };

  const renderBody = (activeId: string | null): ReactNode =>
    // Ungrouped: the single implicit section renders headerless — byte-for-byte
    // the legacy markup.
    sections.length === 1 && sections[0]!.key === null ? (
      renderEntries(sections[0]!.entries, activeId, null)
    ) : (
      // Grouped: the shared pinned/stacking group-header chrome. GroupedSections
      // follows the ambient rail too, so header and body sit on one rail.
      <GroupedSections
        sections={sections}
        collapsedSections={props.collapsedSections}
        setSectionCollapsed={props.setSectionCollapsed}
      >
        {(section) => renderEntries(section.entries, activeId, section.key)}
      </GroupedSections>
    );

  // Manual order: wrap the rendered sections in a single rank-reorder DnD host
  // covering every section. In-section drags reorder; a drop into ANOTHER
  // section is a group write plus a reorder, so it is offered only when the
  // config supplies `onReseat` — otherwise the primitive scopes the drag to its
  // own section and the others paint no drop zone.
  if (manualOrder) {
    // Any windowed section ⇒ rows mount/unmount mid-drag as autoscroll runs, so
    // the shell must re-measure droppables every frame.
    const anyWindowed = sections.some(
      (s) => s.entries.length > VIRTUALIZE_THRESHOLD,
    );
    return (
      <RankReorderProvider
        items={manualOrderItems(sections, manualOrder)}
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
        dragOverlay={(id) => {
          const entry = sections
            .flatMap((s) => s.entries)
            .find((e) => e.key === id);
          if (!entry) return null;
          if (!titleField) return id;
          return (
            <FieldCell
              field={titleField}
              row={entry.row}
              resolveCell={resolveCell}
              resolveEditor={resolveEditor}
              display="inline"
            />
          );
        }}
      >
        {(activeId) => renderBody(activeId)}
      </RankReorderProvider>
    );
  }
  return renderBody(null);
}

/** Flatten the sections into the rank-reorder item list (id + rank + group).
 *  Null-rank entries are non-orderable, so they are neither reorder-scope
 *  members nor drop targets — filter them out before mapping. */
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
