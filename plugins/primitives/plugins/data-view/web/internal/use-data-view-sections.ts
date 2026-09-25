import { useMemo } from "react";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import type {
  DataViewAggregateConfig,
  DataViewRowEntry,
  DataViewSection,
  FieldDef,
  FieldGrouping,
  FieldValue,
  FilterOperatorSet,
  GroupByRule,
  ViewState,
} from "../../core";
import { useGroupingRegistry } from "../grouping-slot";
import { IDENTITY_GROUPING } from "./identity-grouping";
import { useFlatRows } from "./use-flat-rows";
import { foldSections, makeFoldKeep } from "./fold-sections";

/** Sentinel bucket key for rows whose group-by value is null/undefined. Holds a
 *  control char so it can never collide with a real stringified field value. */
const NULL_GROUP_KEY = " __dataview_none__";

/**
 * Default groupable policy: a field with a `value` projection **whose type says
 * how it buckets** (mirrors `sortable` defaulting off `value`). Overridable
 * per-field via `FieldDef.groupable`.
 *
 * `hasGrouping` is injected — a `(typeId) => boolean` read of the `Grouping`
 * slot (`useGroupingRegistry().has`). This function used to spell
 * `type === "enum" || type === "bool"`, a literal type list living inside the
 * primitive; groupability is now derived from what the field TYPES declare, so
 * adding a groupable type is a contribution and never an edit here.
 */
export function isGroupableField<TRow>(
  field: FieldDef<TRow>,
  hasGrouping: (typeId: string) => boolean,
): boolean {
  if (!field.value) return false;
  return field.groupable ?? hasGrouping(field.type ?? "text");
}

/** What `partitionIntoSections` needs beyond the rows: the injected grouping
 *  resolver, the injected clock, and the reading direction. */
export interface PartitionOptions {
  /**
   * `(typeId, groupingId) => FieldGrouping` — resolve the grouping a
   * `GroupByRule` names for a field of this type. Injected so the partition
   * stays a pure function that reads no slot registry (and can be unit-tested
   * with a stub), and so that data-view never names a field type.
   */
  resolveGrouping: (typeId: string, groupingId: string) => FieldGrouping;
  /** Local midnight of the current day (see `useGroupingClock`). */
  now: number;
  /**
   * Section reading direction, taken from the view's own sort on the grouped
   * field. `GroupBucket.order` is always a plain ascending ordinal; this decides
   * which end it is read from. The "None" bucket stays LAST in both directions —
   * it holds no position on the ordinal, so reversing it would mean nothing.
   */
  order: "asc" | "desc";
}

/**
 * Pure partition step (testable without React): bucket the already
 * search→filter→sort-processed `rows` by the `groupBy` rule's field into ordered
 * sections. When `groupBy` is unset, or names a field with no `value`
 * projection, returns exactly ONE `{ key: null }` section mapping rows 1:1 — so
 * the un-grouped render is byte-for-byte identical to the old flat path.
 *
 * **It names no field type.** A bucket's key, label and ordinal all come from
 * the `FieldGrouping` the rule names — which the field's own type contributed —
 * so a date bucketing into "Later this week" and an enum bucketing by option
 * order reach here through one code path. Within a section, the incoming
 * (sorted) row order is preserved.
 */
