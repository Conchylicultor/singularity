import { z } from "zod";
import { defineBlock } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";

const attachFileIcon = symbol("attach-file");

export const FILE_TYPE = "file";

export const fileBlock = defineBlock({
  type: FILE_TYPE,
  schema: z.object({
    attachmentId: z.string().optional(),
    filename: z.string().optional(),
    mime: z.string().optional(),
    size: z.number().optional(),
  }),
  label: "File",
  icon: attachFileIcon,
  aliases: ["attachment", "upload", "document", "pdf", "download"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
