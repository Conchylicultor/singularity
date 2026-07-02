import { type ReactNode } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import {
  FieldCell,
  pickPrimaryField,
  resolveBodyFields,
  useDataViewSections,
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
 * manual-order mode (which renders non-virtualized per section).
 */
function ManualOrderRow({
  id,
  rank,
  children,
}: {
  id: string;
  rank: Rank;
  children: ReactNode;
}): ReactNode {
  const { dragSource, isDragging, beforeRef, afterRef, isOverBefore, isOverAfter } =
    useRankReorderItem(id, rank);
  // Destructure-and-rename at the top so render never does inline `dragSource.ref`
  // member access — react-hooks/refs flags member access on the hook output in
  // render, but not destructuring (mirrors the tree's RowChrome precedent).
  const { ref: dragRef, attributes: dragAttributes, listeners: dragListeners } =
    dragSource;
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
  const resolveEditor = useResolveCellEditor();
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
  // Body fields follow the view's Properties (visible-fields) policy; the section
  // pipeline above keeps using the full `props.fields` for sort/filter/search.
  // `null` → identity, so the title/subtitle/trailing split is unchanged.
  const vis = resolveBodyFields(props.fields, props.state.visibleFields);
  const options = (props.options ?? {}) as ListViewOptions<unknown>;
  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

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

  // Single source of row markup — shared verbatim by the plain and virtualized
  // branches so the two render identically.
  const renderRow = (
    row: unknown,
    key: string,
    aggregateCount?: number,
  ): ReactNode => (
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
              <Text as="div" variant="label" className="truncate text-foreground">
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
          {trailingFields.length > 0 || (aggregateCount && aggregateCount > 1) ? (
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
              {aggregateCount && aggregateCount > 1 ? (
                <Badge variant="muted">{`×${aggregateCount}`}</Badge>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </Row>
  );

  // Window the render once a section is long enough to matter; otherwise keep the
  // plain `.map`. VirtualRows discovers the scroll ancestor itself. In
  // manual-order mode windowing is bypassed (drag + windowing is out of scope)
  // and each row is wrapped with rank-reorder drag affordances.
  const estimateSize = (options.size ?? "md") === "sm" ? 36 : 44;
  const renderEntries = (entries: DataViewRowEntry<unknown>[]): ReactNode => {
    if (manualOrder) {
      return (
        <Stack gap="none" className="p-sm">
          {entries.map((entry) => {
            // A null rank marks the row non-orderable: render it plain, so the
            // `useRankReorderItem` hook (inside ManualOrderRow) is never mounted
            // for it. This is an element-type choice, not a conditional hook.
            const rank = manualOrder.getRank(entry.row);
            return rank != null ? (
              <ManualOrderRow key={entry.key} id={entry.key} rank={rank}>
                {renderRow(entry.row, entry.key, entry.aggregateCount)}
              </ManualOrderRow>
            ) : (
              renderRow(entry.row, entry.key, entry.aggregateCount)
            );
          })}
        </Stack>
      );
    }
    if (entries.length > VIRTUALIZE_THRESHOLD) {
      return (
        <VirtualRows<DataViewRowEntry<unknown>>
          items={entries}
          estimateSize={estimateSize}
          getKey={(entry) => entry.key}
          itemClassName="px-sm"
        >
          {(entry) => renderRow(entry.row, entry.key, entry.aggregateCount)}
        </VirtualRows>
      );
    }
    return (
      <Stack gap="none" className="p-sm">
        {entries.map((entry) =>
          renderRow(entry.row, entry.key, entry.aggregateCount),
        )}
      </Stack>
    );
  };

  // Ungrouped: the single implicit section renders headerless — byte-for-byte
  // the legacy markup.
  const body =
    sections.length === 1 && sections[0]!.key === null ? (
      renderEntries(sections[0]!.entries)
    ) : (
      // Grouped: one collapsible section per group key.
      <Stack gap="none">
        {sections.map((section) => {
          const key = section.key!;
          const collapsed = props.collapsedSections?.has(key) ?? false;
          return (
            <Collapsible
              key={key}
              open={!collapsed}
              onOpenChange={(open) => props.setSectionCollapsed?.(key, !open)}
            >
              <SectionHeaderRow
                className="px-sm"
                actions={
                  <Text variant="caption" tone="muted">
                    {section.count}
                  </Text>
                }
              >
                {section.label}
              </SectionHeaderRow>
              <CollapsibleContent>
                {renderEntries(section.entries)}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </Stack>
    );

  // Manual order: wrap the rendered sections in a single rank-reorder DnD host
  // covering every section, so a drag can reseat within or ACROSS sections (the
  // destination section's key flows back as `dest.groupKey`).
  if (manualOrder) {
    return (
      <RankReorderProvider
        items={manualOrderItems(sections, manualOrder)}
        onMove={(id, dest) =>
          manualOrder.onMove(id, {
            rank: dest.rank,
            groupKey: dest.group,
            targetId: dest.targetId,
            zone: dest.zone,
          })
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
        {body}
      </RankReorderProvider>
    );
  }
  return body;
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
      return rank != null
        ? [{ id: entry.key, rank, group: section.key }]
        : [];
    }),
  );
}
