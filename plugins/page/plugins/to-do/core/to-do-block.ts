import { MdCheckBox } from "react-icons/md";
import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const toDoDataSchema = z.object({ text: z.string(), checked: z.boolean() });

export const toDoBlock = defineBlock({
  type: "to-do",
  schema: toDoDataSchema,
  label: "To-do",
  icon: MdCheckBox,
  empty: () => ({ text: "", checked: false }),
  placeholder: "To-do",
  // Typing `[] ` or `[ ] ` at the start of a block converts it into a to-do,
  // preserving any trailing text.
  markdownPrefixes: ["[] ", "[ ] "],
  // Render an interactive checkbox marker bound to `checked`; strike through the
  // text when done. Driven generically by the editor's shared text renderer.
  toggle: { field: "checked" },
});
