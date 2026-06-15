import { MdTitle } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const heading1Block = defineBlock({
  type: "heading-1",
  schema: textDataSchema,
  label: "Heading 1",
  icon: MdTitle,
  aliases: ["h1", "title", "heading"],
  empty: () => ({ text: "" }),
  placeholder: "Heading 1",
  // Typing `# ` at the start of a block converts it into an H1, preserving any
  // trailing text.
  markdownPrefixes: ["# "],
  textVariant: "title",
  // Enter at the end of a heading yields a body paragraph (Notion behavior).
  splitInto: "text",
});
