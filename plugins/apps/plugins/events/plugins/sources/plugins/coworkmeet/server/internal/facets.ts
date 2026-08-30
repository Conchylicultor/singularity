import {
  COWORKMEET_AMBIANCES,
  COWORKMEET_DISTRICTS,
  COWORKMEET_POWER_OUTLETS,
  COWORKMEET_QUIET_LEVELS,
  COWORKMEET_SESSION_TYPES,
  facetLabelOf,
} from "../../core";
import { postcodeDistrict } from "./address";
import type { SessionRow } from "./rows";

// One session, reduced to the five vocabularies the source filters on and the
// extractor tags with.
//
// This is the single place a stored code becomes a word. Both consumers read it:
// `filters.ts` compares the words against the user's selection, `extract.ts`
// emits the same words as `tags`. That is what makes a ticked filter and a
// clickable tag the same string — see `core/internal/catalog.ts`.
//
// Every field is `string | undefined`, and `undefined` means the association
// published nothing on that dimension. Half the live sessions rate their venue
// and half do not.

export interface SessionFacets {
  type: string | undefined;
  district: string | undefined;
  ambiance: string | undefined;
  quietLevel: string | undefined;
  powerOutlets: string | undefined;
}

/**
 * The district a session is in, as an arrondissement number.
 *
 * The column first, the address's postcode second. Not a guess between two
 * disagreeing sources: measured over the whole live capture the two never
 * disagree — the column is simply filled on 14 sessions and the postcode on 51
 * more, so together they answer 65 of 67. See `address.ts`.
 */
function districtOf(row: SessionRow): number | undefined {
  return row.arrondissement ?? postcodeDistrict(row.adresse_lieu);
}

export function sessionFacets(row: SessionRow): SessionFacets {
  return {
    type: facetLabelOf(COWORKMEET_SESSION_TYPES, row.event_type),
    district: facetLabelOf(COWORKMEET_DISTRICTS, districtOf(row)),
    ambiance: facetLabelOf(COWORKMEET_AMBIANCES, row.ambiance),
    quietLevel: facetLabelOf(COWORKMEET_QUIET_LEVELS, row.niveau_calme),
    powerOutlets: facetLabelOf(
      COWORKMEET_POWER_OUTLETS,
      row.disponibilite_prises,
    ),
  };
}

/** The facets a session actually published, in reading order — what it gets tagged with. */
export function facetTags(facets: SessionFacets): string[] {
  return [
    facets.type,
    facets.district,
    facets.ambiance,
    facets.quietLevel,
    facets.powerOutlets,
  ].filter((tag): tag is string => tag !== undefined);
}
