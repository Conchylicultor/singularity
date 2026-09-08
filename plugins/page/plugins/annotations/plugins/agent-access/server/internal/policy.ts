import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { Editor, type StoredBlock } from "@plugins/page/plugins/editor/server";
import {
  markdownParseTagName,
  namesField,
} from "@plugins/page/plugins/editor/core";
import { agentNotesBlock } from "@plugins/page/plugins/annotations/plugins/agent-notes/core";
import {
  boundaryViolations,
  touchedBlocks,
  type BoundaryViolation,
  type MarkdownApplyPlan,
  type WriteBoundary,
} from "@plugins/page/plugins/markdown-apply/core";
import type { BlockScope } from "@plugins/page/plugins/markdown-apply/server";

/**
 * The rules that make `page/markdown-apply`'s audience-agnostic engine safe to
 * hand an agent. The engine takes a root, a row filter and a boundary predicate;
 * deciding WHICH root, WHICH filter and WHICH boundary is this module, and it is
 * the only place in the delivery path that knows what an audience is.
 *
 * The annotation family declares TWO facts about every card — who may RECEIVE it
 * (`audience`) and whose words it holds (`author`) — and each of them is one rule
 * here, with the door between them:
 *
 *  1. **`audience` — what an agent may SEE.** One predicate
 *     ({@link humanAudienceTypes}), enforced on two surfaces that must agree:
 *     - **Redaction, on BOTH halves.** Rows whose type declares `audience:
 *       "human"` are filtered out of the read's walk — and out of the WRITE's
 *       walk, through the same function ({@link redactHumanAudience}). Same
 *       filter, both directions, which is what makes "a private card is
 *       invisible but preserved" literally true: a write diffs against exactly
 *       the document the read produced, so a card the agent never saw can never
 *       be seen as a deletion.
 *     - **Ancestor refusal** ({@link assertAgentAddressable}). A block that IS,
 *       or sits INSIDE, a human-audience card is refused outright. Without this
 *       the id itself is the bypass: redaction prunes the card, so naming a block
 *       under it would walk a forest the filter already emptied — an empty
 *       document, which reads as "this block has no content".
 *  2. **The write door** ({@link assertNoteCard}). `write_agent_note` replaces
 *     ONE card's contents, so it accepts one thing: a live `agent-note` card.
 *  3. **`author` — what an agent may WRITE** ({@link assertNotesOnlyPlan}). Every
 *     block an apply creates, rewrites, moves or deletes must resolve inside a
 *     region an agent AUTHORS — judged on the PLAN, before the first write, by
 *     the walk described at {@link writeBoundaryOf}.
 *
 * Every rule enumerates the family GENERICALLY, off the same `Editor.BlockData`
 * registry the markdown conversion already reads. No type name is written down
 * here (except `agent-note`, which rule 2 is ABOUT and which rule 3 names only to
 * point an agent at where it MAY write), so a fifth annotation costs this file
 * zero edits.
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
 * where a walk over the incoming parsed forest saw only "a create". Two
 * invariants used to live over that forest — *nothing may mint a human-audience
 * card* and *notes do not nest* — and neither survives as a rule of its own. The
 * first moved onto the plan, where it was strictly stronger, and has since been
 * absorbed whole into rule 3's walk. The second is gone rather than moved: a
 * card inside a card is an ordinary shape. Both stories are told at
 * {@link assertNotesOnlyPlan}, and rule 3 is now the only judgement left there.
 *
 * ---------------------------------------------------------------------------
 * The residual bound this file used to state is CLOSED
 * ---------------------------------------------------------------------------
 *
 * It read: *an edit whose diff stays inside a card may rewrite that card
 * wholesale, including anything a HUMAN typed into it.* So there was no way to
 * answer an agent inside its own note — to correct a finding, to say "no, the
 * writer is in `encode.ts`" — and have the answer survive the next
 * `write_agent_note`.
 *
 * A `<human>` or `<todo>` card nested inside an `<agent-note>` now declares
 * `author: "human"` at its OWN row, and the walk stops at the nearest
 * declaration, so it is a hole in the agent's own card: the agent reads it and
 * cannot touch it. What is left of the bound is narrower and worth stating in its
 * own right — **plain text a human typed LOOSE in a notes card is still the
 * agent's to rewrite.** It declares nothing, so the nearest declaration above it
 * is the card's `author: "agent"`. The affordance, not the workaround, is to put
 * the answer in a `<human>` card.
 */

