import { z } from "zod";
import { dateString } from "@plugins/infra/plugins/endpoints/core";

// Canonical wire shape of an attachment row. diskPath (server-only) is
// intentionally excluded — the list handler strips it before responding.
export const AttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mime: z.string(),
  size: z.number(),
  createdAt: dateString(),
});
export type Attachment = z.infer<typeof AttachmentSchema>;
