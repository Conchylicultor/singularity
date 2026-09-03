// An edit is judged on what IT changed, not on what the round trip changed.
//
// ---------------------------------------------------------------------------
// The problem this exists for
// ---------------------------------------------------------------------------
//
// A caller reads a scope as markdown, splices one string, and hands the WHOLE
// document back. So every block on the page goes through markdown → forest
// again, and any place where that projection is lossy arrives at the write
// boundary as a write the caller never asked for — a paragraph re-indented, a
// block dropped, a text edit on prose nobody touched. A policy judging the plan
// (`touched.ts`) then refuses the edit over blocks the caller never named.
//
// The fix is a subtraction, not a tolerance: plan the document the caller
// STARTED from against the same rows, and drop from the real plan every write
// that identity round trip would have produced by itself. What is left is the
// caller's edit, and that is what gets judged and written.
//
// ---------------------------------------------------------------------------
// What may be compared, and what may not
// ---------------------------------------------------------------------------
//
// `updates`, `deleteIds` and `textEdits` all key off EXISTING row ids, and
// `planMarkdownApply` is otherwise deterministic (`Rank.nBetween` is
// deterministic; nothing in `plan.ts` or `align.ts` is random), so two passes
// over the same rows produce byte-comparable writes on those three channels.
//
// **`creates` are never subtracted, and cannot be.** Every planning pass mints
// fresh `crypto.randomUUID()` ids and a fresh `new Date()` (`plan.ts:336`,
// `plan.ts:569`), so two passes' creates are not comparable in the first place —
// there is no equality to test. Nor should there be: a create in the noise plan
// would mean the READ invented a block, which is a bug in the projection rather
// than something to absorb. If one ever appears it lands outside whatever
// boundary the caller judges by and is refused loudly, which is the correct
// failure.

import {
  namesField,
  type BlockFieldChanges,
  type BlockUpdate,
} from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { stableJson } from "./flatten";
import type { MarkdownApplyPlan, MarkdownTextEdit } from "./plan";

/**
 * Structural equality over one field of a change set.
 *
 * Field-agnostic on purpose: the only value in a `BlockFieldChanges` that is not
 * plain JSON is a `Rank`, whose privately-held string would otherwise be
 * compared through a property name no caller may depend on. Everything else —
 * `parentId`, `type`, `expanded`, and the arbitrary `data` blob — is
 * JSON-shaped, so one key-order-independent serialization settles it.
 */
function valueEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Rank || b instanceof Rank) {
    return a instanceof Rank && b instanceof Rank && Rank.equals(a, b);
  }
  return stableJson(a) === stableJson(b);
}

/**
 * Do two updates claim the exact same write?
 *
 * PRESENCE of a key is what "this patch writes that column" means (see
 * `namesField`), so a change set naming one more field than another is a
 * different write however the values compare — which is why the key sets are
 * matched before the values are. No field is named here, so a new column joining
 * `BlockFieldChanges` is covered by construction.
 */
function changesEqual(a: BlockFieldChanges, b: BlockFieldChanges): boolean {
  const keys = Object.keys(a) as (keyof BlockFieldChanges)[];
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    if (!namesField(b, key)) return false;
    if (!valueEqual(a[key], b[key])) return false;
  }
  return true;
}

/**
 * Drop from `items` the first entry matching each entry of `noise`, consuming
 * each match once.
 *
 * A MULTISET difference rather than a set one: two writes that happen to be
 * identical are still two writes, and cancelling both against one occurrence in
 * the noise plan would silently drop a real one. In practice each channel names
 * a row id at most once per plan, so this is the same answer — it is written
 * this way so it stays the same answer if that ever stops holding.
 */
function subtractMatching<T>(
  items: readonly T[],
  noise: readonly T[],
  equal: (a: T, b: T) => boolean,
): T[] {
  const remaining = [...noise];
  const kept: T[] = [];
  for (const item of items) {
    const at = remaining.findIndex((candidate) => equal(candidate, item));
    if (at === -1) kept.push(item);
    else remaining.splice(at, 1);
  }
  return kept;
}

const updateEqual = (a: BlockUpdate, b: BlockUpdate): boolean =>
  a.id === b.id && changesEqual(a.changes, b.changes);

const textEditEqual = (a: MarkdownTextEdit, b: MarkdownTextEdit): boolean =>
  a.blockId === b.blockId && stableJson(a.runs) === stableJson(b.runs);

/**
 * Every write a plan makes, across all four channels.
 *
 * The one definition of "how much this plan writes", so a caller reporting how
 * much a subtraction absorbed cannot count it differently from how the plan
 * counts it.
 */
export function planWriteCount(plan: MarkdownApplyPlan): number {
  return (
    plan.patch.creates.length +
    plan.patch.updates.length +
    plan.patch.deleteIds.length +
    plan.textEdits.length
  );
}

/**
 * `plan` minus every write that `noise` makes identically — the caller's edit,
 * with the round trip's own writes taken back out.
 *
 * `noise` must be planned against the SAME rows, with the same redaction and the
 * same markdown dialect, or the two are not comparable and the subtraction is
 * meaningless. That is why this is a pure function over two plans and never
 * reads rows itself: the one caller that can honour that precondition is the one
 * that already holds both (`server/internal/apply.ts`), which plans both from
 * one row read.
 *
 * `stats` is recomputed off the surviving writes, so a report built from the
 * result cannot claim a write that was dropped. `survived` is carried through
 * unchanged: it counts rows that KEPT their identity, which is a property of the
 * alignment and not of any write — dropping a redundant write does not un-survive
 * the row it named.
 */
export function subtractNoise(
  plan: MarkdownApplyPlan,
  noise: MarkdownApplyPlan,
): MarkdownApplyPlan {
  const updates = subtractMatching(
    plan.patch.updates,
    noise.patch.updates,
    updateEqual,
  );
  const noiseDeletes = new Set(noise.patch.deleteIds);
  const deleteIds = plan.patch.deleteIds.filter((id) => !noiseDeletes.has(id));
  const textEdits = subtractMatching(
    plan.textEdits,
    noise.textEdits,
    textEditEqual,
  );

  const moved = updates.filter(
    (update) =>
      namesField(update.changes, "parentId") ||
      namesField(update.changes, "rank"),
  ).length;

  return {
    patch: { creates: plan.patch.creates, updates, deleteIds },
    textEdits,
    stats: {
      survived: plan.stats.survived,
      created: plan.patch.creates.length,
      deleted: deleteIds.length,
      moved,
    },
  };
}
