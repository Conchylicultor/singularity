import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import {
  ProgressionParamSchema,
  TheorytabSectionSchema,
  TrendNodeSchema,
  TrendSongSchema,
} from "./internal/schemas";

// Thin HTTP wrappers over the server client, so the browser (and curl) can
// reach Hooktheory through this worktree's backend. The two trends calls need a
// signed-in Hooktheory account (409 until there is one); the section call is
// public. Hooktheory's own failures come back as 502 carrying its message.

// Next-chord probabilities after the progression `cp` (comma-joined chord ids).
// Omit `cp` for the chords songs most often start on.
export const trendNodesEndpoint = defineEndpoint({
  route: "GET /api/hooktheory/trends/nodes",
  query: z.object({ cp: ProgressionParamSchema.optional() }),
  response: z.array(TrendNodeSchema),
});

// Songs containing the progression `cp`, one page at a time (`page` from 1).
export const trendSongsEndpoint = defineEndpoint({
  route: "GET /api/hooktheory/trends/songs",
  query: z.object({
    cp: ProgressionParamSchema,
    page: z.coerce.number().int().min(1),
  }),
  response: z.array(TrendSongSchema),
});

// One TheoryTab section by its id. 404 when Hooktheory does not know the id.
export const theorytabSectionEndpoint = defineEndpoint({
  route: "GET /api/hooktheory/sections/:id",
  response: TheorytabSectionSchema,
});
