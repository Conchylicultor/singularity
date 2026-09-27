import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const imageIcon = symbol("image");

export const imageBlock = defineBlock({
  type: "image",
  schema: z.object({
    attachmentId: z.string().optional(),
    width: z.number().int().positive().optional(),
    alt: z.string().optional(),
  }),
  label: "Image",
  icon: imageIcon,
  aliases: ["picture", "photo", "img", "media"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
