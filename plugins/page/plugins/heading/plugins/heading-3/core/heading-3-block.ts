import { MdTitle } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const heading3Block = defineBlock({
  type: "heading-3",
  schema: textDataSchema,
  label: "Heading 3",
  icon: MdTitle,
  aliases: ["h3"],
  empty: () => ({ text: "" }),
  placeholder: "Heading 3",
  // Typing `### ` at the start of a block converts it into an H3, preserving any
  // trailing text.
  markdownPrefixes: ["### "],
  textVariant: "subheading",
  // Enter at the end of a heading yields a body paragraph (Notion behavior).
  splitInto: "text",
});
