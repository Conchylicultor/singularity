import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const triggerBuildEndpoint = defineEndpoint({
  route: "POST /api/build",
});

export const serveCompositionEndpoint = defineEndpoint({
  route: "POST /api/build/serve",
  body: z.object({ composition: z.string() }),
});
