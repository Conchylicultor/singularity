import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getPushProfiling = defineEndpoint({
  route: "GET /api/debug/profiling/push",
  query: z.object({
    since: z.coerce.number().optional(),
    worktree: z.string().optional(),
    padding: z.coerce.number().optional(),
  }),
});
