import { MdFormatListBulleted } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const bulletedListBlock = defineBlock({
  type: "bulleted-list",
  schema: textDataSchema,
  label: "Bulleted list",
  icon: MdFormatListBulleted,
  aliases: ["bullet", "unordered", "ul", "list"],
  empty: () => ({ text: [] }),
  marker: "•",
  placeholder: "List",
  // CommonMark bullet markers. Typing any of these at the start of a block
  // converts it into a bullet, preserving any trailing text.
  markdownPrefixes: ["* ", "- ", "+ "],
  // Backspace at the very start resets to a plain paragraph (a second one then
  // merges); Enter on an empty bullet exits the list to a paragraph.
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
});
