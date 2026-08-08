import type { ExtractionResult } from "@plugins/apps/plugins/events/plugins/events-core/core";
import { DMDA_ORIGIN } from "../../core";
import { parseFrenchVisitDate } from "./french-date";
import type { DmdaPayload } from "./probe";

// The "expensive" phase, which for this source type costs nothing at all.
//
// The generic `url` type pays a Sonnet call because HTML is prose: which title
// goes with which date is a judgement. Here the site already answers that — it
// serves one JSON object per visit — so the mapping is a rename, and the one
// piece of judgement left (the year the site omits) is decided by the weekday it
// publishes, deterministically, in `french-date.ts`.
//
// Worth stating plainly because it is the general lesson: the model is for
// ambiguity, and structured upstream data has none. A source type that finds a
// JSON endpoint should stop calling one.

/**
 * Every walk on this site is a guided art/history tour, so the category is a
 * constant rather than a mapping table over the site's `kind`. Its categories
 * (Musée / Galerie / Balade / En famille) describe the *format* of the visit,
 * not the subject — all four are `art`.
 */
const CATEGORY = "art" as const;

/** Paris-only operator; the API's numeric `city` distinguishes arrondissements, not cities. */
const CITY = "Paris";

export async function extractDmdaVisits(
  payload: DmdaPayload,
): Promise<ExtractionResult> {
  const today = new Date();

  const events = payload.rows.flatMap((row) => {
    // The upstream row genuinely publishes no date. Omitted, exactly as the LLM
    // extractor is told to do with an event whose date it cannot determine —
    // and NOT flagged, because flags report what the date format could not
    // hold, which is a different thing from what the site never said.
    if (row.date === undefined) return [];

    // A date string we cannot READ is the opposite case and must never land
    // here as a skip: `parseFrenchVisitDate` throws. This function returns the
    // source's full current set, so a silently dropped row is one the engine
    // stamps `disappearedAt` on.
    const date = parseFrenchVisitDate(row.date, today);

    return [
      {
        // The site's own stable id. Better than the engine's derived
        // title+day hash for this source: a walk keeps one row as its next
        // date rolls forward, instead of minting a new row per occurrence and
        // burying the last one as disappeared.
        externalId: String(row.id),
        title: row.title,
        date,
        venue: row.location,
        city: CITY,
        url: new URL(row.url, DMDA_ORIGIN).toString(),
        imageUrl: row.picture,
        category: CATEGORY,
      },
    ];
  });

  return { events, flags: [] };
}