/**
 * Block types whose handle declares `audience: "human"`.
 *
 * Read at CALL time, never memoized — the same rule `blockTextProtectedSpans()`
 * and `serverMarkdownContext()` state for the same reason: a snapshot taken
 * before `collectContributions` silently degrades to the EMPTY set, and here the
 * empty set means "redact nothing", i.e. leak. There is no cheap way to notice
 * that, and the leak is in the direction that cannot be undone.
 */
function humanAudienceTypes(): Set<string> {
  return new Set(
    Editor.BlockData.getContributions()
      .filter((h) => h.audience === "human")
      .map((h) => h.type),
  );
}

/**
 * The row classifier `boundaryViolations` judges every write against: what does
 * a block of this type declare about writes inside it?
 *
 * One row of the family table is the whole of it. `author: "agent"` — the single
 * card an agent writes — is an OPEN boundary; `author: "human"` is a CLOSED one;
 * a type that declares neither (every paragraph, heading, list and quote on the
 * page) declares nothing, and the walk passes straight through it to whatever
 * sits above. There is no list of writable types anywhere, and no type name in
 * this function.
 *
 * The engine's walk stops at the nearest row that declares ANYTHING, so the three
 * answers compose: a `<human>` card nested inside an `<agent-note>` shields its
 * own contents, an `<agent-note>` a human nested inside a `<human>` card still
 * admits writes, and prose — which declares nothing all the way up — is refused
 * because nothing above it ever said yes.
 *
 * **Read at CALL time**, for {@link humanAudienceTypes}' reason, and it is worth
 * saying that the degradation direction INVERTS here and is still the fail-safe
 * one. A snapshot taken before `collectContributions` gives an empty registry:
 * for `audience` that means "redact nothing", i.e. a leak that cannot be undone;
 * here it means nothing is open, i.e. every write is refused. Both are read per
 * call, and no shared cache could serve both — they fail in opposite directions,
 * so a cache that is safe for one is unsafe for the other.
 */
function writeBoundaryOf(): (row: {
  id: string;
  type: string;
}) => WriteBoundary | undefined {
  const declared = new Map<string, WriteBoundary>();
  for (const handle of Editor.BlockData.getContributions()) {
    if (handle.author === "agent") declared.set(handle.type, "open");
    else if (handle.author === "human") declared.set(handle.type, "closed");
  }
  return (row) => declared.get(row.type);
}

/**
 * The markdown tag a type is SPELLED as, for a refusal that has to name a card.
 *
 * A type is not always its tag — `human-notes` stores `context` and tags
 * `<human>` — and a message an agent reads has to name the thing that is in the
 * document in front of it, not the column value behind it.
 * `markdownParseTagName` is the serializer's own resolution, shared for
 * `markdownTagIsIdentified`'s reason: a second copy would quietly name the wrong
 * thing the day a tag is renamed. A type that claims no parse tag falls back to
 * itself, which is the best name available.
 */
