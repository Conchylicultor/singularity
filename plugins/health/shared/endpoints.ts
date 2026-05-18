import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getHealth = defineEndpoint({
  route: "GET /api/health",
});
