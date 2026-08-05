import { HttpError } from "@plugins/infra/plugins/endpoints/server";
import { Editor, type StoredBlock } from "@plugins/page/plugins/editor/server";
import { parseMarkdownToForest, type SerializedBlock } from "@plugins/page/plugins/editor/core";
import { agentNotesBlock } from "@plugins/page/plugins/annotations/plugins/agent-notes/core";
import {
  serverMarkdownContext,
  type BlockScope,
} from "@plugins/page/plugins/markdown-apply/server";

/**
 * The four rules that make `page/markdown-apply`'s audience-agnostic engine safe
 * to hand an agent. The engine takes a root and a row filter; deciding WHICH
 * root and WHICH filter is this module, and it is the only place in the delivery
 * path that knows what an audience is.
 *
 *  1. **Redaction (read).** Rows whose type declares `audience: "human"` are
 *     filtered out before the walk, so the subtree goes with them.
 *  2. **Addressing is the authorization (write).** A write tool accepts only a
 *     block whose type is `agent-notes`. An agent cannot touch human prose
 *     because it cannot name it — there is no validation of the resulting patch
 *     to get wrong.
 *  3. **Ancestor refusal (read AND write).** A block INSIDE a human-audience
 *     card is refused outright. Without this the id itself is the bypass:
 *     redaction prunes the card, so naming a block under it would walk a forest
 *     the filter already emptied — an empty document, which reads as "this block
 *     has no content" and would be written back as a full delete.
 *  4. **No redacted content inside a write scope.** A write whose subtree
 *     contains a human-audience card is refused. This is what keeps redaction a
 *     READ-only concern: a private card cannot legitimately live inside an
 *     agent-notes card, so the write scope never holds one, so an apply never
 *     has to pin a stripped card back positionally. The one way it can happen —
 *     a user drags a private card into an agent-notes card — is a loud refusal
 *     rather than a silent destruction.
 *
 * Every rule enumerates the family GENERICALLY, off the same
 * `Editor.BlockData` registry the markdown conversion already reads. No type
 * name is written down here (except `agent-notes`, which rule 2 is ABOUT), so a
 * fifth annotation costs this file zero edits.
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
 * The `redact` row filter for a read: drop every row whose type is addressed to
 * humans only.
 *
 * Dropping a row drops its whole subtree for free — the engine's walk simply
 * never reaches a child whose parent is gone — which is why this is a flat
 * filter and not a recursive prune.
 */