function tagNameOf(type: string): string {
  for (const handle of Editor.BlockData.getContributions())
    if (handle.type === type) return markdownParseTagName(handle) ?? type;
  return type;
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
export function redactHumanAudience<R extends { type: string }>(
  rows: R[],
): R[] {
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
    throw new HttpError(
      404,
      `block ${blockId} is not part of page ${scope.pageId}`,
    );
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
 * Rule 1, the ancestor half. Refuse a block that IS, or sits INSIDE, a
 * human-audience card — for reads and for writes alike.
 *
 * The block itself counts: reading a `/private` card directly is the most
 * direct form of the bypass, and redaction would answer it with an empty
 * document rather than a refusal.
 */
export function assertAgentAddressable(
  scope: BlockScope,
  blockId: string,
): void {
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
 * Rule 2 — `write_agent_note`'s door: the id must name a live `agent-note` card
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
 *
 * Nor does it scan for a human-AUTHORED card inside the target: a `<human>` card
 * nested in this one is visible to the agent and must stay, but that is rule 3's
 * job, on the plan, where "the document dropped it" and "the document echoed it
 * back" are distinguishable. A door check could only refuse the card outright,
 * which would make the nesting useless.
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
 * This mirrors `markdown-apply/core/touched.ts`'s own maps, and does so on
 * purpose rather than by importing them: that module exports a VERDICT
 * (`boundaryViolations`) and deliberately keeps its walk private, because the
 * questions asked here are POLICY ones — *which* card is a write attributed to,
 * and *which* card refused it — not "did this plan stay inside a boundary". All
 * of them need the same forests, and all of them are answered against the same
 * maps the verdict was computed from, so the card an edit is stamped onto is
 * always the card that legalized it, and the card a refusal names is always the
 * card that refused it.
 */
interface Forest {
  parentOf: Map<string, string | null>;
  typeOf: Map<string, string>;
}

/** The forest as it stands BEFORE the plan: the stored rows, unmodified. */
function forestOf(rows: readonly StoredBlock[]): Forest {
  const parentOf = new Map<string, string | null>();
  const typeOf = new Map<string, string>();
  for (const row of rows) {
    parentOf.set(row.id, row.parentId);
    typeOf.set(row.id, row.type);
  }
  return { parentOf, typeOf };
}

/**
 * The forest as it stands AFTER the plan: `before`, overlaid by everything the
 * patch writes to a row's identity or position — the creates (which carry both)
 * and the `parentId` / `type` an update names.
 *
 * Deleted rows keep their pre-plan entries, for `touched.ts`'s reason: a deleted
 * row is only ever walked to find which card it was deleted OUT of, and leaving
 * it means a surviving child of a deleted parent still resolves a chain rather
 * than ending at an absent id.
 */
function forestAfter(before: Forest, plan: MarkdownApplyPlan): Forest {
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
 * The nearest `agent-note` card at or above `startId`, or `null` if the chain
 * reaches the top without crossing one.
 *
 * Authorship only — this is who a legal write is ATTRIBUTED to, which is a
 * different question from whether it was legal, and it names the one type this
 * plugin owns rather than asking the generic classifier.
 *
 * The bound is corruption-only and throws, exactly as `chainToPageRoot` and
 * `boundaryViolations` do: "I could not resolve this chain" must never be
 * reachable as a quiet `null`, which here would silently mean "attribute this
 * write to nobody".
 */
function nearestCard(
  startId: string,
  forest: Forest,
  bound: number,
): string | null {
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

/**
 * The CLOSED card that refused a write, so the refusal can name it — or `null`
 * when the chain's nearest declaration was not a closed one.
 *
 * A faithful mirror of `nearestBoundary`'s walk (self-inclusive, stops at the
 * first row that declares anything, ceiling at `rootId`), run over the same maps
 * with the same classifier. That is what makes `null` unreachable for a violation
 * the engine already reported as `enclosed` — and it is deliberately a `null`
 * rather than a throw anyway, because this runs while a refusal is already being
 * worded: a correct refusal that names no card is strictly better than a second
 * error thrown over the first.
 */
function nearestClosed(
  startId: string,
  forest: Forest,
  rootId: string,
  boundaryOf: (row: { id: string; type: string }) => WriteBoundary | undefined,
  bound: number,
): { id: string; type: string } | null {
  let current: string | undefined = startId;
  for (let steps = 0; current !== undefined; steps++) {
    if (steps > bound) {
      throw new HttpError(
        409,
        `the ancestor chain of block ${startId} does not terminate (walked past ` +
          `${bound} rows). The page's block forest is corrupt.`,
      );
    }
    const type = forest.typeOf.get(current);
    if (type !== undefined) {
      const declared = boundaryOf({ id: current, type });
      if (declared !== undefined)
        return declared === "closed" ? { id: current, type } : null;
    }
    if (current === rootId) return null;
    current = forest.parentOf.get(current) ?? undefined;
  }
  return null;
}

/** How the refusal names what a plan did to a block, in the passive. */
const VERB: Record<BoundaryViolation["how"], string> = {
  created: "created",
  updated: "rewritten or moved",
  deleted: "deleted",
  "text-edited": "edited",
};

/** The same, in the active — for a sentence whose subject is the document. */
const DID: Record<BoundaryViolation["how"], string> = {
  created: "creates",
  updated: "rewrites or moves",
  deleted: "deletes",
  "text-edited": "edits",
};

/** Everything a refusal needs beyond the violation itself. */
interface RefusalContext {
  rootId: string;
  before: Forest;
  after: Forest;
  boundaryOf: (row: { id: string; type: string }) => WriteBoundary | undefined;
  bound: number;
  /** How many violations this plan produced; only the first is worded. */
  total: number;
}

/**
 * The refusal a boundary violation becomes — the agent's documentation here.
 *
 * Four answers, from the two facts the violation carries. `side` says WHICH
 * chain failed (`"new"` — where the write lands; `"old"` — where the block came
 * from) and `reason` says why (`"escaped"` — nothing on the chain declared
 * anything, so the write is in open document body; `"enclosed"` — the nearest
 * declaration was a CLOSED card).
 *
 * The enclosed arms can name the card, because the violation names a block and
 * the forests know its type. That precision is most of their value: "you may not
 * write in a `<human>` card" is a rule an agent can act on, where "that write was
 * refused" is one it can only retry.
 *
 * **A DELETE is worded as a delete on either side.** A delete has only an old
 * chain, so `side: "old"` says nothing about it that `how` does not already say —
 * and the old-side wording is about a block being CARRIED somewhere ("this edit
 * pulls prose into your card", "this edit carries it out"), which a delete does
 * not do. `touched.ts` used to hold that special case itself, reporting a
 * delete's old-chain failure under the un-suffixed reason; with `side` broken
 * out it lives here instead, where the wording lives, and the engine reports one
 * uniform fact.
 */
function violationMessage(
  violation: BoundaryViolation,
  ctx: RefusalContext,
): string {
  const tag = agentNotesBlock.type;
  const also =
    ctx.total > 1
      ? ` (${ctx.total - 1} other write${ctx.total > 2 ? "s" : ""} in this edit ` +
        `${ctx.total > 2 ? "were" : "was"} refused too; the fix for this one is ` +
        `the fix for them.)`
      : "";
  // The block survives this plan AND its old chain is the one that failed: it was
  // carried across a boundary rather than written where it stands.
  const carriedOut = violation.side === "old" && violation.how !== "deleted";

  if (violation.reason === "escaped") {
    if (carriedOut) {
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
      `${ctx.rootId}, change only text between an <${tag} id="…"> tag and its close, ` +
      `and add anything new inside a tagless <${tag}>…</${tag}> card.` +
      also
    );
  }

  // `enclosed`: the nearest declaration on the failed chain was a closed card.
  // Which forest holds that chain follows from which side failed.
  const forest = violation.side === "new" ? ctx.after : ctx.before;
  const closed = nearestClosed(
    violation.blockId,
    forest,
    ctx.rootId,
    ctx.boundaryOf,
    ctx.bound,
  );
  if (closed === null) {
    return (
      `block ${violation.blockId} was ${VERB[violation.how]} inside a card holding ` +
      `the page author's own words, which an agent may not write. Leave it exactly ` +
      `as you found it.` +
      also
    );
  }
  const name = tagNameOf(closed.type);

  if (closed.id === violation.blockId) {
    // The block IS the closed card. Three ways a plan can reach that, and they
    // are worth telling apart: an agent that MINTED one needs to hear that it may
    // not author the card at all, where one that moved an existing card needs to
    // hear that it may not touch the one that is already there.
    const wasType = ctx.before.typeOf.get(violation.blockId);
    const did =
      wasType === undefined
        ? `the document creates a <${name}> card`
        : wasType !== closed.type
          ? `the document turns block ${violation.blockId} into a <${name}> card`
          : `the document ${DID[violation.how]} the <${name}> card ${violation.blockId}`;
    return (
      `${did}. A <${name}> card holds the page AUTHOR's own words — an agent reads ` +
      `one and never writes one: it may not author a card on their behalf, and may ` +
      `not move, retype or delete the ones they wrote. Write what you have to say ` +
      `in your own <${tag}>…</${tag}> card instead; if you meant to file work ` +
      `rather than describe it, use add_task.` +
      also
    );
  }

  if (carriedOut) {
    return (
      `block ${violation.blockId} was ${VERB[violation.how]}, and it came from ` +
      `INSIDE <${name}> card ${closed.id} — this edit carries a block out of a card ` +
      `an agent may not touch. Leave that card and everything in it exactly where ` +
      `you found it, byte for byte.` +
      also
    );
  }
  return (
    `block ${violation.blockId} was ${VERB[violation.how]}, and it sits inside ` +
    `<${name}> card ${closed.id}. Those are the page author's words even inside ` +
    `your own <${tag}> card — that is what a nested <${name}> card is FOR — so read ` +
    `them and hand them back byte-identical. Put your reply beside that card, in ` +
    `the <${tag}> card that holds it.` +
    also
  );
}

/**
 * Rule 3 — the acceptance predicate, as `ApplyBlockOptions.assertAcceptable`
 * wants it: throw to refuse the whole apply, having written nothing.
 *
 * **One judgement, and that is the shape worth arguing for.** Every write must
 * resolve inside a region an agent authors — `boundaryViolations`, handed
 * {@link writeBoundaryOf}. The walk stops at the nearest row that declares an
 * `author` at all, so this ONE test says all three of: the page's prose is
 * read-only (nothing declares, all the way up); an `<agent-note>` card is
 * writable (the nearest declaration is the agent's); and a `<human>` or `<todo>`
 * card nested inside one is not (its own row declares the human first).
 *
 * Two other judgements used to stand in front of it, and each is gone for its
 * own reason. Neither was weakened away: one was absorbed, the other was wrong.
 *
 * ---------------------------------------------------------------------------
 * *Nothing may mint a human-audience card* — absorbed, not dropped
 * ---------------------------------------------------------------------------
 *
 * It was a separate walk over the plan's creates and retypes, with its own
 * message and its own way of being wrong. A created — or retyped-into —
 * `<human>`, `<todo>` or `<private-note>` declares `"closed"` at its OWN row,
 * and the boundary walk is self-inclusive, so the same test that refuses writing
 * INSIDE such a card refuses MINTING one, on the same evidence. Two invariants
 * became one walk, which is worth more than the bespoke message it cost: two
 * invariants can drift out of step with each other, and one cannot.
 *
 * ---------------------------------------------------------------------------
 * A card inside a card is allowed
 * ---------------------------------------------------------------------------
 *
 * *Notes do not nest* was inherited from the `append_agent_notes` tool this
 * design replaced, where a card id was the append TARGET and nesting was a
 * caller mistake with no meaning. Under a plan-judged `edit_page` it refused a
 * shape the rest of the system handles: the markdown tag scanner counts nested
 * opens of its own name, the editor imposes no child-type restriction, a human
 * can nest two cards by hand today, and `ContainerBackdrop` reserves a nesting
 * pad so an inner card starts below its parent's edge — its wash composing over
 * the outer one is the cue that it IS a separate card. Nesting is also the
 * arrangement the write rule above is BUILT on: a `<human>` card inside an
 * `<agent-note>` is how the page's author answers an agent inside the agent's
 * own note. The judgement reads a nested card as inside a boundary, because it
 * is one.
 *
 * What the removal costs, stated rather than discovered: `write_agent_note`'s
 * `content` is the card's CONTENTS, and an agent that wraps it in an
 * `<agent-note>` tag anyway now mints a card inside the card it was writing
 * instead of being refused. That tool's description says so, rather than
 * promising an error it no longer raises. And authorship attributes a write to
 * the NEAREST enclosing card ({@link nearestCard}), so an edit inside a nested
 * card stamps that card only — its parent is not marked as touched by this
 * conversation.
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
  const boundaryOf = writeBoundaryOf();
  const before = forestOf(rows);
  const after = forestAfter(before, plan);
  // Every row that can be on a chain: the partition plus everything this plan
  // mints. A legitimate chain is shorter than that by construction.
  const bound = rows.length + plan.patch.creates.length;

  // --- Every write inside a region an agent authors -------------------------
  // Over the PLAN, which is what lets a RETYPED SURVIVOR — a block turned INTO a
  // card by an update — be judged at all; a walk over the incoming parsed forest
  // sees it only as an ordinary node it cannot tell from a create.
  const violations = boundaryViolations({
    plan,
    existing: rows,
    rootId,
    // The one row classifier this plugin owns. The engine never learns what any
    // of the three answers MEANS — it takes one per row, exactly as `redact`
    // takes rows and returns rows.
    boundaryOf,
  });
  // The FIRST one only. A page-rooted edit against a garbled document produces
  // one violation per block on the page, and three hundred lines of the same
  // sentence is not more informative than one — the fix for the first is the fix
  // for all of them. The count rides along in the message.
  const first = violations[0];
  if (first) {
    throw new HttpError(
      403,
      violationMessage(first, {
        rootId,
        before,
        after,
        boundaryOf,
        bound,
        total: violations.length,
      }),
    );
  }

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
    const card = nearestCard(id, after, bound);
    // A card this plan DELETED cannot be stamped: `page_blocks_agent_authors`
    // FKs onto the row, which is about to stop existing.
    if (card !== null && !deleted.has(card)) cards.add(card);
  }
  return [...cards];
}
