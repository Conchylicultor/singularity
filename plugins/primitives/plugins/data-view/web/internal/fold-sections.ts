import {
  UNGROUPED_FOLD_KEY,
  type DataViewRowEntry,
  type DataViewSection,
  type FieldDef,
  type FilterOperatorSet,
  type FoldRule,
  type ViewState,
} from "../../core";
import { evaluateNode } from "./evaluate-filter";

/** The fold-line key of a section: its group key, or the ungrouped sentinel. */
export function foldKeyOf(section: { key: string | null }): string {
  return section.key ?? UNGROUPED_FOLD_KEY;
}

/**
 * The fold rule actually in effect for a view state: absent while a search is
 * typed, because a search match must never hide behind "…". Uses the same
 * `trim()` test `useFlatRows` applies, so "searching" means one thing.
 */
export function effectiveFold(state: ViewState): FoldRule | undefined {
  return state.query.trim() ? undefined : state.fold;
}

/**
 * Build the "is this entry kept?" predicate the fold step and the host's
 * sentinel gate share. A row is kept when it matches `keep` (the shared
 * `evaluateNode`, so an incomplete rule keeps everything exactly as it filters
 * nothing), or when it is the selected row — the row the user has open is never
 * folded away. An aggregate entry is kept when its representative or any of its
 * members is the selected row; otherwise its representative decides, because
 * that is the row the user sees.
 */
export function makeFoldKeep<TRow>(
  fold: FoldRule,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
  selected: { selectedRowId?: string; rowKey: (row: TRow) => string },
): (entry: DataViewRowEntry<TRow>) => boolean {
  const { selectedRowId, rowKey } = selected;
  return (entry) => {
    if (selectedRowId !== undefined) {
      if (entry.key === selectedRowId) return true;
      if (entry.members?.some((m) => rowKey(m) === selectedRowId)) return true;
    }
    return evaluateNode(fold.keep, entry.row, fields, resolveOperatorSet);
  };
}

/**
 * Pure fold step (testable without React), run LAST — after partition, manual
 * order and aggregation — so it counts the entries the user actually sees.
 *
 * Per section: the entries failing `isKept` are counted into
 * `section.fold.hidden`. While the section's fold line is closed they are pulled
 * from wherever they sort and `entries` keeps only the kept ones (possibly none —
 * the section still renders, header plus fold line); while it is open every
 * entry stays, in sorted order. A section with no failing entry carries no
 * `fold` at all. `count` is never touched: it stays the section's total.
 */
export function foldSections<TRow>(
  sections: DataViewSection<TRow>[],
  opts: {
    isKept: (entry: DataViewRowEntry<TRow>) => boolean;
    openKeys: ReadonlySet<string>;
  },
): DataViewSection<TRow>[] {
  return sections.map((section) => {
    const kept = section.entries.filter(opts.isKept);
    const hidden = section.entries.length - kept.length;
    if (hidden === 0) return section;
    const open = opts.openKeys.has(foldKeyOf(section));
    return {
      ...section,
      entries: open ? section.entries : kept,
      fold: { hidden, open },
    };
  });
}

/**
 * Whether a server-paged view should stop auto-fetching: the fold is in effect,
 * no fold line is open, and the LAST loaded row is folded. Pages past a folded
 * tail would only land behind "…", so the infinite-scroll sentinel is withheld
 * until the user opens a fold (which brings it back).
 */
export function isTailFolded<TRow>(
  rows: readonly TRow[],
  opts: {
    fold: FoldRule | undefined;
    openCount: number;
    isKept: (entry: DataViewRowEntry<TRow>) => boolean;
    rowKey: (row: TRow, index: number) => string;
  },
): boolean {
  if (!opts.fold || opts.openCount > 0 || rows.length === 0) return false;
  const i = rows.length - 1;
  const row = rows[i]!;
  return !opts.isKept({ row, key: opts.rowKey(row, i) });
}
