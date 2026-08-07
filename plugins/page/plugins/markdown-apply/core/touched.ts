// What a plan WRITES, and whether every write stayed inside a boundary the
// caller nominated.
//
// ---------------------------------------------------------------------------
// The engine's second caller-supplied predicate
// ---------------------------------------------------------------------------
//
// `MarkdownApplyArgs.redact` is a caller-supplied ROW FILTER deciding what a
// write may SEE. `isBoundary` here is a caller-supplied ROW PREDICATE deciding
// what a write may DO. Neither teaches this engine what an audience is: one
// takes rows and returns rows, the other takes a row and returns a boolean, and
// the policy that chose either lives entirely with the caller.
//
// So **no block type is named in this module**, deliberately and permanently. The
// type that today means "a card an agent owns" lives in the policy layer
// (`annotations/agent-access`), which imports this plugin; naming it here would
// invert that dependency into a cycle, and would silently stop working the day
// the type is renamed. It is the same rule `plan.ts` follows for the identified
// type set — this module knows what a row DECLARES to the predicate, never which
// plugin declares it.
//
// ---------------------------------------------------------------------------
// It returns violations; it does not throw
// ---------------------------------------------------------------------------
//
// A violation is an answer, not a failure: the caller owns the HTTP status, the
// wording, and whether a violation is fatal at all (a policy might report, or
// judge only some of the four `how`s). User-facing prose in a pure core module
// would also be prose the caller cannot phrase in its own vocabulary — this
// module cannot say "agent-note card" without knowing what one is.
//
// The one thing it DOES throw for is corruption: an ancestor chain that does not
// terminate. Same discipline as `agent-access`'s own `chainToPageRoot` — a
// corrupted forest must be loud rather than spin, and "I could not resolve the
// chain" must never be reachable as a quiet pass.

import { namesField, type BlockFieldChanges } from "@plugins/page/plugins/editor/core";
import type { MarkdownApplyPlan } from "./plan";
import type { StoredRow } from "./stored-row";

/** Every block id this plan writes, by how it writes it. */
export interface TouchedBlocks {
  created: readonly string[];
  updated: readonly string[];
  deleted: readonly string[];
  textEdited: readonly string[];
}

/**
 * The four write channels of a plan, flattened to ids.
 *
 * `updated` names EVERY update, rank-only ones included: a rank write is a write,
 * and a consumer counting what an apply touched must see it. Judging which of
 * them are legitimate is {@link boundaryViolations}' job (see T4 there) — that
 * decision is field-level, and it does not belong in an id list.
 *
 * A block can appear in two lists at once (a survivor that both moved and had its
 * text spliced). That is the honest answer: those are two writes with two owners
 * — the `page_blocks` row and the content `Y.Doc` — as the two channels of the
 * plan already say.
 */
export function touchedBlocks(plan: MarkdownApplyPlan): TouchedBlocks {
  return {
    created: plan.patch.creates.map((b) => b.id),
    updated: plan.patch.updates.map((u) => u.id),
    deleted: [...plan.patch.deleteIds],
    textEdited: plan.textEdits.map((e) => e.blockId),
  };
}

/** How a plan wrote the block a violation names. */
export type TouchedHow = "created" | "updated" | "deleted" | "text-edited";

export interface BoundaryViolation {
  blockId: string;
  how: TouchedHow;
  /**
   * `"escaped"` — after this plan, no boundary is on the block's ancestor chain.
   * The write lands (or landed) in open document body.
   *
   * `"escaped-origin"` — the chain the block ends up on DOES reach a boundary,
   * but the chain it came FROM does not: the plan is pulling a block into a
   * boundary it was never inside. This is T3, and it is the reason an after-only
   * test is not a test (see {@link boundaryViolations}).
   */
  reason: "escaped" | "escaped-origin";
}

/**
 * The fields whose write must resolve inside a boundary.
 *
 * **T4 — the carve-out, and where the bug will live.** Minting a card at page
 * level legitimately RE-RANKS its prose siblings, so `updates` names ordinary
 * prose rows in the feature's main use. A predicate refusing any update that
 * names a non-boundary block would therefore refuse the feature itself. A
 * rank-only update is exempt: it changes where a row sits among its siblings,
 * which the row's own neighbours already imply, and nothing about what it IS or
 * whose subtree it is in.
 *
 * `expanded` is exempt for the same reason and one more: it is view state, and
 * `plan.ts`'s second survivor invariant means a plan never emits it at all. It is
 * listed as exempt rather than judged so that "which fields carry authority" is
 * one statement here rather than an accident of what the planner happens to emit.
 */
