import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import { placeResolveEndpoint, placeSearchEndpoint } from "../../core";
import {
  getPlaceProvider,
  placeProviderIds,
  type PlaceProvider,
} from "./registry";

/**
 * Resolve a provider id, or fail with the reason and the ids that DO exist.
 * A 400 rather than a 404: the id is a caller-supplied parameter naming
 * something that was never registered, not a missing resource at this path.
 */
function requireProvider(id: string): PlaceProvider {
  const provider = getPlaceProvider(id);
  if (!provider) {
    const known = placeProviderIds();
    throw new HttpError(
      400,
      `Unknown place provider: ${id}. Registered: ${known.length > 0 ? known.join(", ") : "(none)"}`,
    );
  }
  return provider;
}

/**
 * Generic search dispatch. The provider's own failures propagate untouched —
 * there is deliberately no empty-array fallback, because an empty suggestion
 * list must only ever mean "the provider found nothing".
 */
export const handlePlaceSearch = implement(
  placeSearchEndpoint,
  async ({ query }) => {
    const provider = requireProvider(query.providerId);
    return { suggestions: await provider.search(query.q, query.session) };
  },
);

/** Generic resolve dispatch. Same rule: a provider that cannot answer throws. */
export const handlePlaceResolve = implement(
  placeResolveEndpoint,
  async ({ query }) => {
    const provider = requireProvider(query.providerId);
    return provider.resolve(query.placeId, query.session);
  },
);
