import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPluginChanges = defineEndpoint({
  route: "GET /api/review/plugin-changes",
});
