import { MdFormatQuote } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const quoteBlock = defineBlock({
  type: "quote",
  schema: textDataSchema,
  label: "Quote",
  icon: MdFormatQuote,
  aliases: ["blockquote", "cite", "quotation"],
  empty: () => ({ text: "" }),
  placeholder: "Quote",
  // NOTE: the canonical Markdown quote prefix `> ` is already claimed by the
  // `toggle` block, so this block intentionally declares no `markdownPrefixes`.
  // It is reachable via the slash menu, the insert menu, and "Turn into".
});
