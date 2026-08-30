// What the free-text `adresse_lieu` can be made to say: the Paris district, and
// the town.
//
// ## The district is published twice, and neither half is complete
//
// The table has an `arrondissement` column, filled on 14 of the 67 live
// sessions. The address carries a `75xxx` postcode on 51 more. Measured across
// the whole capture, the two NEVER disagree — they are complementary, not
// competing — so reading the column first and falling back to the postcode lifts
// district coverage from 14/67 to 65/67. The two that resolve to nothing are
// genuine: one address is `30 Rue du Sentier` with no postcode at all, and one
// session is in Pantin, which has no arrondissement to name.
//
// Both functions answer `undefined` for "the address does not say", which is
// data (an address that names no town is a real address), not a swallowed
// failure. Nothing here throws: an unreadable address costs a session its
// district tag, never its place in the listing.

/**
 * Paris postcodes, as the LAST THREE digits.
 *
 * `\b75(\d{2})\b` is the tempting version and it is wrong: `75005` then matches
 * `750` + `05` and reads the 5th arrondissement as the 50th, which is out of
 * range, so the district silently disappears. Three digits, then a range check.
 */
const PARIS_POSTCODE = /\b75(\d{3})\b/;

/** Any French postcode, and the town after it up to the next comma or the end. */
const POSTCODE_TOWN = /\b(\d{5})\b[,\s]+([^,]+?)\s*(?:,|$)/u;

const PARIS_DISTRICT_COUNT = 20;

/**
 * The Paris district the address's postcode names, or `undefined` when it names
 * none — including a `75xxx` outside 1–20, which is not an arrondissement (the
 * `75116` the Post Office uses for the 16th's western half would land there, and
 * refusing it is the honest answer: this vocabulary has no code for it).
 */
export function postcodeDistrict(address: string): number | undefined {
  const match = PARIS_POSTCODE.exec(address);
  if (match === null) return undefined;
  const district = Number(match[1]);
  if (district < 1 || district > PARIS_DISTRICT_COUNT) return undefined;
  return district;
}

/**
 * The town the address names, or `undefined` when it names none.
 *
 * A `75xxx` postcode is answered as `Paris` without reading further: the live
 * addresses spell the city three ways after it (`Paris`, `paris`, and nothing at
 * all), and the postcode already settles the question.
 *
 * For anywhere else the town is whatever the address writes after the postcode,
 * title-cased — one live session is in `93500 Pantin`, which is exactly why this
 * does not simply return `Paris`.
 */
export function addressCity(address: string): string | undefined {
  const trimmed = address.trim();
  const match = POSTCODE_TOWN.exec(trimmed);
  if (match === null) {
    // No postcode at all. `Pont de Javel Bas 75015 Paris` is covered above; what
    // reaches here is `30 Rue du Sentier`, which genuinely names no town.
    return PARIS_POSTCODE.test(trimmed) ? "Paris" : undefined;
  }
  if (match[1]!.startsWith("75")) return "Paris";
  return match[2]!
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
