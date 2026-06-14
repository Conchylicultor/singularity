import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import type { ReorderTree } from "@plugins/fields/plugins/reorder-tree/core";
import {
  applyTree,
  contributionLabel,
  entryKey,
  isNodeData,
  type TopLevelEntry,
} from "./sorting";

/** Per-contribution change between two reorder trees. */
export interface ReorderDiffEntry {
  /** The contribution's `entryKey` (`pluginId:id`). */
  readonly entryKey: string;
  /** Human-readable label for the contribution. */
  readonly label: string;
  /**
   * - `"moved"`    — visible in both, but at a different ordinal position.
   * - `"hidden"`   — visible in `before`, hidden in `after`.
   * - `"added"`    — hidden (or absent) in `before`, visible in `after`.
   * - `"unchanged"`— visible in both at the same position.
   */
  readonly status: "moved" | "hidden" | "added" | "unchanged";
}

/** Structured before/after diff of two reorder trees over the live catalog. */
export interface ReorderTreesDiff {
  readonly entries: ReorderDiffEntry[];
}

/**
 * The visible top-level entries of `tree` resolved over the live catalog, in
 * order, as `(entryKey, label)` pairs. Container members are flattened in their
 * resolved order so a contribution moving in/out of a group is captured. Node
 * entries (spacers/headers) carry no `entryKey` and are skipped — the diff is
 * about contributions, not structural nodes.
 */
function visibleEntryList(
  contributions: Contribution[],
  tree: ReorderTree,
): Array<{ entryKey: string; label: string }> {
  const state = applyTree(contributions, tree);
  const out: Array<{ entryKey: string; label: string }> = [];
  const pushEntry = (e: TopLevelEntry) => {
    if (isNodeData(e)) {
      for (const m of e.members ?? []) {
        if (!isNodeData(m)) {
          out.push({ entryKey: entryKey(m), label: contributionLabel(m) });
        }
      }
      return;
    }
    out.push({ entryKey: entryKey(e), label: contributionLabel(e) });
  };
  for (const e of state.entries) pushEntry(e);
  return out;
}

/**
 * Diff two reorder trees by resolving BOTH over the same live catalog and
 * comparing the resulting ordered, visible contribution lists. The result is a
 * flat list keyed by `entryKey`, one entry per contribution that is visible in
 * `before` and/or `after`, marked `moved` / `hidden` / `added` / `unchanged`.
 *
 * The review section provides the live `contributions` (it has catalog access),
 * `before` = the current committed `items`, `after` = the staged `items`.
 */
export function diffReorderTrees(
  contributions: Contribution[],
  before: ReorderTree,
  after: ReorderTree,
): ReorderTreesDiff {
  const beforeList = visibleEntryList(contributions, before);
  const afterList = visibleEntryList(contributions, after);

  const beforePos = new Map<string, number>();
  beforeList.forEach((e, i) => beforePos.set(e.entryKey, i));
  const afterPos = new Map<string, number>();
  afterList.forEach((e, i) => afterPos.set(e.entryKey, i));

  // Label lookup: prefer the `after` label, fall back to `before`.
  const labelOf = new Map<string, string>();
  for (const e of beforeList) labelOf.set(e.entryKey, e.label);
  for (const e of afterList) labelOf.set(e.entryKey, e.label);

  const entries: ReorderDiffEntry[] = [];

  // Walk the `after` order first (the proposed layout the reviewer reads).
  afterList.forEach((e, afterIdx) => {
    const beforeIdx = beforePos.get(e.entryKey);
    let status: ReorderDiffEntry["status"];
    if (beforeIdx === undefined) {
      status = "added";
    } else if (beforeIdx === afterIdx) {
      status = "unchanged";
    } else {
      status = "moved";
    }
    entries.push({
      entryKey: e.entryKey,
      label: labelOf.get(e.entryKey) ?? e.label,
      status,
    });
  });

  // Then contributions visible in `before` but no longer in `after` (hidden).
  for (const e of beforeList) {
    if (!afterPos.has(e.entryKey)) {
      entries.push({
        entryKey: e.entryKey,
        label: labelOf.get(e.entryKey) ?? e.label,
        status: "hidden",
      });
    }
  }

  return { entries };
}
