import { z } from "zod";

// The wire shape of the `coworking_sessions` PostgREST projection this type
// selects, as the association's Supabase actually serves it.
//
// Note what `.nullable()` means here and what it does not. Every one of these
// columns is a real column that is always PRESENT in the response — PostgREST
// returns the projection it was asked for — so nothing is `.optional()`. Half of
// them are `null` on half the live rows, because the association fills what it
// knows about a venue and leaves the rest: that is published data, not a shape
// change. The six fields the extractor needs to state WHEN and WHERE a session
// is (`id`, `nom_lieu`, `adresse_lieu`, `date_session`, `heure_debut`,
// `heure_fin`) are non-null on all 67 live rows and required here, so a session
// that stops carrying one parks the source rather than quietly reshaping what it
// publishes.

/**
 * PostgREST's embedded aggregate over the `session_registrations` relation. It
 * arrives as an ARRAY holding one object — `[{ "count": 13 }]` — because an
 * embedding is a relation even when it is aggregated down to one row.
 */
const RegistrationCountSchema = z.array(z.object({ count: z.number().int() }));

export const SessionRowSchema = z.object({
  /** Stable uuid — this type's `externalId` and the id in the session's own page URL. */
  id: z.string(),
  /** Venue name as published, messy: trailing spaces, hotel stars, inconsistent casing. */
  nom_lieu: z.string(),
  /** Free-text address. Almost always carries a French postcode; twice it does not. */
  adresse_lieu: z.string(),
  /** `YYYY-MM-DD`, Paris local day. */
  date_session: z.string(),
  /** `HH:MM:SS`, Paris wall clock. */
  heure_debut: z.string(),
  heure_fin: z.string(),
  photo_url: z.string().nullable(),
  /** The organiser's own note about the venue. */
  note_lieu: z.string().nullable(),
  /** The organiser's own note about this session. */
  description_session: z.string().nullable(),
  max_participants: z.number().int().nullable(),
  /** What a drink costs at the venue — NOT the price of the session, which is free. */
  prix_conso: z.number().nullable(),
  referent_name: z.string().nullable(),
  /** 1–3 scales; see `catalog.ts` for the association's own words for each. */
  niveau_calme: z.number().int().nullable(),
  ambiance: z.number().int().nullable(),
  disponibilite_prises: z.number().int().nullable(),
  /** `coworking` / `afterwork`. */
  event_type: z.string(),
  /** Paris district, filled on only 14 of 67 live rows — see `address.ts`. */
  arrondissement: z.number().int().nullable(),
  session_registrations: RegistrationCountSchema,
});

export type SessionRow = z.infer<typeof SessionRowSchema>;

/** One page of the listing: PostgREST serves a bare array, with the total in `Content-Range`. */
export const SessionPageSchema = z.array(SessionRowSchema);

/**
 * How many people have signed up.
 *
 * The aggregate is an array, so "how many" is one indirection away, and an empty
 * array would be PostgREST reporting no aggregate row at all — which it does not
 * do for a `count`, and which is a shape change rather than "nobody signed up"
 * (that is `[{ count: 0 }]`). Treated as unknown rather than as zero: claiming
 * "0 signed up" from a missing aggregate is inventing a fact about the session.
 */
export function registrationCount(row: SessionRow): number | undefined {
  return row.session_registrations[0]?.count;
}
