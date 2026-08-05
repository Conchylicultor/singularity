import { z } from "zod";
import { MdAutoAwesome } from "react-icons/md";
import { defineAnnotationBlock } from "@plugins/page/plugins/annotations/core";

/**
 * An agent-notes card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields (one fixed look, so there is nothing per-instance to store). The write
 * boundary parses through `handle.schema.strict()`, so a stray key is a 400
 * rather than a quietly-stored field.
 *
 * Deliberately NOT a payload field: *which* agent / run wrote the card. That is
 * provenance — it has to survive edits, be queryable, and accumulate SEVERAL
 * authors — so it lives in the `authorship` sub-plugin's block-keyed link table.
 * A name in this block's `data` would be a single-valued, unjoinable copy of it.
 */
export const agentNotesDataSchema = z.object({});

/**
 * `defineAnnotationBlock` is `defineContainerBlock` plus a REQUIRED `audience`,
 * so this card cannot exist without saying who it is for. The container half
 * forces `anchor: true` and `wrapOnConvert: true` — see
 * `@plugins/page/plugins/container/core` for why the two are only correct
 * together. It declares no `collapsible`: a container folds to its BORROWED line
 * (its first child's), so its stored `expanded` is live. This file declares nothing but identity.
 */
export const agentNotesBlock = defineAnnotationBlock({
  type: "agent-notes",
  schema: agentNotesDataSchema,
  label: "Agent notes",
  icon: MdAutoAwesome,
  // `"agent"` even though the card is addressed TO the human: `audience` answers
  // "may an agent receive this", not "who is the reader". An agent must be able
  // to re-read what it wrote last time — and it is the one card an agent may
  // WRITE, which would be incoherent if it could not also see it.
  audience: "agent",
  aliases: ["agent", "agents", "ai", "notes", "findings", "report"],
  empty: () => ({}),
  // `<agent-notes>…</agent-notes>` — a real round-tripping syntax, replacing the
  // one-way `**[Agent notes]**` marker. What the marker was for is unchanged (a
  // reader of the page's markdown can tell these lines were written BY an agent
  // rather than by the page's author), and the card now survives the round trip
  // instead of dissolving into its contents. Still no prefix claim: a tag is
  // explicit, so it can never convert real prose on paste.
  markdown: { tag: { body: "children" } },
});
