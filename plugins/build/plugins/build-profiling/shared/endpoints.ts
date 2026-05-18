import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getBuildRunProfile = defineEndpoint({
  route: "GET /api/build/runs/:id/profile",
});
