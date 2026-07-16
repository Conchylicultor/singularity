import { MdFormatListNumbered } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const numberedListBlock = defineBlock({
  type: "numbered-list",
  schema: textDataSchema,
  label: "Numbered list",
  icon: MdFormatListNumbered,
  aliases: ["number", "ordered", "ol", "1."],
  empty: () => ({ text: [] }),
  placeholder: "List",
  // Marker is the item's 1-based position in its consecutive run of siblings;
  // computed at render time and resets per nesting level.
  ordinalMarker: (n) => `${n}.`,
  // Markdown ordered list: serialize the real sequential position (`ctx.ordinal`);
  // parse `1.`/`2)`/`10.` etc. The literal number is discarded — numbering is
  // positional, derived at render.
  markdown: {
    serialize: (d, ctx) => `${ctx.ordinal}. ` + ctx.plain(d.text),
    parseLine: (line, ctx) => {
      const m = /^\d+[.)]\s+(.*)$/.exec(line);
      return m ? { text: ctx.runs(m[1]!) } : null;
    },
  },
  // Drives ONLY the live `1. ` markdown shortcut; clipboard markdown is owned by
  // the `markdown` declaration above.
  markdownPrefixes: ["1. "],
  // Backspace at the very start resets to a plain paragraph (a second one then
  // merges); Enter on an empty item exits the list to a paragraph.
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
});
