import { describe, expect, test } from "bun:test";
import {
  UNGROUPED_FOLD_KEY,
  type DataViewRowEntry,
  type DataViewSection,
  type FieldDef,
  type FilterFieldValue,
  type FilterOperatorSet,
  type FoldRule,
  type ViewState,
} from "../../core";
import {
  effectiveFold,
  foldSections,
  isTailFolded,
  makeFoldKeep,
} from "./fold-sections";
import { aggregateSections } from "./use-data-view-sections";

interface Conv {
  id: string;
  age: number;
}

const ageField: FieldDef<Conv> = {
  id: "age",
  label: "Age",
  type: "number",
  value: (c) => c.age,
};

/** A one-operator stand-in for the number type's operator set, so this suite
 *  proves the mechanism without importing any field type. */
const numberOps: FilterOperatorSet = {
  operators: [
    {
      id: "lt",
      label: "Is less than",
      hasValue: true,
      predicate: (operand: unknown, value: FilterFieldValue) =>
        typeof value === "number" && value < (operand as number),
    },
  ],
} as unknown as FilterOperatorSet;
const resolveOps = (typeId: string) =>
  typeId === "number" ? numberOps : undefined;

/** Keep rows younger than 30 (days). */
const RECENT: FoldRule = {
  keep: {
    kind: "group",
    id: "keep",
    conjunction: "and",
    children: [
      { kind: "rule", id: "r", fieldId: "age", operatorId: "lt", value: 30 },
    ],
  },
};

const rowKey = (c: Conv) => c.id;
const entry = (c: Conv): DataViewRowEntry<Conv> => ({ row: c, key: c.id });

function section(key: string | null, rows: Conv[]): DataViewSection<Conv> {
  return {
    key,
    label: key ?? undefined,
    count: rows.length,
    entries: rows.map(entry),
  };
}

function keepFor(selectedRowId?: string) {
  return makeFoldKeep(RECENT, [ageField], resolveOps, {
    selectedRowId,
    rowKey,
  });
}

const a = { id: "a", age: 1 };
const b = { id: "b", age: 90 };
const c = { id: "c", age: 5 };
const d = { id: "d", age: 60 };

describe("foldSections", () => {
  test("splits kept from hidden rows and leaves the total count untouched", () => {
    const [s] = foldSections([section("done", [a, b, c, d])], {
      isKept: keepFor(),
      openKeys: new Set(),
    });
    expect(s!.entries.map((e) => e.key)).toEqual(["a", "c"]);
    expect(s!.fold).toEqual({ hidden: 2, open: false });
    expect(s!.count).toBe(4);
  });

  test("a section whose rows are all folded keeps its header", () => {
    const sections = foldSections(
      [section("queue", [a]), section("old", [b, d])],
      { isKept: keepFor(), openKeys: new Set() },
    );
    expect(sections.map((s) => s.key)).toEqual(["queue", "old"]);
    const old = sections[1]!;
    expect(old.label).toBe("old");
    expect(old.entries).toEqual([]);
    expect(old.count).toBe(2);
    expect(old.fold).toEqual({ hidden: 2, open: false });
  });

  test("the selected row is never folded", () => {
    const [s] = foldSections([section("done", [a, b, d])], {
      isKept: keepFor("b"),
      openKeys: new Set(),
    });
    expect(s!.entries.map((e) => e.key)).toEqual(["a", "b"]);
    expect(s!.fold).toEqual({ hidden: 1, open: false });
  });

  test("an open fold line shows every entry, in sorted order", () => {
    const [s] = foldSections([section("done", [b, a, d, c])], {
      isKept: keepFor(),
      openKeys: new Set(["done"]),
    });
    expect(s!.entries.map((e) => e.key)).toEqual(["b", "a", "d", "c"]);
    expect(s!.fold).toEqual({ hidden: 2, open: true });
  });

  test("the implicit ungrouped section opens under UNGROUPED_FOLD_KEY", () => {
    const [s] = foldSections([section(null, [a, b])], {
      isKept: keepFor(),
      openKeys: new Set([UNGROUPED_FOLD_KEY]),
    });
    expect(s!.fold).toEqual({ hidden: 1, open: true });
    expect(s!.entries).toHaveLength(2);
  });

  test("a section with no failing row carries no fold", () => {
    const input = section("fresh", [a, c]);
    const [s] = foldSections([input], {
      isKept: keepFor(),
      openKeys: new Set(),
    });
    expect(s).toBe(input);
    expect(s!.fold).toBeUndefined();
  });

  test("an aggregate entry is decided by its representative", () => {
    // Members `b` (old) and `c` (recent) collapse into one entry.
    const agg = aggregateSections([section("done", [b, c, d])], {
      getKey: (r) => (r.id === "d" ? null : "pair"),
    });
    const oldRep = foldSections(agg, {
      isKept: keepFor(),
      openKeys: new Set(),
    });
    // Representative defaults to the first member, `b` — old, so it folds.
    expect(oldRep[0]!.entries).toEqual([]);
    expect(oldRep[0]!.fold).toEqual({ hidden: 2, open: false });

    const recentRep = aggregateSections([section("done", [b, c, d])], {
      getKey: (r) => (r.id === "d" ? null : "pair"),
      pickRepresentative: (members) => members[1]!,
    });
    const [s] = foldSections(recentRep, {
      isKept: keepFor(),
      openKeys: new Set(),
    });
    expect(s!.entries.map((e) => e.row.id)).toEqual(["c"]);
    expect(s!.fold).toEqual({ hidden: 1, open: false });
  });

  test("an aggregate entry holding the selected row is kept", () => {
    const agg = aggregateSections([section("done", [b, d])], {
      getKey: () => "pair",
    });
    const [s] = foldSections(agg, {
      isKept: keepFor("d"),
      openKeys: new Set(),
    });
    expect(s!.entries).toHaveLength(1);
    expect(s!.fold).toBeUndefined();
  });
});

describe("effectiveFold", () => {
  const base: ViewState = { sort: [], filter: null, query: "", fold: RECENT };

  test("is the view's fold when nothing is searched", () => {
    expect(effectiveFold(base)).toBe(RECENT);
  });

  test("search suspends folding", () => {
    expect(effectiveFold({ ...base, query: "old" })).toBeUndefined();
  });

  test("a whitespace-only query is not a search", () => {
    expect(effectiveFold({ ...base, query: "  " })).toBe(RECENT);
  });
});

describe("isTailFolded", () => {
  const opts = (openCount: number, fold: FoldRule | null = RECENT) => ({
    fold: fold ?? undefined,
    openCount,
    isKept: keepFor(),
    rowKey,
  });

  test("true when the last loaded row is folded and no fold is open", () => {
    expect(isTailFolded([a, b], opts(0))).toBe(true);
  });

  test("false once any fold line is open", () => {
    expect(isTailFolded([a, b], opts(1))).toBe(false);
  });

  test("false when the last loaded row is kept", () => {
    expect(isTailFolded([b, a], opts(0))).toBe(false);
  });

  test("false with no fold in effect, or no rows", () => {
    expect(isTailFolded([a, b], opts(0, null))).toBe(false);
    expect(isTailFolded([], opts(0))).toBe(false);
  });
});
