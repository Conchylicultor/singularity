import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const resolveFile = defineEndpoint({
  route: "GET /api/code/:worktree/resolve",
});
