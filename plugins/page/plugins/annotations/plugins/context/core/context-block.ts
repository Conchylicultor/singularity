import { z } from "zod";
import { MdRule } from "react-icons/md";
import { defineContainerBlock } from "@plugins/page/plugins/container/core";

/**
 * A context card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields (the card has one fixed look, so there is nothing per-instance to
 * store); `divider` is the precedent for an empty payload. The write boundary
 * parses through `handle.schema.strict()`, so a stray `text` key is REJECTED
 * with a 400 rather than quietly stored — which is what makes the void model
 * enforced instead of aspirational, and what stops the previous
 * text-bearing-card rows from being written back.
 */
export const contextDataSchema = z.object({});

/**
 * `defineContainerBlock` forces `anchor: true` and `wrapOnConvert: true` — the
 * two facts that are only correct together. The
 * consequences, all of which the previous text-bearing model got wrong:
 *
 * - the card renders no line, so its FIRST VISIBLE LINE can be a heading (or a
 *   to-do, an image, a code block) — converting a child can never touch the
 *   container;
 * - Enter in a child is a plain sibling split inside the box, never a second
 *   context card;
 * - `/context` on an existing block WRAPS it, keeping the origin's id (and with
 *   it the caret, its content `Y.Doc` and its undo history).
 *
 * The card still FOLDS, and needed no header row to do it: a container collapses
 * to its BORROWED line (its first child's — the one the anchor already borrows
 * to seat its glyph), so the chevron rides on that line's row. Which is why this
 * declares no `collapsible`: its stored `expanded` is live.
 */
export const contextBlock = defineContainerBlock({
  type: "context",
  schema: contextDataSchema,
  label: "Context",
  icon: MdRule,
  // NOT "agent" / "agents" / "ai": those belong to the sibling `/agent` block
  // (notes an agent wrote back). This card is what a human tells an agent, so its
  // aliases are the instruction words — otherwise `/agent` would surface two
  // opposite-direction cards with no way to tell which is which.
  aliases: ["instructions", "guidance", "conventions", "rules"],
  empty: () => ({}),
  // `<context>…</context>` — a real round-tripping syntax, replacing the one-way
  // `**[Agent context]**` marker. The point of the marker survives (an agent
  // reading a page's markdown can still tell these lines are addressed to it,
  // and the children's indentation is anchored rather than dangling) and the
  // card now comes BACK as a card instead of dissolving into its contents.
  // Still no prefix claim: a tag is explicit, so it can never convert real prose
  // on paste the way a `parseLine` prefix would.
  markdown: { tag: { body: "children" } },
});
