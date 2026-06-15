import { MdFormatListNumbered } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const numberedListBlock = defineBlock({
  type: "numbered-list",
  schema: textDataSchema,
  label: "Numbered list",
  icon: MdFormatListNumbered,
  aliases: ["number", "ordered", "ol", "1."],
  empty: () => ({ text: "" }),
  placeholder: "List",
  // Marker is the item's 1-based position in its consecutive run of siblings;
  // computed at render time and resets per nesting level.
  ordinalMarker: (n) => `${n}.`,
  // Drives ONLY the live `1. ` markdown shortcut. Paste/copy of arbitrary
  // numbers is handled by the dedicated ordinal passes in markdown-blocks.ts.
  markdownPrefixes: ["1. "],
  // Backspace at the very start resets to a plain paragraph (a second one then
  // merges); Enter on an empty item exits the list to a paragraph.
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
});
