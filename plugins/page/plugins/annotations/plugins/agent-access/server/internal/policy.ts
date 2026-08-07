import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { Editor, type StoredBlock } from "@plugins/page/plugins/editor/server";
import { namesField } from "@plugins/page/plugins/editor/core";
import { agentNotesBlock } from "@plugins/page/plugins/annotations/plugins/agent-notes/core";
import {
  boundaryViolations,
  touchedBlocks,
  type BoundaryViolation,
  type MarkdownApplyPlan,
} from "@plugins/page/plugins/markdown-apply/core";
import type { BlockScope } from "@plugins/page/plugins/markdown-apply/server";

/**
 * The rules that make `page/markdown-apply`'s audience-agnostic engine safe to
 * hand an agent. The engine takes a root, a row filter and a boundary predicate;
 * deciding WHICH root, WHICH filter and WHICH boundary is this module, and it is
 * the only place in the delivery path that knows what an audience is.
 *
 *  1. **Redaction, on BOTH halves.** Rows whose type declares `audience:
 *     "human"` are filtered out of the read's walk — and out of the WRITE's walk,
 *     through the same function ({@link redactHumanAudience}). Same filter, both
 *     directions, which is what makes "a private card is invisible but preserved"
 *     literally true: a write diffs against exactly the document the read
 *     produced, so a card the agent never saw can never be seen as a deletion.
 *  2. **Ancestor refusal (read AND write).** A block that IS, or sits INSIDE, a
 *     human-audience card is refused outright ({@link assertAgentAddressable}).
 *     Without this the id itself is the bypass: redaction prunes the card, so
 *     naming a block under it would walk a forest the filter already emptied — an
 *     empty document, which reads as "this block has no content".
 *  3. **The Write door** ({@link assertNoteCard}). `write_agent_note` replaces
 *     ONE card's contents, so it accepts one thing: a live `agent-note` card.
 *  4. **The acceptance predicate** ({@link assertNotesOnlyPlan}). Every block an
 *     apply creates, rewrites, moves or deletes must resolve inside an
 *     `agent-note` card — judged on the PLAN, before the first write.
 *
 * Every rule enumerates the family GENERICALLY, off the same `Editor.BlockData`
 * registry the markdown conversion already reads. No type name is written down
 * here (except `agent-note`, which rules 3 and 4 are ABOUT), so a fifth
 * annotation costs this file zero edits.
 *
 * ---------------------------------------------------------------------------
 * This REVERSES "addressing is the authorization" — deliberately
 * ---------------------------------------------------------------------------
 *
 * The previous shape restricted writes by what an agent could NAME: the write
 * tools took a card's id and nothing else, so no tool reached the page's prose
 * and no patch had to be validated. That bought safety by making the feature
 * impossible — an agent asked to annotate a line could not, because a line's id
 * was not a thing any tool accepted.
 *
 * `edit_page` takes any block id, up to and including the page's own, and is
 * judged by **what the diff touched** rather than by which id opened it. That is
 * a validation-based rule where the old one was structural, and it is still safe
 * for a reason the old one could not state: the judgement runs on the PLAN, which
 * sees a retyped survivor, a moved block and a deleted row as themselves —
 * where a walk over the incoming parsed forest saw only "a create". The two
 * invariants that used to live over the parsed forest (no minting a
 * human-audience card, no nesting notes) therefore moved onto the plan, where
 * they are strictly stronger.
 *
 * The residual bound is stated rather than hidden: an edit whose diff stays
 * inside a card may rewrite that card wholesale, including anything a HUMAN
 * typed into it. That was already true of `write_agent_note` and is what an
 * agent-note card is for.
 */

/**
 * Block types whose handle declares `audience: "human"`.
 *
 * Read at CALL time, never memoized — the same rule `blockTextProtectedSpans()`
 * and `serverMarkdownContext()` state for the same reason: a snapshot taken
 * before `collectContributions` silently degrades to the EMPTY set, and here the
 * empty set means "redact nothing", i.e. leak. There is no cheap way to notice
 * that, and the leak is in the direction that cannot be undone.
 *
 * It now gates the WRITE path too (rule 1 above, and the minting invariant in
 * {@link assertNotesOnlyPlan}), so the same snapshot would silently degrade to
 * "an agent may mint a private card" as well.
 */
function humanAudienceTypes(): Set<string> {
  return new Set(
    Editor.BlockData.getContributions()
      .filter((h) => h.audience === "human")
      .map((h) => h.type),
  );
}

/**
 * The `redact` row filter: drop every row whose type is addressed to humans only.
 *
 * Dropping a row drops its whole subtree for free — the engine's walk simply
 * never reaches a child whose parent is gone — which is why this is a flat
 * filter and not a recursive prune.
 *
 * **Generic in the row type on purpose.** `ReadBlockOptions.redact` and
 * `ApplyBlockOptions.redact` want slightly different row types, and ONE function
 * has to satisfy both: a read and the apply that answers it must prune
 * identically, or the apply is a diff against a document nobody ever saw. A
 * second, differently-typed copy is exactly the drift the shared option shape
 * exists to prevent.
 */
