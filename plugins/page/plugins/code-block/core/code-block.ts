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
  // Fenced markdown: ```lang\n…code…\n``` round-trips code + language. The info
  // string after the opening fence is the shiki language id (empty ⇒ plain text).
  markdown: {
    fence: {
      open: "```",
      close: "```",
      parseFenced: (info, body) => ({
        code: body,
        ...(info ? { language: info } : {}),
      }),
    },
    serialize: (d) => "```" + (d.language ?? "") + "\n" + d.code + "\n```",
  },
  // Typing ``` at the start of a text block converts it into a code block. The
  // generic MarkdownShortcutPlugin reads this off the slot — no editor changes.
  markdownPrefixes: ["```"],
  // Not a doc-text block: the code sits at `Inset y="xs"` + the `<pre>`'s `p-md`,
  // on a fixed `leading-5` (1.25rem) line — so seat the rail on that first line.
  gutterFirstLineCenter: "calc(var(--space-xs) + var(--space-md) + 0.625rem)",
});
