import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const startPushAndExit = defineEndpoint({
  route: "POST /api/conversations/:id/push-and-exit",
});
