import { z } from "zod";
import { MdNotes } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const textBlock = defineBlock({
  type: "text",
  schema: z.object({ text: z.string() }),
  label: "Text",
  icon: MdNotes,
  empty: () => ({ text: "" }),
});
