import { z } from "zod";
import { MdImage } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

export const imageBlock = defineBlock({
  type: "image",
  schema: z.object({
    attachmentId: z.string().optional(),
    width: z.number().int().positive().optional(),
    alt: z.string().optional(),
  }),
  label: "Image",
  icon: MdImage,
  aliases: ["picture", "photo", "img", "media"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
