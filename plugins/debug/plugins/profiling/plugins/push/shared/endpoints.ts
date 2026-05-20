import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPushProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/push",
});