const JUDGED_FIELDS = [
  "type",
  "data",
  "parentId",
] as const satisfies readonly (keyof BlockFieldChanges)[];

/** Does this update claim authority over anything but the row's position? */
function updateIsJudged(changes: BlockFieldChanges): boolean {
  return JUDGED_FIELDS.some((field) => namesField(changes, field));
}

/**
 * The parent/type maps a chain walk resolves against. Two of them exist per call
 * — see {@link boundaryViolations} — and neither is ever mutated after it is
 * built.
 */
interface ChainMaps {
  parentOf: Map<string, string | null>;
  typeOf: Map<string, string>;
}

/** The forest as it stands BEFORE the plan: the whole partition, unmodified. */
function mapsOfExisting(existing: readonly StoredRow[]): ChainMaps {
  const parentOf = new Map<string, string | null>();
  const typeOf = new Map<string, string>();
  for (const row of existing) {
    parentOf.set(row.id, row.parentId);
    typeOf.set(row.id, row.type);
  }
  return { parentOf, typeOf };
}

/**
 * The forest as it stands AFTER the plan: the same maps, overlaid by everything
 * the patch writes to a row's IDENTITY or POSITION IN THE TREE — the creates
 * (which carry both) and the `parentId` / `type` an update names.
 *
 * `deleteIds` are deliberately NOT removed. A deleted row is only ever walked in
 * the before-maps, so removing it here would buy nothing; and leaving it means a
 * surviving child of a deleted parent still resolves a chain rather than
 * silently ending at an absent id.
 */
function mapsAfterPlan(before: ChainMaps, plan: MarkdownApplyPlan): ChainMaps {
  const parentOf = new Map(before.parentOf);
  const typeOf = new Map(before.typeOf);
  for (const created of plan.patch.creates) {
    parentOf.set(created.id, created.parentId);
    typeOf.set(created.id, created.type);
  }
  for (const update of plan.patch.updates) {
    if (namesField(update.changes, "parentId")) {
      parentOf.set(update.id, update.changes.parentId ?? null);
    }
    if (namesField(update.changes, "type")) typeOf.set(update.id, update.changes.type!);
  }
  return { parentOf, typeOf };
}

/**
 * Does `startId`'s ancestor chain, resolved against `maps`, reach a boundary?
 *
 * **A boundary row is inside itself**, which is what makes a newly created card
 * satisfy its own check (and its children satisfy theirs through it). Without
 * that, minting a card would be the one thing a boundary rule could never allow.
 *
 * The walk ends at the first boundary, at `rootId` (the scope's own ceiling —
 * checked AFTER the boundary test, so a card-scoped apply whose root IS a card
 * still resolves), or at a parent that is null or names no row.
 *
 * **The bound is corruption-only and throws.** A forest cannot hold a cycle, so a
 * chain longer than every row plus every created row means the maps are corrupt,
 * and the fail-safe answer to "I cannot resolve this chain" is neither `true` nor
 * `false` — both would be a verdict this function has no evidence for.
 */
function reachesBoundary(
  startId: string,
  maps: ChainMaps,
  rootId: string,
  isBoundary: (row: { id: string; type: string }) => boolean,
  bound: number,
): boolean {
  let current: string | undefined = startId;
  for (let steps = 0; current !== undefined; steps++) {
    if (steps > bound) {
      throw new Error(
        `boundaryViolations: the ancestor chain of block ${startId} does not ` +
          `terminate (walked past ${bound} rows). The block forest is corrupt.`,
      );
    }
    const type = maps.typeOf.get(current);
    if (type !== undefined && isBoundary({ id: current, type })) return true;
    if (current === rootId) return false;
    current = maps.parentOf.get(current) ?? undefined;
  }
  return false;
}

