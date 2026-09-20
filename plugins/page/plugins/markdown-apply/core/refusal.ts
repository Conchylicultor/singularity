import { plainOf, runsOfNode } from "@plugins/page/plugins/editor/core";
import type { MarkdownApplyPlan } from "./plan";
import type { StoredRow } from "./stored-row";

/**
 * The message a refused round trip carries, and nothing else.
 *
 * It lives in `core/` rather than beside its one caller
 * (`server/internal/apply.ts`, the `if` over the identity plan's
 * `creates.length`) because it is a pure function of (root, page, rows, plan) —
 * no db, no endpoint, nothing the server graph provides — and `apply.ts` cannot
 * be imported by a test without pulling that whole graph in at module eval. The
 * wording is the part that was wrong once and can be wrong again, so it is the
 * part that has to be pinnable: `refusal.test.ts` drives every arm.
 *
 * Its rows come in as {@link StoredRow}, the same structural declaration the
 * planner reads (see `stored-row.ts` for why that is a local declaration and not
 * a `page/editor` server import), so the server-side caller passes its
 * `StoredBlock[]` straight in and tsc proves the two agree at that call site.
 */

/** How much of a row's stored text a refusal quotes. */
const PREVIEW_CHARS = 60;

/**
 * How many rows a refusal names before it stops listing them, per list.
 *
 * The rewritten-rows list is a superset of the one row that is actually lossy
 * (see {@link roundTripCreatesRefusal}), and on a long page it can be most of the
 * document. A message an agent has to relay whole is worth keeping readable, and
 * a handful of ids with their text is already enough to find the block in the
 * page, which is all the list is for.
 */
const PREVIEW_ROWS = 5;

/**
 * One row's stored text, shortened to something a human can search the page for.
 *
 * A newline comes out as the two characters `\n` rather than as a break. That is
 * not prettifying: a stored soft line break is the loss this refusal was written
 * for, so showing it where it sits is most of the message's value — and a
 * refusal that spilled onto lines of its own would be harder to read, not
 * easier.
 */
function textPreview(row: StoredRow): string {
  const text = plainOf(runsOfNode(row)).replace(/\n/g, "\\n");
  return text.length > PREVIEW_CHARS
    ? `${text.slice(0, PREVIEW_CHARS)}…`
    : text;
}

/**
 * A list of row ids, each with the start of its stored text, capped at
 * {@link PREVIEW_ROWS} with a count of what was left out.
 *
 * Shared by BOTH lists a refusal names — the rows it would drop and the rows it
 * would rewrite — so the sharp evidence and the superset cannot come out
 * formatted two different ways, and a reader comparing them is comparing rows
 * rather than spellings.
 */
function namedRows(
  ids: readonly string[],
  rowById: ReadonlyMap<string, StoredRow>,
): string {
  const named = ids
    .slice(0, PREVIEW_ROWS)
    .map((id) => {
      const row = rowById.get(id);
      // Both lists name rows of this very partition — `deleteIds` and the text
      // edits alike derive from the planner's walk output (`plan.ts:827`)
      // — so the bare-id arm is unreachable. A message being built to explain a
      // refusal is still the wrong place to crash over it.
      return row === undefined ? id : `${id} ("${textPreview(row)}")`;
    })
    .join(", ");
  return ids.length > PREVIEW_ROWS
    ? `${named}, and ${ids.length - PREVIEW_ROWS} more`
    : named;
}

/**
 * What the round trip would put in the dropped rows' place, as a count per block
 * type (`2 numbered-list blocks`).
 *
 * **A count, and deliberately never a pairing.** Every planning pass mints a
 * fresh `crypto.randomUUID()` for each create (`plan.ts:721`), so there is
 * no id tying a created block back to the row it displaced — and position is no
 * evidence either, since the loss under investigation is precisely a node count
 * that changed. "This row became that block" would be a guess, and a wrong one
 * sends the reader to the wrong projection. The same reasoning that stops the
 * apply subtracting the phantom creates (`server/internal/apply.ts`'s guard, and
 * `subtract-noise.ts`'s header) stops the message pairing them.
 */
