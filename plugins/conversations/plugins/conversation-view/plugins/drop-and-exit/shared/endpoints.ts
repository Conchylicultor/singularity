import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const dropAndExit = defineEndpoint({
  route: "POST /api/conversations/:id/drop-and-exit",
});
