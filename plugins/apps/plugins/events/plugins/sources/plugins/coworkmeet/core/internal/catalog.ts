// The association's own published vocabularies, copied from what the site
// prints beside each session.
//
// ## The load-bearing property of this file
//
// **A facet's label is BOTH the value a filter selects and the tag the extractor
// emits.** One string, one place. That is what makes a source's filters and the
// events DataView's tag dimension agree: tick `Silencieux` on the source and the
// events it publishes carry the tag `Silencieux`, so the same word filters in
// both surfaces. Derive both ends from a catalogue below — never re-type a label
// in `config.ts` or in the extractor, or the two drift silently and the tag
// dimension stops answering the question the filter asked.
//
// The upstream `code` is what the API stores (`event_type` text, or the 1–3
// integer scales); the `label` is what the site displays for it. The codes are
// the contract, the labels are the vocabulary.

/** One entry of a published vocabulary: what the API stores, and what the site calls it. */
export interface CoworkmeetFacet<TCode extends string | number> {
  readonly code: TCode;
  readonly label: string;
}

/** `event_type`: 66 of the 67 live sessions are `coworking`; the association also runs afterworks. */
export const COWORKMEET_SESSION_TYPES = [
  { code: "coworking", label: "Coworking" },
  { code: "afterwork", label: "Afterwork" },
] as const satisfies readonly CoworkmeetFacet<string>[];

/**
 * `niveau_calme` — how noisy the venue is, 1–3, in the site's own words. Read as
 * a ladder from loudest to quietest; the order here is the order of the chips.
 */
export const COWORKMEET_QUIET_LEVELS = [
  { code: 1, label: "Animé" },
  { code: 2, label: "Modéré" },
  { code: 3, label: "Silencieux" },
] as const satisfies readonly CoworkmeetFacet<number>[];

/** `ambiance` — how much the room is for heads-down work versus for talking to people. */
export const COWORKMEET_AMBIANCES = [
  { code: 1, label: "Focus" },
  { code: 2, label: "Équilibré" },
  { code: 3, label: "Convivial" },
] as const satisfies readonly CoworkmeetFacet<number>[];

/** `disponibilite_prises` — how likely you are to find a power socket. */
export const COWORKMEET_POWER_OUTLETS = [
  { code: 1, label: "Prises rares" },
  { code: 2, label: "Prises OK" },
  { code: 3, label: "Prises ++" },
] as const satisfies readonly CoworkmeetFacet<number>[];

/** Paris has twenty arrondissements; `arrondissement` is one of them. */
const PARIS_DISTRICT_COUNT = 20;

/**
 * `Paris 1er`, `Paris 2e` … `Paris 20e` — French ordinals, where only the first
 * is `er`. Generated rather than typed out twenty times: a table of twenty rows
 * that differ by one integer is a rule, and a rule is not more readable spelled
 * out.
 */
function districtLabel(district: number): string {
  return `Paris ${district}${district === 1 ? "er" : "e"}`;
}

/**
 * The twenty Paris districts, `code` being the `arrondissement` integer the API
 * stores (and the district the address's `75xxx` postcode names — see
 * `server/internal/address.ts`).
 */
export const COWORKMEET_DISTRICTS: readonly CoworkmeetFacet<number>[] =
  Object.freeze(
    Array.from({ length: PARIS_DISTRICT_COUNT }, (_, i) => ({
      code: i + 1,
      label: districtLabel(i + 1),
    })),
  );

/**
 * Every label a vocabulary can produce, in its published order — the ONE source
 * of a filter's option list.
 */
export function facetLabels(
  catalog: readonly CoworkmeetFacet<string | number>[],
): string[] {
  return catalog.map((f) => f.label);
}

/**
 * The label for one stored code, or `undefined` when the session published none.
 *
 * `undefined` is data here, not a swallowed failure: half the live sessions
 * simply do not rate their venue, and a session with no rating carries no tag on
 * that dimension — which is also why it does not match a filter on it.
 *
 * A code the catalogue does not know reads the same way. The site can only serve
 * 1–3 on the integer scales today; if it ever adds a 4, that session loses one
 * tag until this file learns the word for it, which is the quiet failure this
 * type can afford (the alternative — parking the whole source — would lose 67
 * sessions over one new adjective).
 */
export function facetLabelOf<TCode extends string | number>(
  catalog: readonly CoworkmeetFacet<TCode>[],
  code: TCode | null | undefined,
): string | undefined {
  if (code === null || code === undefined) return undefined;
  return catalog.find((f) => f.code === code)?.label;
}
