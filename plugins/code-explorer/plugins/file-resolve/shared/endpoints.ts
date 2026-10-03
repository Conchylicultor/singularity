import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const ResolveFileResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("not-found") }),
  // The path names one existing file, and where its bytes live: `git` — inside
  // the worktree, `path` relative to it (an absolute or `~` path inside the
  // worktree comes back relativized); `host` — anywhere else, `path` absolute.
  z.object({
    kind: z.literal("exact"),
    source: z.enum(["git", "host"]),
    path: z.string(),
  }),
  z.object({ kind: z.literal("resolved"), matches: z.array(z.string()) }),
]);
export type ResolveFileResult = z.infer<typeof ResolveFileResultSchema>;

export const resolveFile = defineEndpoint({
  route: "GET /api/code/:worktree/resolve",
  query: z.object({ path: z.string() }),
  response: ResolveFileResultSchema,
});
