import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getBuildProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/build",
});
