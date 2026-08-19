import { z } from "zod";
import { defineEndpoint } from "@plugins/infra/plugins/endpoints/core";
import { PlaceSnapshotSchema, PlaceSuggestionSchema } from "./schemas";

/**
 * Type-ahead lookup. `providerId` selects the registered provider; the endpoint
 * itself knows no provider and reads no credential.
 *
 * `session` is a per-search-round token minted by the client and passed to BOTH
 * endpoints, so a provider that bills a search-then-pick as one session can say
 * which suggestions the resolve belongs to. Opaque here — this plugin only
 * carries it.
 *
 * The response is an OBJECT, not a bare array: a suggestion list is a thing that
 * will grow attributes (a "more results" cursor, a per-round notice), and an
 * array response has nowhere to put them.
 */
export const placeSearchEndpoint = defineEndpoint({
  route: "GET /api/place/search",
  query: z.object({
    providerId: z.string().min(1),
    q: z.string().min(1),
    session: z.string().min(1),
  }),
  response: z.object({ suggestions: z.array(PlaceSuggestionSchema) }),
});

/** Turn one chosen suggestion into the snapshot the block stores. */
export const placeResolveEndpoint = defineEndpoint({
  route: "GET /api/place/resolve",
  query: z.object({
    providerId: z.string().min(1),
    placeId: z.string().min(1),
    session: z.string().min(1),
  }),
  response: PlaceSnapshotSchema,
});