export function partitionIntoSections<TRow>(
  rows: readonly TRow[],
  fields: FieldDef<TRow>[],
  groupBy: GroupByRule | undefined,
  rowKey: (row: TRow, index: number) => string,
  opts: PartitionOptions,
): DataViewSection<TRow>[] {
  const field = groupBy
    ? fields.find((f) => f.id === groupBy.fieldId)
    : undefined;

  // Ungrouped (or an unresolvable/value-less group field): one implicit section.
  if (!groupBy || !field?.value) {
    return [
      {
        key: null,
        count: rows.length,
        entries: rows.map((row, i) => ({ row, key: rowKey(row, i) })),
      },
    ];
  }

  // Project once: the plan phase needs the whole value set before it can order
  // its sections, and re-projecting per row afterwards would run the consumer's
  // accessor twice.
  const project = field.value;
  const values = rows.map((row) => project(row));
  const grouping = opts.resolveGrouping(
    field.type ?? "text",
    groupBy.groupingId,
  );
  const bucketOf = grouping.plan({
    now: opts.now,
    values: values.filter((v) => v != null),
    field: field as FieldDef<unknown>,
  });

  // `seq` is the bucket's discovery order — the tie-break that keeps two buckets
  // sharing an ordinal in a stable order in BOTH reading directions.
  interface Bucket {
    label: string;
    order: number;
    seq: number;
    rows: TRow[];
  }
  const buckets = new Map<string, Bucket>();
  // The ONE catch-all: no value, and a value the grouping cannot bucket. Both
  // read as "None" to the user, and giving them one section is what stops a
  // grouping from minting a rival "None" with an ordinal of its own.
  const nullBucket: Bucket = { label: "None", order: 0, seq: -1, rows: [] };
  rows.forEach((row, i) => {
    const value = values[i] as FieldValue;
    const bucketed = value == null ? null : bucketOf(value);
    if (!bucketed) {
      nullBucket.rows.push(row);
      return;
    }
    const { key, label, order } = bucketed;
    let bucket = buckets.get(key);
    if (!bucket) {
      // Checked once per bucket, not per row. A non-finite ordinal is only ever
      // reached for as "put this last", which it does not do — `Infinity - n` is
      // `Infinity`, so it pins last ascending and FIRST descending, and two of
      // them subtract to `NaN`. A bucket with no position is not a bucket; the
      // bucketer returns `null` for that and the row joins "None" above.
      if (!Number.isFinite(order)) {
        throw new Error(
          `[data-view] grouping "${grouping.id}" gave bucket "${key}" a non-finite order ` +
            `(${String(order)}). Return null from the bucketer for a value you cannot ` +
            `bucket — it joins the "None" section, which is ordered last in both directions.`,
        );
      }
      bucket = { label, order, seq: buckets.size, rows: [] };
      buckets.set(key, bucket);
    }
    bucket.rows.push(row);
  });

  const dir = opts.order === "desc" ? -1 : 1;
  const ordered: [string, Bucket][] = [...buckets.entries()].sort(
    ([, a], [, b]) => (a.order - b.order) * dir || a.seq - b.seq,
  );
  // "None" is not a point on the ordinal — it is the absence of one — so it
  // trails the real sections whichever way they read.
  if (nullBucket.rows.length > 0) ordered.push([NULL_GROUP_KEY, nullBucket]);

  // Index counter is global across sections so `rowKey(row, index)` stays
  // stable and unique even when the consumer's key depends on the index.
  let globalIndex = 0;
  return ordered.map(([key, bucket]) => ({
    key,
    label: bucket.label,
    count: bucket.rows.length,
    entries: bucket.rows.map((row) => ({
      row,
      key: rowKey(row, globalIndex++),
    })),
  }));
}

/**
 * Pure aggregate step (testable without React): collapse, **within each
 * section**, the entries sharing a non-null `getKey` into ONE representative
 * entry. Runs AFTER group + manual-order ordering, so it aggregates the
 * already-ordered entries.
 *
 * - A non-null key emits one entry with `row = pickRepresentative(members)`
 *   (default: the first member in current order), `aggregateCount = members.length`,
 *   and `members` = every collapsed row. The representative entry keeps the
 *   **position of the first member** in the current order, and carries that first
 *   member's `key` (so the entry id is stable as members shift). When the picked
 *   representative differs from the first member the entry still uses the first
 *   member's `key` — the entry stands for the group, not a single row.
 * - A `null` key passes through 1:1 (no `aggregateCount`/`members`).
 *
 * `section.count` is preserved (the pre-collapse member count).
 */
export function aggregateSections<TRow>(
  sections: DataViewSection<TRow>[],
  aggregate: DataViewAggregateConfig<TRow>,
): DataViewSection<TRow>[] {
  const pick = aggregate.pickRepresentative ?? ((members) => members[0]!);
  return sections.map((section) => {
    // Reserve one output slot per non-null key at its first member's position;
    // null-key entries pass straight through.
    const buckets = new Map<
      string,
      { entries: DataViewRowEntry<TRow>[]; slot: number }
    >();
    const out: DataViewRowEntry<TRow>[] = [];
    for (const entry of section.entries) {
      const key = aggregate.getKey(entry.row);
      if (key == null) {
        out.push({ row: entry.row, key: entry.key });
        continue;
      }
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.entries.push(entry);
      } else {
        const slot = out.length;
        out.push(entry); // placeholder, rewritten below
        buckets.set(key, { entries: [entry], slot });
      }
    }
    for (const { entries, slot } of buckets.values()) {
      const members = entries.map((e) => e.row);
      out[slot] = {
        row: pick(members),
        key: entries[0]!.key,
        aggregateCount: members.length,
        members,
      };
    }
    return { ...section, entries: out };
  });
}

/**
 * Pure manual-order step (testable without React): order each section's entries
 * by `manualRank`, WITHIN the section. Sections are HOMOGENEOUS — a section is
 * either all-ranked or all-null (the consumer guarantees it via its group-by
 * classification) — so a `0`-returning comparator on an all-null section is a
 * stable no-op = "keep incoming order" (Array.sort is stable in ES2019+). A
 * `null` rank on either side yields `0`; mixed null/non-null within one section
 * is under-specified and never produced by consumers.
 */
export function orderSectionsByRank<TRow>(
  sections: DataViewSection<TRow>[],
  manualRank: (row: TRow) => Rank | null,
): DataViewSection<TRow>[] {
  return sections.map((section) => ({
    ...section,
    entries: [...section.entries].sort((a, b) => {
      const ra = manualRank(a.row);
      const rb = manualRank(b.row);
      if (ra == null || rb == null) return 0;
      return Rank.compare(ra, rb);
    }),
  }));
}

