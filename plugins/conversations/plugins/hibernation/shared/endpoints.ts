import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

// User opened (selected) the conversation: reset its idle timer and, if it was
// hibernated, transparently resume the process before the user can type.
export const markViewed = defineEndpoint({
  route: "POST /api/conversations/:id/viewed",
  response: z.object({ ok: z.literal(true) }),
});
