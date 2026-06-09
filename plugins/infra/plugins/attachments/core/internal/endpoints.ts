import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { AttachmentSchema } from "./schema";

// ownerType is the owner table name (e.g. "tasks") — see defineLink registry.
export const listAttachmentsEndpoint = defineEndpoint({
  route: "GET /api/attachments/by/:ownerType/:id",
  response: z.array(AttachmentSchema),
});
