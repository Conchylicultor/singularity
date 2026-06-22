import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { UgTabSchema } from "../core";

/**
 * Fetch the raw Ultimate Guitar tab for a pasted UG tab URL. The handler
 * resolves the URL to a numeric tab id and fetches the tab from UG's private
 * mobile API. NO persistence, NO parsing of the chord/lyric markup — the raw
 * `content` is returned verbatim. Failures map to loud HTTP statuses.
 */
export const fetchUgTab = defineEndpoint({
  route: "POST /api/sonata/sources/ultimate-guitar/fetch",
  body: z.object({ url: z.string() }),
  response: UgTabSchema,
});
