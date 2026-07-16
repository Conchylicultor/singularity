import { MdCheckBox } from "react-icons/md";
import { z } from "zod";
import { defineBlock, textBlockSchema } from "@plugins/page/plugins/editor/core";

export const toDoDataSchema = textBlockSchema({ checked: z.boolean().default(false) });

export const toDoBlock = defineBlock({
  type: "to-do",
  schema: toDoDataSchema,
  label: "To-do",
  icon: MdCheckBox,
  aliases: ["checkbox", "task", "checklist", "todo"],
  empty: () => ({ text: [], checked: false }),
  placeholder: "To-do",
  // Markdown task list: `- [ ] x` / `- [x] x`. `precedence: 10` so this claims
  // the line before bulleted-list's derived `- ` prefix parse (which would else
  // capture `[ ] x` as the text).
  markdown: {
    precedence: 10,
    serialize: (d, ctx) => `- [${d.checked ? "x" : " "}] ` + ctx.plain(d.text),
    parseLine: (line, ctx) => {
      const m = /^[-*+]?\s*\[([ xX])\]\s+(.*)$/.exec(line);
      if (!m) return null;
      return { text: ctx.runs(m[2]!), checked: m[1]!.toLowerCase() === "x" };
    },
  },
  // Typing `[] ` or `[ ] ` at the start of a block converts it into a to-do,
  // preserving any trailing text.
  markdownPrefixes: ["[] ", "[ ] "],
  // Render an interactive checkbox marker bound to `checked`; strike through the
  // text when done. Driven generically by the editor's shared text renderer.
  toggle: { field: "checked" },
  // Backspace at the very start resets to a plain paragraph (a second one then
  // merges); Enter on an empty to-do exits the list to a paragraph.
  resetToOnBackspaceAtStart: "text",
  breakOutOnEmptyEnter: "text",
});
