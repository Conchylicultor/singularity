import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getLogChannels = defineEndpoint({
  route: "GET /api/logs/channels",
});
