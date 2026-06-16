import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { SearchResultSchema } from "./schemas";

// Ranked full-text search across indexed documents. `q` is the raw user query
// (word + prefix matched server-side); `sources` is an optional comma-joined
// list of source ids to scope the search to (omit to search every source).
export const searchEndpoint = defineEndpoint({
  route: "GET /api/search",
  query: z.object({
    q: z.string().min(1).max(200),
    sources: z.string().optional(),
  }),
  response: z.array(SearchResultSchema),
});
