import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const ResolveFileResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not-found") }),
  z.object({ kind: z.literal("exact") }),
  z.object({ kind: z.literal("resolved"), matches: z.array(z.string()) }),
]);
export type ResolveFileResult = z.infer<typeof ResolveFileResultSchema>;

export const resolveFile = defineEndpoint({
  route: "GET /api/code/:worktree/resolve",
  response: ResolveFileResultSchema,
});
