import { z } from "zod";
import { MdPendingActions } from "react-icons/md";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";

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
 * `defineAnnotationBlock` is `defineContainerBlock` plus a REQUIRED `audience`,
 * so this card cannot exist without saying who it is for. The container half
 * forces `anchor: true` and `wrapOnConvert: true` — see
 * `@plugins/page/plugins/container/core` for why the two are only correct
 * together. It declares no `collapsible`: a container folds to its BORROWED line
 * (its first child's), so its stored `expanded` is live.
 */
export const todoBlock = defineAnnotationBlock({
  type: "todo",
  schema: todoDataSchema,
  label: "TODO",
  icon: MdPendingActions,
  // Work an agent still has to do — a card whose entire purpose is to be READ by
  // one. Same direction as `/context`; only the tense differs (standing
  // instructions vs outstanding work).
  audience: "agent",
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
  typingPrefixes: ["TODO ", "TODO: "],
  // `<todo>…</todo>` — a real round-tripping syntax, replacing the one-way
  // `**[TODO]**` marker. The marker was honest about what it could do (a void
  // type derives no `parseLine`, so emitting the `TODO ` trigger would have read
  // as re-convertible and was not); a tag can carry the children, so the card
  // survives a markdown round trip instead of dissolving into its contents.
  //
  // `TODO ` is markdown's business nowhere: it lives on `typingPrefixes`, which
  // the clipboard pipeline never reads, so a `TODO ` line in pasted prose stays
  // prose.
  //
  // `annotated` reserves two attributes whose values come from OUTSIDE this
  // block's `data` — the task an agent was dispatched onto and that task's
  // status, which live in `page_blocks_ext_todo_task` and `tasks_v` respectively
  // (see the `task-link` sub-plugin). They are not in `data` and must not be:
  // the block's row would then be a second, drifting copy of somebody else's
  // record, and this card's payload is `z.object({})` on purpose. What they buy
  // is that an agent reading the page can tell a TODO somebody is already on
  // from one nobody has touched.
  //
  // They are READ-ONLY, and the parser discards them (see `BlockTag.annotated`):
  // a pure parser can neither tell an edited value from the one it emitted nor
  // write the table that owns it. `read_page`'s own description says so; a TODO
  // is completed through the task, not by editing the document.
  //
  // `identified` carries the card's own ROW id as the reserved `id` attribute,
  // the same way `<agent-note>` does. Two things need it, and the second is why
  // it is not optional:
  //
  //  - **An agent can address the card.** `task_id` says which task is on this
  //    work; `id` says which card that is. A dispatched agent is handed its
  //    card's id in its prompt, and without this attribute it cannot match that
  //    id against anything in the document it reads back.
  //  - **The card keeps its row through an apply.** An identified tag is a PIN
  //    in `markdown-apply`'s planner (`markdownTagIsIdentified` derives the set
  //    from the handles, so this declaration is the whole change): identity is
  //    ASSERTED by the id rather than inferred from content. A void card's
  //    content key is `type ␀ {}` — byte-identical for every TODO on the page —
  //    so without a pin two cards are indistinguishable to the aligner, and an
  //    edit near them can hand one card's row (and with it its task link) to the
  //    other. That is exactly the ambiguity the pin pass exists to close for
  //    `<agent-note>`, and a TODO now has strictly more to lose by it.
  markdown: {
    tag: { body: "children", identified: true, annotated: ["task_id", "status"] },
  },
});
