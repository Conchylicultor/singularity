import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getStatsProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/stats",
});
