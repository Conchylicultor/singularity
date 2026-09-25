import { useMemo } from "react";
import {
  and,
  canonicalizeFilter,
  clause,
  FilterError,
  or,
  type Filter,
  type Filterable,
  type FilterColumn,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type {
  FieldDef,
  FilterGroup,
  FilterNode,
  FilterOperatorSet,
} from "../../core";
import { lowerFilterGroup } from "./evaluate-filter";
import { resolveRuleOperator } from "./rule-resolution";
import { useFilterClock } from "./use-filter-clock";

type ResolveOperatorSet = (typeId: string) => FilterOperatorSet | undefined;

/** What a server-delegated source can filter on, resolved against the schema. */
export interface ServerFilterFields<TRow> {
  /** The schema fields the Filter control may offer — and the lowering may read. */
  fields: FieldDef<TRow>[];
  /** The declaration the lowered filter is canonicalized against. */
  filterable: Filterable;
}

/**
 * Narrow a schema to what a server-delegated source can filter: a field is
 * offered iff its operator set exists AND
 *
 * - the source declares its id, in the domain the set lowers over — a declared
 *   field whose set lowers over ANOTHER domain is a declaration bug (the server
 *   would refuse every rule), so it throws; or
 * - it came through the global `DataViewSlots.FieldExtension` slot
 *   (`extensionIds`), whose server twin (`DataViewServer.QueryAugmentor`) binds
 *   it in the domain its set lowers over.
 *
 * Anything else — a display field the server has no column for — is simply not
 * offered, so the bar can never build a rule the server would have to drop. A
 * SAVED rule on such a field (or on a removed field / operator) is refused by
 * {@link lowerServerFilter} — the surface shows why instead of silently
 * running the rest of the filter as if the rule were not there.
 */
export function serverFilterFields<TRow>(
  fields: FieldDef<TRow>[],
  declared: Filterable,
  extensionIds: ReadonlySet<string>,
  resolveOperatorSet: ResolveOperatorSet,
): ServerFilterFields<TRow> {
  const offered: FieldDef<TRow>[] = [];
  const filterable: Record<string, FilterColumn> = { ...declared };
  for (const field of fields) {
    const set = resolveOperatorSet(field.type ?? "text");
    if (!set) continue;
    const column = Object.hasOwn(declared, field.id)
      ? declared[field.id]
      : undefined;
    if (column !== undefined) {
      if (column.domain !== set.domain) {
        throw new Error(
          `data-view: server source declares "${field.id}" as ${column.domain}, but its ` +
            `field type "${field.type ?? "text"}" filters over ${set.domain} — fix the declaration.`,
        );
      }
      offered.push(field);
    } else if (extensionIds.has(field.id)) {
      filterable[field.id] = { domain: set.domain };
      offered.push(field);
    }
  }
  return { fields: offered, filterable };
}

/**
 * A saved rule the server-delegated source cannot run: its field is not one the
 * source declares filterable (or no longer exists), or its operator is gone.
 * Running the rest of the filter without it would silently show rows the view
 * says it hides, so the query is refused instead.
 */
export class UnavailableFilterRuleError extends Error {
  override name = "UnavailableFilterRuleError";
  constructor(
    readonly rules: readonly { fieldId: string; operatorId: string }[],
  ) {
    super(
      `This view filters on ${rules
        .map((r) => `"${r.fieldId}" (${r.operatorId})`)
        .join(", ")}, which this list cannot filter on — remove ${
        rules.length === 1 ? "that rule" : "those rules"
      } from the filter.`,
    );
  }
}

/** The server query's filter: the canonical tree, or why none can be sent. */
export type ServerFilterResult =
  | { kind: "ok"; filter: Filter | undefined }
  | { kind: "error"; error: FilterError | UnavailableFilterRuleError };

/** Every rule in `group` that does not resolve against `fields` (dangling field or operator). */
function unavailableRules<TRow>(
  group: FilterGroup | null,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: ResolveOperatorSet,
): { fieldId: string; operatorId: string }[] {
  const out: { fieldId: string; operatorId: string }[] = [];
  const walk = (node: FilterNode): void => {
    if (node.kind === "group") node.children.forEach(walk);
    else if (resolveRuleOperator(node, fields, resolveOperatorSet) === null) {
      out.push({ fieldId: node.fieldId, operatorId: node.operatorId });
    }
  };
  if (group) walk(group);
  return out;
}

/**
 * The search box as a filter: `or(contains(col, q) …)` over `searchable` (the
 * trimmed query, matched case-insensitively and literally). Blank → no filter;
 * no searchable column under a non-blank query matches nothing (`or()`).
 */
export function lowerSearch(
  query: string,
  searchable: readonly string[],
  filterable: Filterable,
): Filter | undefined {
  const needle = query.trim();
  if (needle === "") return undefined;
  for (const column of searchable) {
    const domain = Object.hasOwn(filterable, column)
      ? filterable[column]!.domain
      : undefined;
    if (domain !== "text") {
      throw new Error(
        `data-view: searchable column "${column}" must be a declared text column ` +
          `(it is ${domain ?? "undeclared"}).`,
      );
    }
  }
  return or(...searchable.map((column) => clause(column, "contains", needle)));
}

/**
 * The ONE `Filter` a server-delegated query sends: the view's `FilterGroup`
 * lowered at `now`, AND the search box, canonicalized against the source's
 * declaration. Two things are the `error` arm, never sent and never silently
 * trimmed: a rule the source cannot run (`UnavailableFilterRuleError` — a
 * dangling rule would otherwise constrain nothing and show everything), and a
 * tree the language refuses (over its depth / clause / list bounds).
 */
export function lowerServerFilter<TRow>(args: {
  group: FilterGroup | null;
  query: string;
  fields: FieldDef<TRow>[];
  resolveOperatorSet: ResolveOperatorSet;
  filterable: Filterable;
  searchable: readonly string[];
  now: number;
}): ServerFilterResult & { readsClock: boolean } {
  const unavailable = unavailableRules(
    args.group,
    args.fields,
    args.resolveOperatorSet,
  );
  if (unavailable.length > 0) {
    return {
      kind: "error",
      error: new UnavailableFilterRuleError(unavailable),
      readsClock: false,
    };
  }
  const lowered = lowerFilterGroup(
    args.group,
    args.fields,
    args.resolveOperatorSet,
    args.now,
  );
  const search = lowerSearch(args.query, args.searchable, args.filterable);
  const parts = [lowered.filter, search].filter(
    (f): f is Filter => f !== undefined,
  );
  const combined = parts.length === 0 ? undefined : and(...parts);
  try {
    return {
      kind: "ok",
      filter: canonicalizeFilter(combined, args.filterable),
      readsClock: lowered.readsClock,
    };
  } catch (err) {
    if (!(err instanceof FilterError)) throw err;
    return { kind: "error", error: err, readsClock: lowered.readsClock };
  }
}

/**
 * {@link lowerServerFilter} against the day clock, armed only while a rule
 * reads it (a relative date anchor), so "Today" moves to the new day at local
 * midnight — re-querying the server — and a filter over absolute values never
 * schedules anything. Same probe-then-clock pattern as `useRowFilter`.
 */
export function useServerFilter<TRow>(args: {
  group: FilterGroup | null;
  query: string;
  fields: FieldDef<TRow>[];
  resolveOperatorSet: ResolveOperatorSet;
  filterable: Filterable;
  searchable: readonly string[];
}): ServerFilterResult {
  const { group, query, fields, resolveOperatorSet, filterable, searchable } =
    args;
  // Whether the filter reads the clock depends only on the operands, never on
  // the clock's value, so it is asked (at 0) before the clock hook needing it.
  const readsClock = useMemo(
    () => lowerFilterGroup(group, fields, resolveOperatorSet, 0).readsClock,
    [group, fields, resolveOperatorSet],
  );
  const now = useFilterClock(readsClock);
  return useMemo(() => {
    const r = lowerServerFilter({
      group,
      query,
      fields,
      resolveOperatorSet,
      filterable,
      searchable,
      now,
    });
    return r.kind === "ok"
      ? { kind: "ok", filter: r.filter }
      : { kind: "error", error: r.error };
  }, [group, query, fields, resolveOperatorSet, filterable, searchable, now]);
}
