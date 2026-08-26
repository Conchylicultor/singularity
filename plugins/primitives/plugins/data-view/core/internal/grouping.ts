import type { FieldDef, FieldValue } from "./types";

/**
 * One way to bucket a field's values — persisted by `id` in the view config.
 *
 * A field **type** declares these (through `DataViewSlots.Grouping`), the same
 * way it already declares its cell, its filter, its SQL cast and its value
 * codec. That is the whole point of the contract: data-view partitions, orders
 * and renders sections without naming a single field type, so a type that wants
 * a new way to bucket adds a grouping rather than a branch inside the primitive.
 */
export interface FieldGrouping {
  /** Stable id, persisted in the view config: "smart" | "day" | "value" | … */
  readonly id: string;
  /** How the granularity picker names this choice: "Smart", "Day", "Month". */
  readonly label: string;
  /**
   * Build the bucketing function for ONE render. Two-phase on purpose: a
   * grouping that needs to see the whole set before it can order its sections
   * (enum by `options` index, the identity fallback by value order, a future
   * range-derived "Auto") does that work once here, not per row.
   *
   * **Returning `null` means "this value is not one I can bucket"** — a string
   * in a date field that does not parse, an enum value of the wrong shape. The
   * row joins the SAME "None" section as a null value, which is the one place
   * that owns what unbucketable rows look like and where they sit.
   *
   * A grouping must never mint a "None"/"Unknown" bucket of its own for this.
   * Two sections would end up labelled "None", and the sentinel ordinal such a
   * bucket reaches for (`Number.POSITIVE_INFINITY`) sorts last ascending but
   * FIRST descending — so the catch-all would jump to the top of the list the
   * moment the view's sort flipped. `null` has neither failure mode available.
   */
  readonly plan: (
    ctx: GroupingPlanContext,
  ) => (value: FieldValue) => GroupBucket | null;
}

export interface GroupingPlanContext {
  /**
   * Local midnight of the current day, as epoch ms. Injected — a grouping never
   * reads the clock itself. An implicit clock read is what makes this kind of
   * function untestable (the precedent is `relativeDayLabel(date, now)`), and it
   * is also required for correctness here: the partition runs inside a `useMemo`,
   * so a raw `Date.now()` would change the memo key on every render.
   */
  readonly now: number;
  /** Every non-null value in the rows being partitioned (duplicates included). */
  readonly values: readonly FieldValue[];
  /** The field being grouped — `options`, `label`, per-field settings. */
  readonly field: FieldDef<unknown>;
}

export interface GroupBucket {
  /** Bucket identity. Stable across renders — it keys the collapse state. */
  readonly key: string;
  /** The section header text. */
  readonly label: string;
  /**
   * Chronological/natural ordinal, plain ascending. Sections render ascending or
   * descending according to the view's own sort direction on the grouped field
   * (`DataViewRenderProps.groupOrder`), so both readings come out of ONE ordinal
   * with no extra config. Ties keep discovery order in both directions.
   *
   * Must be **finite** — the partition throws otherwise. An infinite ordinal is
   * only ever reached for as "put this bucket at the end", which it does not do:
   * it pins last ascending and first descending. A bucket that genuinely has no
   * position is not a bucket — return `null` from the bucketer instead.
   */
  readonly order: number;
}

/**
 * The groupings ONE field type offers, as the picker reads them: the section
 * label that type names its granularity axis with ("Group dates by") plus the
 * ordered choices. Minted from a `DataViewSlots.Grouping` contribution, or from
 * the built-in identity fallback when the type registers none.
 */
export interface FieldGroupingSet {
  /** Section label of the granularity band: "Group dates by". */
  readonly label: string;
  /** The choices, in reading order. The first is the default. */
  readonly groupings: readonly FieldGrouping[];
}

/**
 * The persisted group-by choice — which field, and how that field buckets.
 * Replaces the bare `groupBy: "<fieldId>"` string, which is migrated on read
 * (see `readGroupBy`) to `{ fieldId, groupingId: "value" }`.
 */
export interface GroupByRule {
  readonly fieldId: string;
  readonly groupingId: string;
}

/**
 * **The single definition of `FieldValue` ordering.** null/undefined last;
 * Date→time, boolean→0/1, number numeric, else locale string compare.
 *
 * A grouping contribution that needs to order values — the identity fallback by
 * the whole value set, the `enum` grouping for the values `field.options` does
 * not mention, anything else that falls back to "just sort them" — **calls this
 * rather than rolling its own**. Three separate places need exactly this rule
 * and must not drift: a second hand-rolled comparator is how the ordering of
 * unknown enum values silently stops matching what it used to be, which is the
 * one thing the grouping migration exists to preserve bit-for-bit.
 *
 * It lives in `core` for that reason: a field type's own grouping has to be able
 * to spell it, and `core → web` is not a legal edge.
 */
export function compareValues(a: FieldValue, b: FieldValue): number {
  const an = a == null;
  const bn = b == null;
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  const av =
    a instanceof Date ? a.getTime() : typeof a === "boolean" ? Number(a) : a;
  const bv =
    b instanceof Date ? b.getTime() : typeof b === "boolean" ? Number(b) : b;
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv));
}
