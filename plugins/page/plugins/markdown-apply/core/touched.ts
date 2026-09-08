// What a plan WRITES, and whether every write resolved inside a boundary the
// caller declared open.
//
// ---------------------------------------------------------------------------
// The engine's second caller-supplied predicate
// ---------------------------------------------------------------------------
//
// `MarkdownApplyArgs.redact` is a caller-supplied ROW FILTER deciding what a
// write may SEE. `boundaryOf` here is a caller-supplied ROW CLASSIFIER deciding
// what a write may DO. Neither teaches this engine what an audience is: one
// takes rows and returns rows, the other takes a row and returns one of three
// answers, and the policy behind any of them lives entirely with the caller.
//
// **Three answers, not two, because a boundary has an inside AND an outside.** A
// two-valued predicate can say only "writes are allowed at and under this row";
// it has no way to say "and NOT under this one", so a region the caller wants to
// shield INSIDE an allowed one has no spelling at all. The third answer is the
// absent one: a row that declares nothing is transparent and the walk continues
// past it, which is what lets the two declarations nest and the NEAREST one win
// — see {@link nearestBoundary}.
//
// So **no block type is named in this module**, deliberately and permanently. The
// types that today mean "a card an agent owns" and "a card that holds the page
// author's own words" live in the policy layer (`annotations/agent-access`),
// which imports this plugin; naming either here would invert that dependency into
// a cycle, and would silently stop working the day a type is renamed. It is the
// same rule `plan.ts` follows for the identified type set — this module knows what
// a row DECLARES to the classifier, never which plugin declares it.
//
// ---------------------------------------------------------------------------
// It returns violations; it does not throw
// ---------------------------------------------------------------------------
//
// A violation is an answer, not a failure: the caller owns the HTTP status, the
// wording, and whether a violation is fatal at all (a policy might report, or
// judge only some of the four `how`s). User-facing prose in a pure core module
// would also be prose the caller cannot phrase in its own vocabulary — this
// module cannot say "agent-note card" without knowing what one is, and cannot say
// which of two refusals a reader is looking at without naming both.
//
// The one thing it DOES throw for is corruption: an ancestor chain that does not
// terminate. Same discipline as `agent-access`'s own `chainToPageRoot` — a
// corrupted forest must be loud rather than spin, and "I could not resolve the
// chain" must never be reachable as a quiet pass.

import {
  namesField,
  type BlockFieldChanges,
} from "@plugins/page/plugins/editor/core";
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

/**
 * What a row declares about writes inside it. `undefined` — it declares nothing,
 * and a chain walk passes straight through it to whatever sits above.
 *
 * `"open"` admits writes at and under the row; `"closed"` refuses them. Absence
 * is not a third policy but the ABSENCE of one, which is precisely what makes the
 * two declarations compose rather than merely coexist: a row that says nothing
 * cannot shadow the answer of a row that does. See {@link nearestBoundary}.
 */
export type WriteBoundary = "open" | "closed";

export interface BoundaryViolation {
  blockId: string;
  how: TouchedHow;
  /**
   * WHICH of the write's two chains failed. `"new"` — where the write lands,
   * resolved against the post-plan forest. `"old"` — where the block came FROM,
   * resolved against the pre-plan one.
   *
   * A create has only a new chain and a delete only an old one, so for those the
   * side is implied by `how`; for an update or a text edit it is the whole of the
   * answer, and it is what tells "you wrote somewhere you may not" apart from
   * "you moved something out of somewhere you may not touch" (T3, below).
   */
  side: "new" | "old";
  /**
   * WHY that chain failed, and the two are different enough that a caller words
   * them differently.
   *
   * `"escaped"` — nothing on the chain declared anything at all: from the block up
   * to the scope root, no row said whether writes are allowed inside it. The write
   * lands (or landed) in open document body.
   *
   * `"enclosed"` — the chain DID declare something, and the nearest declaration
   * was `"closed"`: the write is inside a region the caller shields. Note this
   * includes the block's OWN row, which is what makes CREATING a closed row a
   * violation rather than a special case somebody has to remember to write.
   */
  reason: "escaped" | "enclosed";
}

/**
 * The fields whose write must resolve inside an open boundary.
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
    if (namesField(update.changes, "type"))
      typeOf.set(update.id, update.changes.type!);
  }
  return { parentOf, typeOf };
}

/**
 * What does `startId`'s ancestor chain, resolved against `maps`, declare about
 * writes — and `"none"` when nothing on it declares anything.
 *
 * **The nearest declaring row wins.** The walk stops at the first row that
 * declares ANYTHING, not at the first row that says yes, and that single choice is
 * the whole of the composition rule: a closed card nested inside an open one
 * shields its own contents, and an open card nested inside a closed one still
 * admits writes. A walk stopping only at `"open"` could never express the first; a
 * walk stopping only at `"closed"` could never express the second.
 *
 * **A declaring row is inside itself**, which is what makes a newly created open
 * card satisfy its own check (and its children satisfy theirs through it). Without
 * that, minting a card would be the one thing a boundary rule could never allow.
 * The same self-inclusion pointed the other way is what makes creating a CLOSED
 * row a violation at its own row — so "nothing may mint a card whose words are not
 * the writer's" needs no walk of its own, and stops being a second invariant that
 * can drift out of step with this one.
 *
 * The walk ends at that first declaration, at `rootId` (the scope's own ceiling —
 * checked AFTER the declaration test, so a scoped apply whose root IS a declaring
 * card still resolves against it), or at a parent that is null or names no row.
 *
 * **The bound is corruption-only and throws.** A forest cannot hold a cycle, so a
 * chain longer than every row plus every created row means the maps are corrupt,
 * and the fail-safe answer to "I cannot resolve this chain" is none of the three
 * — each would be a verdict this function has no evidence for.
 */
