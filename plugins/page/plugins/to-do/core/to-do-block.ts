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
  empty: () => ({ text: "", checked: false }),
  placeholder: "To-do",
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