/**
 * The unifying section pipeline every flat view (`list`/`table`/`gallery`)
 * renders against. Wraps `useFlatRows` (search→filter→sort — UNCHANGED), then
 * partitions the result by `state.groupBy`, orders each section by `manualRank`
 * (Sub-task 2), and finally collapses aggregate groups within each section
 * (Sub-task 3, via `opts.aggregate`). Absent `aggregate` → entries map rows 1:1.
 *
 * `opts` is REQUIRED because `now` and `groupOrder` are: both come from the host
 * (`DataViewRenderProps`), which is the one place that can quantize the clock
 * once per surface and read the view's own sort. A view that defaulted them
 * would be reading the clock implicitly and guessing the direction.
 */
export function useDataViewSections<TRow>(
  rows: readonly TRow[],
  fields: FieldDef<TRow>[],
  state: ViewState,
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
  searchAccessor: ((row: TRow) => string) | undefined,
  opts: {
    rowKey?: (row: TRow, index: number) => string;
    /**
     * Aggregating-sections (Sub-task 3): when supplied, entries sharing a
     * non-null `getKey` collapse into one representative entry per section
     * (after group + manual-order ordering). Absent → entries map rows 1:1.
     */
    aggregate?: DataViewAggregateConfig<TRow>;
    /**
     * Flat manual-order seam (Sub-task 2): when supplied, the field sort is
     * skipped (search/filter still run) and each section's entries are ordered
     * by this `Rank` instead — the flat analog of the tree ignoring sort.
     * Returning `null` for a row marks it non-orderable (keeps incoming order).
     */
    manualRank?: (row: TRow) => Rank | null;
    /** `DataViewRenderProps.now` — local midnight, quantized by the host. */
    now: number;
    /** `DataViewRenderProps.groupOrder` — the section reading direction. */
    groupOrder: "asc" | "desc";
    /**
     * `DataViewRenderProps.foldLines?.open` — the section keys whose fold line is
     * open. The fold rule itself is read off `state.fold` (which the host already
     * cleared while a search is typed); absent rule ⇒ nothing folds.
     */
    openFolds?: ReadonlySet<string>;
    /** `DataViewRenderProps.selectedRowId` — the selected row is never folded. */
    selectedRowId?: string;
  },
): DataViewSection<TRow>[] {
  const manualRank = opts.manualRank;
  // Manual order ignores the field sort (orders by rank below) — zero out `sort`
  // before the flat pipeline so search/filter still run but the sort step no-ops.
  const flatState = useMemo(
    () => (manualRank ? { ...state, sort: [] } : state),
    [manualRank, state],
  );
  const flat = useFlatRows(
    rows,
    fields,
    flatState,
    resolveOperatorSet,
    searchAccessor,
  );
  const rowKey = opts.rowKey;
  const aggregate = opts.aggregate;
  const { now, groupOrder, openFolds, selectedRowId } = opts;
  const fold = state.fold;
  const resolveGrouping = useGroupingRegistry().resolve;
  // Depend on the rule's two PRIMITIVE fields, never on the rule object:
  // `stateFor` mints a fresh `ViewState` (and thus a fresh `groupBy`) on every
  // call, so an object dep would re-partition the whole set each render.
  const groupFieldId = state.groupBy?.fieldId;
  const groupingId = state.groupBy?.groupingId;
  const groupBy = useMemo(
    () =>
      groupFieldId
        ? {
            fieldId: groupFieldId,
            groupingId: groupingId ?? IDENTITY_GROUPING.id,
          }
        : undefined,
    [groupFieldId, groupingId],
  );
  return useMemo(() => {
    let sections = partitionIntoSections(
      flat,
      fields,
      groupBy,
      rowKey ?? ((_row: TRow, i: number) => String(i)),
      { resolveGrouping, now, order: groupOrder },
    );
    // Order each section's entries by rank (within-section manual order) BEFORE
    // aggregating, so the representative defaults to the first rank-ordered member.
    if (manualRank) sections = orderSectionsByRank(sections, manualRank);
    // Collapse aggregate groups within each (already-ordered) section.
    if (aggregate) sections = aggregateSections(sections, aggregate);
    // Fold LAST, so it counts the entries the user sees (an aggregate's
    // representative decides) and pulls folded rows from wherever they sort.
    if (fold) {
      const key = rowKey ?? ((_row: TRow, i: number) => String(i));
      sections = foldSections(sections, {
        isKept: makeFoldKeep(fold, fields, resolveOperatorSet, {
          selectedRowId,
          // A member carries no index of its own; keys that depend on the index
          // cannot identify it, and such a surface has no stable selection anyway.
          rowKey: (row) => key(row, 0),
        }),
        openKeys: openFolds ?? EMPTY_KEYS,
      });
    }
    return sections;
  }, [
    flat,
    fields,
    groupBy,
    rowKey,
    manualRank,
    aggregate,
    resolveGrouping,
    now,
    groupOrder,
    fold,
    openFolds,
    selectedRowId,
    resolveOperatorSet,
  ]);
}

const EMPTY_KEYS: ReadonlySet<string> = new Set();
