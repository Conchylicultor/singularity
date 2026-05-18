import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const triggerBuildEndpoint = defineEndpoint({
  route: "POST /api/build",
});

export const getBuildStatus = defineEndpoint({
  route: "GET /api/build/status",
});
