import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getBootProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/boot",
});
