import { MdFormatListBulleted } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const bulletedListBlock = defineBlock({
  type: "bulleted-list",
  schema: textDataSchema,
  label: "Bulleted list",
  icon: MdFormatListBulleted,
  empty: () => ({ text: "" }),
  marker: "•",
  placeholder: "List",
  // CommonMark bullet markers. Typing any of these at the start of a block
  // converts it into a bullet, preserving any trailing text.
  markdownPrefixes: ["* ", "- ", "+ "],
});
