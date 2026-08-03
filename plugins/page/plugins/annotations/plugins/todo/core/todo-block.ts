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
 * `defineContainerBlock` forces `anchor: true` and `wrapOnConvert: true` — see
 * `@plugins/page/plugins/container/core` for why the two are only correct
 * together. It declares no `collapsible`: a container folds to its BORROWED line
 * (its first child's), so its stored `expanded` is live.
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
  // `<todo>…</todo>` — a real round-tripping syntax, replacing the one-way
  // `**[TODO]**` marker. The marker was honest about what it could do (a void
  // type derives no `parseLine`, so emitting the `TODO ` trigger would have read
  // as re-convertible and was not); a tag can carry the children, so the card
  // survives a markdown round trip instead of dissolving into its contents.
  //
  // The `markdownPrefixes` above stay a TYPING-time trigger only: the tag pass
  // keys on the tag name, so a `TODO ` line in pasted prose still stays prose.
  markdown: { tag: { body: "children" } },
});
