import type {
  ExtractedEvent,
  ExtractionResult,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { ProbeContext } from "@plugins/apps/plugins/events/plugins/events-core/server";
import {
  coworkmeetSessionUrl,
  type CoworkmeetFilterKey,
  type CoworkmeetSourceConfig,
} from "../../core";
import { addressCity } from "./address";
import { sessionDescription } from "./description";
import { facetTags, sessionFacets, type SessionFacets } from "./facets";
import { applyFilters, type FilterOutcome } from "./filters";
import type { CoworkmeetPayload } from "./probe";
import type { SessionRow } from "./rows";
import { sessionDate, type SessionDate } from "./session-date";
import { readCoworkmeetSourceConfig } from "./source-config";

// The "expensive" phase, which for this source type costs nothing at all — the
// third one in this app after `dmda` and `salsanueva`, and for the same reason:
// the model is for AMBIGUITY, and structured upstream data has none. The
// association serves one row per session; there is no judgement about which
// title goes with which date.
//
// What is left is a rename, the configured filter, and the editorial decisions
// below.

/**
 * CoworkMeet is an association loi 1901 whose stated purpose is to break the
 * professional isolation of freelances: the sessions are free, open, and the
 * point of them is the other people in the room. `community` is the arm of the
 * closed category vocabulary that means exactly that.
 *
 * Not `tech` (the room is freelances of every trade, not a meetup about a
 * subject) and not `food` (the café is the venue, not the event). What the venue
 * is like travels in `tags`, which is a filterable dimension of the events list.
 */
const CATEGORY = "community" as const;

/** The filter names as the settings form spells them, so a caveat names what the user sees. */
const FILTER_LABEL: Record<CoworkmeetFilterKey, string> = {
  types: "Session type",
  districts: "Districts",
  ambiances: "Ambiance",
  quietLevels: "Noise level",
  powerOutlets: "Power outlets",
};

/** One session, with everything derived from it that both the filter and the event need. */
interface Session {
  row: SessionRow;
  facets: SessionFacets;
  when: SessionDate;
}

/**
 * The venue as published, with only its whitespace fixed.
 *
 * `Péniche Annette K ` really does carry a trailing space and
 * `Hôtel Mercure Montparnasse****` really does carry its stars. Neither is
 * tidied: the stars are how the hotel names itself, and re-casing
 * `Le NELSON’S` would be this plugin deciding it knows the venue's name better
 * than the person who typed it. Only the whitespace, which is never meaningful.
 */
function venueOf(row: SessionRow): string {
  return row.nom_lieu.replace(/\s+/g, " ").trim();
}

/**
 * What the session is called: the kind of session, then where it is.
 *
 * Unless the venue already says it — the one live afterwork is called
 * `AFTERWORK CoworkMeet`, and `Afterwork — AFTERWORK CoworkMeet` reads as a bug.
 * Matched case-insensitively on the type's own word, which is the only part of
 * the title this rule owns.
 */
function titleOf(venue: string, type: string | undefined): string {
  if (type === undefined) return venue;
  if (venue.toLowerCase().startsWith(type.toLowerCase())) return venue;
  return `${type} — ${venue}`;
}

/**
 * An amount in euros, written the way a price is: `€6` rather than `€6.00`, and
 * `€2.90` rather than `€2.9` — a round number drops its cents, and cents are
 * always written as two digits.
 */
function euros(amount: number): string {
  return Number.isInteger(amount) ? `€${amount}` : `€${amount.toFixed(2)}`;
}

/**
 * What it costs to come: nothing.
 *
 * `prix_conso` is NOT the price of the session — it is what a drink costs at the
 * venue, which is the thing a free session in a café asks of you implicitly.
 * Stated as an aside for exactly that reason: an event that reads `€3.50` would
 * be saying the association charges for it, which it does not.
 */
function priceOf(row: SessionRow): string {
  if (row.prix_conso === null) return "Free";
  return `Free (drinks from ${euros(row.prix_conso)})`;
}

/**
 * Where the session is, when the association's address says.
 *
 * A published `arrondissement` settles it too: an arrondissement is a Paris
 * district by definition, so a session that has one is in Paris even when its
 * address forgot to write the word (`9 Quai de l’Oise 19e, Paris` names no
 * postcode at all).
 *
 * Never defaulted to Paris. One live session is in Pantin, and `city` is
 * optional on an extracted event, so "the address did not say" is a legitimate
 * answer rather than a swallowed failure.
 */
function cityOf(session: Session): string | undefined {
  const fromAddress = addressCity(session.row.adresse_lieu);
  if (fromAddress !== undefined) return fromAddress;
  return session.facets.district === undefined ? undefined : "Paris";
}

function toEvent(session: Session): ExtractedEvent {
  const { row, facets } = session;
  const venue = venueOf(row);
  return {
    // The association's own uuid — the same id its session page is addressed by,
    // and stable as the listing is edited. Better than the engine's derived
    // title+day hash: two sessions can share a venue and a day.
    externalId: row.id,
    title: titleOf(venue, facets.type),
    description: sessionDescription(row),
    date: session.when.date,
    venue,
    city: cityOf(session),
    url: coworkmeetSessionUrl(row.id),
    imageUrl: row.photo_url ?? undefined,
    price: priceOf(row),
    category: CATEGORY,
    // The same words the source's filters select — see `core/internal/catalog.ts`.
    tags: facetTags(facets),
  };
}

/**
 * Everything the run could not say, in the channel that exists for it.
 *
 * Three kinds, all reports on a SUCCESSFUL run:
 *
 * - **Filter values nothing matched** — the loud half of letting a saved
 *   selection outlive the catalogue it was picked from.
 * - **Sessions with no readable district** — measured over the whole window, not
 *   over the survivors, because that is where it matters: a district filter
 *   cannot keep a session whose district nobody published, and counting the
 *   survivors would report zero every time exactly when the filter is on.
 * - **End times rolled past midnight** — a reading, not a fact: the association
 *   published an end at or before the start, and this type read it as running
 *   into the next day.
 */
function buildFlags(
  all: readonly Session[],
  kept: readonly Session[],
  unmatched: FilterOutcome<Session>["unmatched"],
): string[] {
  const flags: string[] = [];

  for (const { key, values } of unmatched) {
    const quoted = values.map((v) => `"${v}"`).join(", ");
    flags.push(
      `The ${FILTER_LABEL[key]} filter selects ${quoted}, which no session in ` +
        `the association's current listing has — nothing was kept for ` +
        `${values.length === 1 ? "it" : "them"}. Re-pick in this source's settings.`,
    );
  }

  const noDistrict = all.filter(
    (session) => session.facets.district === undefined,
  ).length;
  if (noDistrict > 0) {
    flags.push(
      `${noDistrict} ${noDistrict === 1 ? "session publishes" : "sessions publish"} no ` +
        `arrondissement and no Paris postcode, so ${noDistrict === 1 ? "it carries" : "they carry"} ` +
        `no district tag and a Districts filter cannot keep ${noDistrict === 1 ? "it" : "them"}.`,
    );
  }

  const rolled = kept.filter((session) => session.when.rolledOverMidnight);
  if (rolled.length > 0) {
    flags.push(
      `${rolled.length} ${rolled.length === 1 ? "session ends" : "sessions end"} at or before ` +
        `${rolled.length === 1 ? "its" : "their"} own start time (${rolled
          .map(
            (s) =>
              `${s.row.date_session} ${s.row.heure_debut}–${s.row.heure_fin}`,
          )
          .join(", ")}); read as running past midnight into the next day.`,
    );
  }

  return flags;
}

export async function extractCoworkmeetSessions(
  payload: CoworkmeetPayload,
  ctx: ProbeContext<CoworkmeetSourceConfig>,
): Promise<ExtractionResult> {
  // Re-read rather than trust the static type: `ProbeContext.config` is the
  // row's raw jsonb, and this is the phase that indexes into it by key.
  const config = readCoworkmeetSourceConfig(ctx.config);

  const sessions: Session[] = payload.rows.map((row) => ({
    row,
    facets: sessionFacets(row),
    // Throws on a date it cannot read — never a skip. `extract` returns the
    // source's FULL current set, so a silently dropped row is one the engine
    // stamps `disappearedAt` on. See `session-date.ts`.
    when: sessionDate(
      row.date_session,
      row.heure_debut,
      row.heure_fin,
      `session ${row.id}`,
    ),
  }));

  const { kept, unmatched } = applyFilters(sessions, config);
  return {
    events: kept.map(toEvent),
    flags: buildFlags(sessions, kept, unmatched),
  };
}
