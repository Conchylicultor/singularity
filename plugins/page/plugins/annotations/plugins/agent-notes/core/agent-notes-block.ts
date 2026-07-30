import { z } from "zod";
import { MdAutoAwesome } from "react-icons/md";
import { defineContainerBlock } from "@plugins/page/plugins/container/core";

/**
 * An agent-notes card is a VOID container: it owns NOTHING but its type.
 *
 * `z.object({})` — no `text` (its content is its children) and no appearance
 * fields (one fixed look, so there is nothing per-instance to store). The write
 * boundary parses through `handle.schema.strict()`, so a stray key is a 400
 * rather than a quietly-stored field.
 *
 * Deliberately NOT a payload field: *which* agent / run wrote the card. That is
 * provenance, it has to survive edits and be queryable, and `page/agent-origin`
 * already owns exactly that shape (an entity-extension side-table keyed by
 * block). Storing an author string in the block's `data` would be a second,
 * unjoinable copy.
 */
export const agentNotesDataSchema = z.object({});

/**
 * `defineContainerBlock` forces `anchor: true`, `collapsible: "never"` and
 * `wrapOnConvert: true` — see `@plugins/page/plugins/container/core` for why the
 * three are only correct together. This file declares nothing but identity.
 */
export const agentNotesBlock = defineContainerBlock({
  type: "agent-notes",
  schema: agentNotesDataSchema,
  label: "Agent notes",
  icon: MdAutoAwesome,
  aliases: ["agent", "agents", "ai", "notes", "findings", "report"],
  empty: () => ({}),
  // One-way markdown: `text/plain` is the EXTERNAL projection only (internal
  // copy/paste is lossless through the `BLOCKS_MIME` JSON forest). A void
  // container has no text, so this emits the MARKER ALONE and the children —
  // serialized generically, indented two spaces under it by the central walk —
  // carry the content. The marker is the point: it is what lets a reader (human
  // or agent) of a page's markdown tell these lines were written BY an agent
  // rather than by the page's author. No `parseLine`: claiming a prefix would
  // convert real prose on paste.
  markdown: { serialize: () => "**[Agent notes]**" },
});
