import { getMapsKey } from "@plugins/integrations/plugins/google-maps/server";
import {
  autocomplete,
  placeDetails,
} from "@plugins/integrations/plugins/google-maps/plugins/places-api/server";
import { definePlaceProvider } from "@plugins/page/plugins/place/server";
import type {
  PlaceSnapshot,
  PlaceSuggestion,
} from "@plugins/page/plugins/place/core";
import { GOOGLE_PLACE_PROVIDER_ID } from "../../shared";

/**
 * The API key, or a loud stop.
 *
 * The registry's contract is that a provider which CANNOT answer throws, and
 * only a provider that genuinely found nothing returns an empty list. "No key
 * configured" is the first kind: returning `[]` here would render as "no
 * results for that address", which is a lie the user cannot debug.
 */
async function requireKey(): Promise<string> {
  const key = await getMapsKey();
  if (!key.ok) {
    throw new Error(
      "Google Maps is not set up: no API key configured. Add one under Settings → Accounts → Google Maps Platform.",
    );
  }
  return key.key;
}

/**
 * The Google half of the place block, and the whole of it: this file is the
 * only place where "a place lookup" and "the Places API" meet.
 *
 * Both sides of the mapping below are structurally identical today, so the
 * field-by-field copies look redundant — they are the seam on purpose. The
 * place block owns the vocabulary a page stores; the Places client owns what
 * Google returns. Writing the copy out means a change on either side surfaces
 * here as a type error rather than silently reshaping stored block data.
 */
export const googlePlaceProvider = definePlaceProvider({
  id: GOOGLE_PLACE_PROVIDER_ID,

  async search(query: string, session: string): Promise<PlaceSuggestion[]> {
    const suggestions = await autocomplete(await requireKey(), query, session);
    return suggestions.map((s) => ({
      placeId: s.placeId,
      primary: s.primary,
      secondary: s.secondary,
    }));
  },

  async resolve(placeId: string, session: string): Promise<PlaceSnapshot> {
    const place = await placeDetails(await requireKey(), placeId, session);
    return {
      placeId: place.placeId,
      name: place.name,
      address: place.address,
      category: place.category,
      mapsUrl: place.mapsUrl,
      lat: place.lat,
      lng: place.lng,
    };
  },
});