/**
 * Every write in `plan` that resolves OUTSIDE the caller's boundaries.
 *
 * ---------------------------------------------------------------------------
 * T3 — the both-chains rule, which is the whole point of this function
 * ---------------------------------------------------------------------------
 *
 * The naive test — "is the touched block inside a boundary AFTER the plan" —
 * accepts an edit that hoovers the document's prose into a boundary:
 *
 * ```
 * BEFORE                                   AFTER
 *   root                                     root
 *    ├ p1  "The parser handles UTF-8."        └ card   (a boundary)
 *    ├ card (a boundary)                          ├ p1   ← MOVED IN
 *    │   └ n1 "Checked the writer."               └ n1
 * ```
 *
 * `p1`'s NEW chain reaches a boundary, so an after-only test calls it legal — and
 * the whole document can be annexed into one card in a single edit without
 * deleting a character. It is REACHABLE rather than theoretical precisely because
 * the text is byte-identical: the aligner matches `p1` and preserves its row id,
 * so it arrives as an `update` naming `parentId`, not as a delete plus a create.
 *
 * So the chain is checked on **whichever sides exist**:
 *
 * | how                   | before | after | chains that must reach a boundary |
 * |-----------------------|--------|-------|-----------------------------------|
 * | created               | no     | yes   | new only                          |
 * | deleted               | yes    | no    | old only                          |
 * | updated / text-edited | yes    | yes   | **both**                          |
 *
 * The old chain is resolved against the pre-plan maps, never the post-plan ones.
 * That matters beyond deletes: an edit that moves a block's PARENT into a
 * boundary while touching the block itself would otherwise launder the block
 * through its ancestor, which is T3 one level up.
 *
 * ---------------------------------------------------------------------------
 * Order and multiplicity
 * ---------------------------------------------------------------------------
 *
 * Violations come back grouped by channel — created, updated, deleted,
 * text-edited — each in the plan's own order, so the list is deterministic. One
 * block may appear twice under two `how`s, because those are two writes with two
 * owners; a caller that wants one message per block dedupes on `blockId`.
 */
export function boundaryViolations(args: {
  plan: MarkdownApplyPlan;
  /** The same whole-partition row set the plan was built over. */
  existing: readonly StoredRow[];
  /** The plan's scope root — the ceiling every chain walk stops at. */
  rootId: string;
  /**
   * Is this row a boundary? A caller-supplied ROW PREDICATE, exactly as `redact`
   * is a caller-supplied row filter — this module never learns what the answer
   * means, and never names a block type.
   */
  isBoundary: (row: { id: string; type: string }) => boolean;
}): BoundaryViolation[] {
  const { plan, existing, rootId, isBoundary } = args;
  const before = mapsOfExisting(existing);
  const after = mapsAfterPlan(before, plan);
  // Every row that can be on a chain: the partition plus everything this plan
  // mints. A legitimate chain is shorter than that by construction.
  const bound = existing.length + plan.patch.creates.length;

  const violations: BoundaryViolation[] = [];
  const judge = (blockId: string, how: TouchedHow, sides: "new" | "old" | "both"): void => {
    const hasNew = sides !== "old";
    const hasOld = sides !== "new";
    if (hasNew && !reachesBoundary(blockId, after, rootId, isBoundary, bound)) {
      violations.push({ blockId, how, reason: "escaped" });
      return;
    }
    if (hasOld && !reachesBoundary(blockId, before, rootId, isBoundary, bound)) {
      // `escaped-origin` is only sayable when there IS a new chain and it passed
      // — it means "this write is pulling the block into a boundary it was never
      // inside". A delete has no new chain at all, so its failure is the plain
      // one: nothing on its chain was ever a boundary.
      violations.push({ blockId, how, reason: hasNew ? "escaped-origin" : "escaped" });
    }
  };

  for (const created of plan.patch.creates) judge(created.id, "created", "new");
  for (const update of plan.patch.updates) {
    // T4: a rank-only update to a row outside every boundary is the ordinary
    // consequence of minting a card beside it, not a write into it.
    if (updateIsJudged(update.changes)) judge(update.id, "updated", "both");
  }
  for (const id of plan.patch.deleteIds) judge(id, "deleted", "old");
  for (const edit of plan.textEdits) judge(edit.blockId, "text-edited", "both");
  return violations;
}
