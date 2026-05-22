import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { CommitRowSchema } from "@plugins/primitives/plugins/commit-list/core";

export const getBuildRunCommits = defineEndpoint({
  route: "GET /api/build/runs/:id/commits",
  response: z.array(CommitRowSchema),
});
