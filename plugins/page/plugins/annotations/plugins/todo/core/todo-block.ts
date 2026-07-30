import { z } from "zod";
import { MdPendingActions } from "react-icons/md";
import { defineContainerBlock } from "@plugins/page/plugins/container/core";

/**
 * A TODO card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields. In particular NO `done` flag: this card is a *region* of work for an
 * agent, not a checkable item, and the checkable item already exists as
 * `page/to-do` — which is a text block with `toggle: { field: "checked" }`, and
 * is what belongs INSIDE this box. The write boundary parses through
 * `handle.schema.strict()`, so a stray key is a 400.
 */
export const todoDataSchema = z.object({});

/**
 * `defineContainerBlock` forces `anchor: true`, `collapsible: "never"` and
 * `wrapOnConvert: true` — see `@plugins/page/plugins/container/core` for why the
 * three are only correct together.
 */
export const todoBlock = defineContainerBlock({
  type: "todo",
  schema: todoDataSchema,
  label: "TODO",
  icon: MdPendingActions,
  // NOT "task" / "checklist" / "checkbox": those are `page/to-do`'s, and the two
  // are genuinely different things (a region of work vs one checkable line).
  aliases: ["todo", "agent todo", "work", "backlog", "fixme"],
  empty: () => ({}),
  // Typing `TODO ` (or `TODO: `) at the start of a line WRAPS that line into a
  // TODO card, with the prefix stripped and the line as its first child — the
  // markdown-shortcut plugin resolves a `wrapOnConvert` target that way. This is
  // the one annotation with a typed trigger because it is the one people already
  // type: `TODO` in prose is a convention, not a word, so the conversion lands on
  // the intent rather than surprising a sentence. Longest-first matching in the
  // plugin means `TODO: ` wins over `TODO ` where both could apply.
  markdownPrefixes: ["TODO ", "TODO: "],
  // One-way markdown for the EXTERNAL `text/plain` projection (internal
  // copy/paste is lossless through the `BLOCKS_MIME` JSON forest). A void
  // container has no text, so this emits the MARKER ALONE and the children —
  // indented two spaces under it by the central walk — carry the content.
  // Deliberately NOT `TODO`, the same string the prefix claims: this projection
  // has no matching `parseLine` (a void type derives none), so emitting the
  // trigger would produce markdown that reads as re-convertible and is not.
  markdown: { serialize: () => "**[TODO]**" },
});
