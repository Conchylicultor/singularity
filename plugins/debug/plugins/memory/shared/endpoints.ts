import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const listMemoryFiles = defineEndpoint({
  route: "GET /api/debug/memory",
});

export const readMemoryFile = defineEndpoint({
  route: "GET /api/debug/memory/:name",
});
