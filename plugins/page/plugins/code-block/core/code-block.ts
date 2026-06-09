import { z } from "zod";
import { MdCode } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const codeBlock = defineBlock({
  type: "code-block",
  schema: z.object({
    code: z.string().default(""),
    // A shiki language id (see SHIKI_LANGS); undefined renders as plain text.
    language: z.string().optional(),
  }),
  label: "Code",
  icon: MdCode,
  aliases: ["snippet", "syntax", "monospace", "pre"],
  empty: () => ({ code: "" }),
  // Typing ``` at the start of a text block converts it into a code block. The
  // generic MarkdownShortcutPlugin reads this off the slot — no editor changes.
  markdownPrefixes: ["```"],
});
