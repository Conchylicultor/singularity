import { MdNotes } from "react-icons/md";
import { defineBlock, textDataSchema } from "@plugins/page/plugins/editor/core";

export const textBlock = defineBlock({
  type: "text",
  schema: textDataSchema,
  label: "Text",
  defaultText: true,
  icon: MdNotes,
  aliases: ["paragraph", "plain", "body", "p"],
  empty: () => ({ text: "" }),
  placeholder: "Type '/' for commands",
});
