import { z } from "zod";
import { defineEndpoint, multipart, blob } from "@plugins/infra/plugins/endpoints/core";

export const UploadedAttachmentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  mime: z.string(),
  size: z.number(),
});

export const uploadAttachment = defineEndpoint({
  route: "POST /api/attachments",
  body: multipart(),
  response: UploadedAttachmentSchema,
});

export const getAttachmentFile = defineEndpoint({
  route: "GET /api/attachments/:id",
  response: blob(),
});

export const deleteAttachmentEndpoint = defineEndpoint({
  route: "DELETE /api/attachments/:id",
});
