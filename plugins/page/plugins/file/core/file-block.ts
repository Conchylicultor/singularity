import { z } from "zod";
import { MdAttachFile } from "react-icons/md";
import { defineBlock } from "@plugins/page/plugins/editor/core";

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
  icon: MdAttachFile,
  aliases: ["attachment", "upload", "document", "pdf", "download"],
  empty: () => ({}), // no attachmentId → placeholder UI
});
