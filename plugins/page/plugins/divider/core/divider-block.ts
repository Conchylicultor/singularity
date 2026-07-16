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
  aliases: ["hr", "rule", "separator", "line", "horizontal rule", "---"],
  empty: () => ({}),
  // Markdown: `---`. A void type — parseLine returns `{}` (never a `text` key, so
  // paste can't inject the unknown-key the write boundary rejects).
  markdown: {
    serialize: () => "---",
    parseLine: (line) => (line.trim() === "---" ? {} : null),
  },
  // Typing --- at the start of a text block converts it into a divider. The
  // generic MarkdownShortcutPlugin reads this off the slot — no editor changes.
  // Longest-prefix-wins, so "---" beats any shorter marker; it fires the moment
  // the third "-" appears. The convert path gates the `text` carry on the
  // target's `acceptsText` (derived from this schema having no `text` key), so
  // no `text` key is written — the write boundary would reject it as unknown.
  markdownPrefixes: ["---"],
  // A 1px rule inside `Inset y="sm"`: seat the rail on the rule itself, not the
  // phantom body line the default would assume (which sits well below it).
  gutterFirstLineCenter: "calc(var(--space-sm) + 0.5px)",
});