export function redactHumanAudience<R extends { type: string }>(rows: R[]): R[] {
  const human = humanAudienceTypes();
  return rows.filter((r) => !human.has(r.type));
}

/**
 * `blockId` and every ancestor of it up to (but not including) the page row,
 * nearest first.
 *
 * A chain that cannot be resolved is a **refusal**, not a shortened walk: an
 * unresolvable parent means we cannot prove the block is outside a private card,
 * and the fail-safe answer to "I don't know whose subtree this is" is no.
 */
function chainToPageRoot(scope: BlockScope, blockId: string): StoredBlock[] {
  // A page's own row is not in its content partition, so a whole-page scope has
  // no chain to walk — and no ancestor inside this page to cross.
  if (blockId === scope.pageId) return [];

  const byId = new Map(scope.rows.map((r) => [r.id, r] as const));
  const chain: StoredBlock[] = [];
  let current = byId.get(blockId);
  if (!current) {
    // `loadBlockScope` already asserted membership; reaching here means the rows
    // changed underneath us or the assert regressed.
    throw new HttpError(404, `block ${blockId} is not part of page ${scope.pageId}`);
  }
  for (;;) {
    chain.push(current);
    const parentId: string | null = current.parentId;
    if (parentId === null || parentId === scope.pageId) return chain;
    const parent = byId.get(parentId);
    if (!parent) {
      throw new HttpError(
        409,
        `block ${blockId} cannot be addressed: its ancestor chain leaves page ` +
          `${scope.pageId} at ${current.id} (parent ${parentId} is not a live row ` +
          `of this page), so whether it sits inside a private card is unprovable.`,
      );
    }
    // A forest cannot hold a cycle, so this bound is corruption-only — and a
    // corrupted chain must terminate loudly rather than spin.
    if (chain.length > scope.rows.length) {
      throw new HttpError(
        409,
        `block ${blockId} cannot be addressed: its ancestor chain on page ` +
          `${scope.pageId} does not terminate.`,
      );
    }
    current = parent;
  }
}

/**
 * Rule 2. Refuse a block that IS, or sits INSIDE, a human-audience card — for
 * reads and for writes alike.
 *
 * The block itself counts: reading a `/private` card directly is the most
 * direct form of the bypass, and redaction would answer it with an empty
 * document rather than a refusal.
 */
export function assertAgentAddressable(scope: BlockScope, blockId: string): void {
  const human = humanAudienceTypes();
  for (const row of chainToPageRoot(scope, blockId)) {
    if (!human.has(row.type)) continue;
    const self = row.id === blockId;
    throw new HttpError(
      403,
      `block ${blockId} is ${self ? "" : "inside "}a "${row.type}" card, whose ` +
        `contents are withheld from agents.${self ? "" : ` (Blocked at ${row.id}.)`}`,
    );
  }
}

/**
 * Rule 3 — `write_agent_note`'s door: the id must name a live `agent-note` card
 * the agent may address.
 *
 * Ordering is deliberate: the TYPE check first, because "this is not a card" is
 * the more informative answer for an id that was never writable this way, and it
 * is the one an agent reaching for the file-tool `Write` habit will hit.
 *
 * It deliberately does NOT scan the card's subtree for human-audience content
 * any more. That refusal existed because a write diffed against the FULL stored
 * forest while the read was redacted, so a private card dragged into a notes card
 * would arrive as a deletion. The write now redacts through the SAME filter as
 * the read (rule 1), so such a card is invisible to the walk AND preserved by it
 * — the engine keeps its `(parent_id, rank)` key reserved. There is nothing left
 * to refuse.
 */
export function assertNoteCard(scope: BlockScope, blockId: string): void {
  const row = scope.rows.find((r) => r.id === blockId);
  if (!row || row.type !== agentNotesBlock.type) {
    const what =
      blockId === scope.pageId
        ? `page ${blockId} is the page itself, not`
        : row
          ? `block ${blockId} (type "${row.type}") is not`
          : `block ${blockId} is not`;
    throw new HttpError(
      403,
      `${what} an "${agentNotesBlock.type}" card. write_agent_note replaces the ` +
        `contents of ONE card, whose id you copy off the <${agentNotesBlock.type} ` +
        `id="…"> tag read_page emits. To write anywhere else, use edit_page: it ` +
        `takes any block id, and a tagless <${agentNotesBlock.type}>…` +
        `</${agentNotesBlock.type}> in the document mints a new card there.`,
    );
  }
  assertAgentAddressable(scope, blockId);
}

