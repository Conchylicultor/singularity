import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";

export const getCommitsCumulative = defineEndpoint({
  route: "GET /api/stats/commits/cumulative",
});

export const getCommitsRate = defineEndpoint({
  route: "GET /api/stats/commits/rate",
});

export const getCommitsLinesCumulative = defineEndpoint({
  route: "GET /api/stats/commits/lines/cumulative",
});

export const getCommitsLinesRate = defineEndpoint({
  route: "GET /api/stats/commits/lines/rate",
});

export const getExcludedPathState = defineEndpoint({
  route: "GET /api/stats/commits/excluded-path-state",
});

export const PatchExcludedPathStateBodySchema = z.object({
  path: z.string(),
  enabled: z.boolean(),
});
export type PatchExcludedPathStateBody = z.infer<typeof PatchExcludedPathStateBodySchema>;

export const patchExcludedPathState = defineEndpoint({
  route: "PATCH /api/stats/commits/excluded-path-state",
  body: PatchExcludedPathStateBodySchema,
});

export const deleteExcludedPathState = defineEndpoint({
  route: "DELETE /api/stats/commits/excluded-path-state/:path",
});
