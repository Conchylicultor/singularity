import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const uploadAttachment = defineEndpoint({
  route: "POST /api/attachments",
});

export const getAttachmentFile = defineEndpoint({
  route: "GET /api/attachments/:id",
});

export const deleteAttachmentEndpoint = defineEndpoint({
  route: "DELETE /api/attachments/:id",
});
