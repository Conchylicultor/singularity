import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { DocumentSchema } from "@plugins/page/plugins/editor/core";

// Idempotent get-or-create of the single debug document (fixed id), seeding one
// empty text block when it has none. Idempotent so it can run once per tab mount
// without duplicating documents across tabs.
export const ensureDebugDocument = defineEndpoint({
  route: "POST /api/page-debug/ensure",
  response: DocumentSchema,
});
