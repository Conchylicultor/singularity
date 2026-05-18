import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPluginTree = defineEndpoint({
  route: "GET /api/plugin-view/tree",
});