function nearestBoundary(
  startId: string,
  maps: ChainMaps,
  rootId: string,
  boundaryOf: (row: { id: string; type: string }) => WriteBoundary | undefined,
  bound: number,
): WriteBoundary | "none" {
  let current: string | undefined = startId;
  for (let steps = 0; current !== undefined; steps++) {
    if (steps > bound) {
      throw new Error(
        `boundaryViolations: the ancestor chain of block ${startId} does not ` +
          `terminate (walked past ${bound} rows). The block forest is corrupt.`,
      );
    }
    const type = maps.typeOf.get(current);
    if (type !== undefined) {
      const declared = boundaryOf({ id: current, type });
      if (declared !== undefined) return declared;
    }
    if (current === rootId) return "none";
    current = maps.parentOf.get(current) ?? undefined;
  }
  return "none";
}

/**
 * A failed chain answer, said as a violation's reason. `"open"` is the pass and
 * never reaches here, which is why it is unspellable in the parameter type —
 * one statement of the mapping, rather than the same ternary at both call sites
 * in {@link boundaryViolations}'s `judge`.
 */
function reasonOf(at: "closed" | "none"): BoundaryViolation["reason"] {
  return at === "none" ? "escaped" : "enclosed";
}

/**
 * Every write in `plan` that does not resolve inside an OPEN boundary the caller
 * declared.
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
 *    ├ p1  "The parser handles UTF-8."        └ card   (an open boundary)
 *    ├ card (an open boundary)                    ├ p1   ← MOVED IN
 *    │   └ n1 "Checked the writer."               └ n1
 * ```
 *
 * `p1`'s NEW chain reaches an open boundary, so an after-only test calls it legal
 * — and the whole document can be annexed into one card in a single edit without
 * deleting a character. It is REACHABLE rather than theoretical precisely because
 * the text is byte-identical: the aligner matches `p1` and preserves its row id,
 * so it arrives as an `update` naming `parentId`, not as a delete plus a create.
 *
 * So the chain is checked on **whichever sides exist**:
 *
 * | how                   | before | after | chains that must resolve OPEN |
 * |-----------------------|--------|-------|-------------------------------|
 * | created               | no     | yes   | new only                      |
 * | deleted               | yes    | no    | old only                      |
 * | updated / text-edited | yes    | yes   | **both**                      |
 *
 * The old chain is resolved against the pre-plan maps, never the post-plan ones.
 * That matters beyond deletes: an edit that moves a block's PARENT into a
 * boundary while touching the block itself would otherwise launder the block
 * through its ancestor, which is T3 one level up.
 *
 * The closed answer rides the same two chains and needs no rule of its own. A
 * write INSIDE a shielded region fails on the new side; a write that carries a
 * block OUT of one — a move, a retype, a delete — fails on the old side, which is
 * the same evidence T3 already collects, read for the other reason.
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
   * What does this row declare about writes inside it? A caller-supplied ROW
   * CLASSIFIER, exactly as `redact` is a caller-supplied row filter — this module
   * never learns what any of the three answers means, and never names a block
   * type. `undefined` is the ordinary case: the overwhelming majority of a page's
   * rows are prose, which declares nothing.
   */
  boundaryOf: (row: { id: string; type: string }) => WriteBoundary | undefined;
}): BoundaryViolation[] {
  const { plan, existing, rootId, boundaryOf } = args;
  const before = mapsOfExisting(existing);
  const after = mapsAfterPlan(before, plan);
  // Every row that can be on a chain: the partition plus everything this plan
  // mints. A legitimate chain is shorter than that by construction.
  const bound = existing.length + plan.patch.creates.length;

  const violations: BoundaryViolation[] = [];
  // The new side first, and RETURN on its failure: a write that does not land
  // legally is ONE answer, not two, and reporting the old chain as well would
  // turn a single refused write into a pair of messages about one block.
  const judge = (
    blockId: string,
    how: TouchedHow,
    sides: "new" | "old" | "both",
  ): void => {
    const hasNew = sides !== "old";
    const hasOld = sides !== "new";
    if (hasNew) {
      const lands = nearestBoundary(blockId, after, rootId, boundaryOf, bound);
      if (lands !== "open") {
        violations.push({ blockId, how, side: "new", reason: reasonOf(lands) });
        return;
      }
    }
    if (hasOld) {
      const came = nearestBoundary(blockId, before, rootId, boundaryOf, bound);
      if (came !== "open") {
        violations.push({ blockId, how, side: "old", reason: reasonOf(came) });
      }
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
