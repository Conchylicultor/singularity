import { z } from "zod";
import { MdHorizontalRule } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

// Exported as a named const so consumers (e.g. story-core) can map this block
// type to an IR role without string-duplicating the literal "divider".
export const DIVIDER_TYPE = "divider";

export const dividerBlock = defineBlock({
  type: DIVIDER_TYPE,
  // Void block — carries no data; the type discriminator is the whole payload.
  schema: z.object({}),
  label: "Divider",
  icon: MdHorizontalRule,
  empty: () => ({}),
  // Typing --- at the start of a text block converts it into a divider. The
  // generic MarkdownShortcutPlugin reads this off the slot — no editor changes.
  // Longest-prefix-wins, so "---" beats any shorter marker; it fires the moment
  // the third "-" appears. The plugin appends `text: remaining` on convert, but
  // the schema has no `text` field so it is harmlessly dropped (remaining is ""
  // anyway, since --- is typed into an otherwise-empty block).
  markdownPrefixes: ["---"],
});