function createdTypeCounts(creates: readonly { type: string }[]): string {
  const byType = new Map<string, number>();
  for (const block of creates) {
    byType.set(block.type, (byType.get(block.type) ?? 0) + 1);
  }
  return [...byType]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${count} ${type} block${count === 1 ? "" : "s"}`)
    .join(", ");
}

/**
 * The refusal for a baseline document that plans CREATES — the read having
 * invented blocks the page does not hold.
 *
 * Worded for the party that reads it. The engine is audience-agnostic and names
 * no tool, but the only caller that passes a baseline is an agent-facing one, so
 * this follows `agent-access`'s refusal idiom: name the ids, state the rule in
 * one clause, say what to do next. It gives the scope and its page, how many
 * blocks the untouched document would create, and then its evidence, in two
 * lists ordered SHARPEST FIRST, each row with a short preview of its stored text
 * so a human can find it in the page.
 *
 * **1. The rows the identity plan would DELETE.** A row the round trip drops
 * outright is the sharpest evidence there is: not a block that would come back
 * spelled differently, a block that would stop existing — and what replaces it
 * is right there in the same plan's creates. So it is named first, ahead of the
 * superset. It is also the ONLY evidence for a whole class of loss: a line the
 * projection emits bare and the parse claims back as another type (a paragraph
 * whose text begins `3. `, re-read as a numbered list — see
 * `research/2026-09-20-page-markdown-line-claim-escape.md`) plans a delete and a
 * create and NO text edit at all, so a refusal built only from the rewrites
 * named nothing whatsoever and sent its reader looking at the shape of the
 * document.
 *
 * **2. The rows whose stored text it would REWRITE** — deliberately a SUPERSET
 * containing the lossy row, not the lossy row itself. A block that fans out into
 * several document lines is rewritten down to one of them, so it is always in
 * here — but so is every row the round trip merely re-canonicalizes, and telling
 * those apart would mean guessing which text edit "looks like" a truncation.
 * Naming a few rows too many costs a reader one glance; naming the wrong one
 * sends them to the wrong block.
 *
 * Either list may be empty, so the middle of the message has three arms that
 * each have to read on their own: dropped rows only (the line-claim class),
 * rewritten rows only (the fan-out class), or both.
 */
export function roundTripCreatesRefusal(args: {
  rootId: string;
  pageId: string;
  rows: readonly StoredRow[];
  identity: MarkdownApplyPlan;
}): string {
  const { rootId, pageId, rows, identity } = args;
  const created = identity.patch.creates.length;
  const rowById = new Map(rows.map((r) => [r.id, r] as const));
  const deleteIds = identity.patch.deleteIds;
  const editIds = identity.textEdits.map((edit) => edit.blockId);
  const replacements = createdTypeCounts(identity.patch.creates);
  // Sharpest first: the rows that would stop existing, and what the same plan
  // would create instead of them. "Instead", never "in its place": the counts
  // need not match and nothing pairs a create to a row (see
  // {@link createdTypeCounts}), so the two facts are stated side by side rather
  // than as one substitution.
  const dropped =
    deleteIds.length === 0
      ? ""
      : deleteIds.length === 1
        ? `The round trip would drop stored row ${namedRows(deleteIds, rowById)} ` +
          `outright and create ${replacements} instead, so that row is where ` +
          `the loss is.`
        : `The round trip would drop ${deleteIds.length} stored rows outright ` +
          `and create ${replacements} instead, so the loss is in those rows: ` +
          `${namedRows(deleteIds, rowById)}.`;
  const rewritten =
    editIds.length === 0
      ? deleteIds.length === 0
        ? `No stored row's text would be rewritten, so the loss is in the shape the ` +
          `read emitted rather than in one block's text.`
        : ""
      : deleteIds.length > 0
        ? `It would also rewrite the stored text of ` +
          `${namedRows(editIds, rowById)} — a wider net than the dropped rows, ` +
          `since every row the round trip merely re-canonicalizes is in it too.`
        : editIds.length === 1
          ? `The row whose stored text the round trip would rewrite is ` +
            `${namedRows(editIds, rowById)}.`
          : `The rows whose stored text the round trip would rewrite are ` +
            `${namedRows(editIds, rowById)}; the block that fans out into ` +
            `several lines is one of them.`;
  const candidates = [dropped, rewritten].filter((s) => s !== "").join(" ");
  return (
    `markdown apply: block ${rootId} on page ${pageId} cannot be edited right ` +
    `now. Reading it out and applying it back completely unchanged would itself ` +
    `create ${created} block${created === 1 ? "" : "s"}, so there is no way to ` +
    `tell this edit apart from the round trip's own damage. ${candidates} This ` +
    `is a bug in the page's markdown projection, not in the edit — report it ` +
    `rather than working around it.`
  );
}