/**
 * The parent/type view of the forest a chain walk resolves against.
 *
 * This mirrors `markdown-apply/core/touched.ts`'s own post-plan maps, and does so
 * on purpose rather than by importing them: that module exports a VERDICT
 * (`boundaryViolations`) and deliberately keeps its walk private, because the
 * questions asked here are POLICY ones — *which* card is a write attributed to,
 * and may a card be minted where it landed — not "did this plan stay inside a
 * boundary". Both questions need the same after-forest, and both are answered
 * against the same maps the verdict was computed from, so the card an edit is
 * stamped onto is always the card that legalized it.
 */
interface AfterForest {
  parentOf: Map<string, string | null>;
  typeOf: Map<string, string>;
}

/**
 * The forest as it stands AFTER the plan: the stored rows, overlaid by
 * everything the patch writes to a row's identity or position — the creates
 * (which carry both) and the `parentId` / `type` an update names.
 *
 * Deleted rows keep their pre-plan entries, for `touched.ts`'s reason: a deleted
 * row is only ever walked to find which card it was deleted OUT of, and leaving
 * it means a surviving child of a deleted parent still resolves a chain rather
 * than ending at an absent id.
 */
function forestAfter(rows: readonly StoredBlock[], plan: MarkdownApplyPlan): AfterForest {
  const parentOf = new Map<string, string | null>();
  const typeOf = new Map<string, string>();
  for (const row of rows) {
    parentOf.set(row.id, row.parentId);
    typeOf.set(row.id, row.type);
  }
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
 * The nearest `agent-note` card at or above `startId`, or `null` if the chain
 * reaches the top without crossing one.
 *
 * The bound is corruption-only and throws, exactly as `chainToPageRoot` and
 * `boundaryViolations` do: "I could not resolve this chain" must never be
 * reachable as a quiet `null`, which here would silently mean "attribute this
 * write to nobody".
 */
function nearestCard(startId: string, forest: AfterForest, bound: number): string | null {
  let current: string | undefined = startId;
  for (let steps = 0; current !== undefined; steps++) {
    if (steps > bound) {
      throw new HttpError(
        409,
        `the ancestor chain of block ${startId} does not terminate (walked past ` +
          `${bound} rows). The page's block forest is corrupt.`,
      );
    }
    if (forest.typeOf.get(current) === agentNotesBlock.type) return current;
    current = forest.parentOf.get(current) ?? undefined;
  }
  return null;
}

/** How the refusal names what a plan did to a block. */
const VERB: Record<BoundaryViolation["how"], string> = {
  created: "created",
  updated: "rewritten or moved",
  deleted: "deleted",
  "text-edited": "edited",
};

/** The refusal a boundary violation becomes — the agent's documentation here. */
function violationMessage(
  violation: BoundaryViolation,
  rootId: string,
  total: number,
): string {
  const tag = agentNotesBlock.type;
  const also =
    total > 1
      ? ` (${total - 1} other write${total > 2 ? "s" : ""} in this edit landed ` +
        `outside a card too.)`
      : "";
  if (violation.reason === "escaped-origin") {
    return (
      `block ${violation.blockId} was ${VERB[violation.how]}, but it did not COME ` +
      `from inside an "${tag}" card — this edit pulls a block of the page's own ` +
      `prose into one. Moving or re-indenting the page's blocks into your card is ` +
      `not an annotation: leave them exactly where they are, and write what you ` +
      `have to say in a new tagless <${tag}>…</${tag}> card beside them.` +
      also
    );
  }
  return (
    `block ${violation.blockId} was ${VERB[violation.how]} outside every "${tag}" ` +
    `card. An edit may only create, rewrite, move or delete blocks that sit inside ` +
    `an <${tag}> card — the page's own prose is read-only to an agent. Re-read ` +
    `${rootId}, change only text between an <${tag} id="…"> tag and its close, and ` +
    `add anything new inside a tagless <${tag}>…</${tag}> card.` +
    also
  );
}

/**
 * Rule 4 — the acceptance predicate, as `ApplyBlockOptions.assertAcceptable`
 * wants it: throw to refuse the whole apply, having written nothing.
 *
 * Three judgements, in this order:
 *
 *  1. **Nothing may MINT a human-audience card.** Rules 1-3 all reason about rows
 *     that already exist; none of them can see a card the agent is about to
 *     create. Without this an agent could write `<private-note>…</private-note>`
 *     into its own card and thereby author, in the one container the human trusts
 *     as agent-written, content whose whole meaning is "the human is the sole
 *     author of this".
 *  2. **Notes do not nest.** A card inside a card is a shape nothing else in this
 *     system produces or renders meaningfully.
 *  3. **Every write resolves inside a card** — `boundaryViolations`, with the one
 *     row predicate this plugin owns.
 *
 * 1 and 2 run FIRST, and over the PLAN rather than over the parsed forest they
 * used to walk. Both changes matter. Over the plan they also catch a RETYPED
 * SURVIVOR — a block turned INTO a private card by an update — which a walk over
 * the incoming forest sees only as an ordinary node it cannot distinguish from a
 * create. And first, because "you may not mint that type here" is the more
 * actionable answer than "that block landed outside a card": the type judgement
 * holds wherever the block landed.
 *
 * Returns **the cards to stamp with authorship** — the same walk, one answer.
 * A single edit may create and revise several cards, and each of them is now
 * partly this conversation's work.
 */
export function assertNotesOnlyPlan(args: {
  plan: MarkdownApplyPlan;
  /**
   * The whole, UNREDACTED partition the plan was built over — i.e. exactly what
   * `assertAcceptable` is handed, not the rows some earlier `loadBlockScope`
   * returned. A chain walk needs ancestors the document never showed, and it must
   * walk the forest the plan diffed rather than a second read of it.
   */
  rows: readonly StoredBlock[];
  /** The plan's scope root — the ceiling `boundaryViolations` stops its walks at. */
  rootId: string;
}): string[] {
  const { plan, rows, rootId } = args;
  const tag = agentNotesBlock.type;
  const human = humanAudienceTypes();
  const forest = forestAfter(rows, plan);
  // Every row that can be on a chain: the partition plus everything this plan
  // mints. A legitimate chain is shorter than that by construction.
  const bound = rows.length + plan.patch.creates.length;

  // --- 1. Minting or retyping into a human-audience type -------------------
  const minted: { id: string; type: string; retyped: boolean }[] = [
    ...plan.patch.creates.map((b) => ({ id: b.id, type: b.type, retyped: false })),
    ...plan.patch.updates
      .filter((u) => namesField(u.changes, "type"))
      .map((u) => ({ id: u.id, type: u.changes.type!, retyped: true })),
  ];
  for (const node of minted) {
    if (!human.has(node.type)) continue;
    throw new HttpError(
      403,
      `the document ${node.retyped ? `turns block ${node.id} into` : "creates"} a ` +
        `"${node.type}" card, which is addressed to the page's author only. An ` +
        `agent may not mint content the human is meant to be the sole author of — ` +
        `drop that tag and write what you have to say inside an <${tag}>…</${tag}> ` +
        `card instead.`,
    );
  }

  // --- 2. Notes do not nest -------------------------------------------------
  for (const node of minted) {
    if (node.type !== tag) continue;
    // From the PARENT, so the card does not find itself. An `agent-note` above it
    // is a nesting, wherever in the chain it sits: putting a card under a
    // paragraph that lives in a card nests it just as surely as putting it under
    // the card directly.
    const parent = forest.parentOf.get(node.id) ?? null;
    const enclosing = parent === null ? null : nearestCard(parent, forest, bound);
    if (enclosing === null) continue;
    throw new HttpError(
      409,
      `the document ${node.retyped ? `turns block ${node.id} into` : "creates"} an ` +
        `"${tag}" card inside "${tag}" card ${enclosing}, and notes cards do not ` +
        `nest. Write the note's CONTENTS there (paragraphs, lists, headings) ` +
        `rather than another card, or place the new card beside ${enclosing} ` +
        `instead of inside it.`,
    );
  }

  // --- 3. Every write inside a card ----------------------------------------
  const violations = boundaryViolations({
    plan,
    existing: rows,
    rootId,
    // The one row predicate this plugin owns. The engine never learns what the
    // answer MEANS — it takes a boolean per row, exactly as `redact` takes rows
    // and returns rows.
    isBoundary: (row) => row.type === tag,
  });
  // The FIRST one only. A page-rooted edit against a garbled document produces
  // one violation per block on the page, and three hundred lines of the same
  // sentence is not more informative than one — the fix for the first is the fix
  // for all of them. The count rides along in the message.
  const first = violations[0];
  if (first) throw new HttpError(403, violationMessage(first, rootId, violations.length));

  // --- The cards this write is attributed to --------------------------------
  // Every channel, mapped to the card it resolved inside. A rank-only update to
  // a prose row — the ordinary consequence of minting a card beside it — maps to
  // no card and drops out here rather than being filtered by a second copy of
  // `touched.ts`'s field rule.
  const touched = touchedBlocks(plan);
  const deleted = new Set(plan.patch.deleteIds);
  const cards = new Set<string>();
  for (const id of [
    ...touched.created,
    ...touched.updated,
    ...touched.deleted,
    ...touched.textEdited,
  ]) {
    const card = nearestCard(id, forest, bound);
    // A card this plan DELETED cannot be stamped: `page_blocks_agent_authors`
    // FKs onto the row, which is about to stop existing.
    if (card !== null && !deleted.has(card)) cards.add(card);
  }
  return [...cards];
}
