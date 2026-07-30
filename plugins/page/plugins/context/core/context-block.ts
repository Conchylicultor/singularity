import { z } from "zod";
import { MdAutoAwesome } from "react-icons/md";
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
 * `defineContainerBlock` forces `anchor: true`, `collapsible: "never"` and
 * `wrapOnConvert: true` — the three facts that are only correct together. The
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
 * Collapsibility is deliberately gone with the header row: an anchor has no
 * chevron to hang it on (`collapsible: "never"` is what keeps a stored
 * `expanded: false` from hiding the children behind nothing). Folding a context
 * card away is filed as its own task.
 */
export const contextBlock = defineContainerBlock({
  type: "context",
  schema: contextDataSchema,
  label: "Context",
  icon: MdAutoAwesome,
  aliases: ["agent", "agents", "instructions", "ai", "guidance"],
  empty: () => ({}),
  // One-way markdown: `text/plain` is the EXTERNAL projection only (internal
  // copy/paste is lossless through the `BLOCKS_MIME` JSON forest). A void
  // container has no text to serialize, so this emits the MARKER ALONE and the
  // children — serialized generically, indented two spaces under it by the
  // central walk — carry the content. That is deliberately not the callout's
  // blank line: the whole point of a context card is that an agent reading a
  // page's markdown can tell these lines are addressed to it, and with the
  // marker present the children's indentation is meaningful rather than
  // dangling. No `parseLine`: claiming a prefix would convert real prose on
  // paste.
  markdown: { serialize: () => "**[Agent context]**" },
});