export function redactHumanAudience(rows: StoredBlock[]): StoredBlock[] {
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
 * Rule 3. Refuse a block that IS, or sits INSIDE, a human-audience card — for
 * reads and for writes alike.
 *
 * The block itself counts: reading a `/private-notes` card directly is the most
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
 * Where a NEW agent-notes card may land: anywhere an agent may address (rule 3),
 * as long as nothing on the way up is already an agent-notes card.
 *
 * The "no nesting" rule is stated over the whole ancestor chain rather than over
 * the target alone. Appending under a paragraph that happens to live inside a
 * notes card would nest one card in another just as surely as appending under
 * the card itself, and a card inside a card is a shape nothing else in this
 * system produces or renders meaningfully.
 *
 * It deliberately does NOT scan the target's subtree for private cards, unlike
 * {@link assertWritableNote}: this tool only ever CREATES rows under the target,
 * so a private card sitting elsewhere in that subtree is neither read nor
 * touched. Rule 4 exists for diff-based writes, which this is not.
 */
export function assertAppendTarget(scope: BlockScope, blockId: string): void {
  assertAgentAddressable(scope, blockId);
  for (const row of chainToPageRoot(scope, blockId)) {
    if (row.type !== agentNotesBlock.type) continue;
    const self = row.id === blockId;
    throw new HttpError(
      409,
      `block ${blockId} is ${self ? "" : "inside "}an "${agentNotesBlock.type}" ` +
        `card (${row.id}), and notes cards do not nest. Write into that card with ` +
        `write_agent_notes or edit_agent_notes, or append to a block outside it.`,
    );
  }
}

/** Every live row in `rootId`'s subtree, `rootId` excluded. */
function subtreeRows(scope: BlockScope, rootId: string): StoredBlock[] {
  const byParent = new Map<string, StoredBlock[]>();
  for (const row of scope.rows) {
    if (row.parentId === null) continue;
    const siblings = byParent.get(row.parentId);
    if (siblings) siblings.push(row);
    else byParent.set(row.parentId, [row]);
  }
  const out: StoredBlock[] = [];
  const stack = [rootId];
  while (stack.length > 0) {
    for (const child of byParent.get(stack.pop()!) ?? []) {
      out.push(child);
      stack.push(child.id);
    }
  }
  return out;
}

/**
 * Rule 2 + rule 4, as one call, so a write tool cannot enforce half of them.
 *
 * Ordering is deliberate: the TYPE check first, because "you may not write here"
 * is the more informative answer for a block that was never writable, and the
 * subtree scan is only meaningful once we know the target is a card at all.
 */
export function assertWritableNote(scope: BlockScope, noteId: string): void {
  const row = scope.rows.find((r) => r.id === noteId);
  if (!row || row.type !== agentNotesBlock.type) {
    const what =
      noteId === scope.pageId
        ? `page ${noteId}`
        : row
          ? `block ${noteId} (type "${row.type}")`
          : `block ${noteId}`;
    throw new HttpError(
      403,
      `${what} is not an "${agentNotesBlock.type}" card. Agents may only write ` +
        `into agent-notes cards: create one with append_agent_notes and write to ` +
        `the id it returns. A page's own prose is not writable through any tool.`,
    );
  }

  assertAgentAddressable(scope, noteId);

  const human = humanAudienceTypes();
  for (const descendant of subtreeRows(scope, noteId)) {
    if (!human.has(descendant.type)) continue;
    throw new HttpError(
      409,
      `agent-notes card ${noteId} contains a "${descendant.type}" card ` +
        `(${descendant.id}), whose contents are withheld from agents — so a write ` +
        `here would diff against a document that does not show it and delete it. ` +
        `Move that card out of the notes card first.`,
    );
  }
}

/**
 * The audience rules restated over an INCOMING parsed forest.
 *
 * Rules 1-4 all reason about blocks that ALREADY EXIST — they answer "may this
 * agent address that row". None of them can see a block the agent is about to
 * mint, and every write tool takes markdown, which can name any block type by
 * tag. So without this an agent could write
 * `<private-notes>…</private-notes>` into its own card and thereby author, in
 * the one container the human trusts as agent-written, content whose whole
 * meaning is "the human is the sole author of this".
 *
 * It also compounds: rule 4 then refuses every LATER write to that card
 * (its subtree now holds a human-audience block), so the agent bricks the card
 * it was writing to.
 *
 * This is why {@link assertMarkdownWritable} exists and why every tool that
 * accepts markdown must call it — not just the one that creates rows.
 */
export function assertForestWritable(forest: readonly SerializedBlock[]): void {
  const human = humanAudienceTypes();
  const walk = (nodes: readonly SerializedBlock[]): void => {
    for (const node of nodes) {
      if (human.has(node.type)) {
        throw new HttpError(
          403,
          `the markdown creates a "${node.type}" card, which is addressed to the ` +
            `page's author only. An agent may not mint content the human is meant ` +
            `to be the sole author of.`,
        );
      }
      if (node.type === agentNotesBlock.type) {
        throw new HttpError(
          400,
          `the markdown creates a nested "${agentNotesBlock.type}" card. This tool ` +
            `already wraps what you pass in one — write the card's CONTENTS ` +
            `(paragraphs, lists, headings), not the card.`,
        );
      }
      walk(node.children);
    }
  };
  walk(forest);
}

/**
 * {@link assertForestWritable} over a markdown STRING — the form every tool that
 * takes markdown from an agent calls.
 *
 * The tools that merge (`write_agent_notes` / `edit_agent_notes`) hand their
 * string to `applyMarkdownToBlock`, which parses it again internally. Parsing
 * twice is the deliberate price of keeping the engine audience-agnostic: the
 * alternative is a validation hook threaded through the applier, which would put
 * the audience question inside the one module whose whole design is not to know
 * about it. It is the same trade `read_page` makes by loading the scope twice.
 *
 * Both parses use `serverMarkdownContext()`, so they cannot disagree about what
 * the document says.
 */
export function assertMarkdownWritable(markdown: string): void {
  assertForestWritable(parseMarkdownToForest(markdown, serverMarkdownContext()));
}
