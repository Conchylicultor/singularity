import type {
  ExtractedEvent,
  ExtractionResult,
} from "@plugins/apps/plugins/events/plugins/events-core/core";
import type { ProbeContext } from "@plugins/apps/plugins/events/plugins/events-core/server";
import {
  salsanuevaPlanningUrl,
  type SalsanuevaFilterKey,
  type SalsanuevaSourceConfig,
} from "../../core";
import { courseDescription } from "./description";
import { applyFilters, type FilterOutcome } from "./filters";
import type { SalsanuevaPayload } from "./probe";
import { frenchDayOf, type CourseSeries } from "./series";
import { readSalsanuevaSourceConfig } from "./source-config";

// The "expensive" phase, which for this source type costs nothing at all — the
// second one in this app after `dmda`, and for the same reason: the model is for
// AMBIGUITY, and structured upstream data has none. The school serves one JSON
// object per course occurrence; there is no judgement left about which title
// goes with which date.
//
// What is left is a rename, the configured filter, and the one editorial
// decision below.

/**
 * A dance class is a thing you go and DO, weekly, in a studio — not a
 * performance you attend. Of the closed category vocabulary, `sport` is the arm
 * that means recurring physical practice; `art` in this app already means going
 * to look at art (it is what `dmda`'s guided visits use).
 *
 * The dance itself is not lost by that choice: it travels in `tags`, which is a
 * filterable dimension of the events list.
 */
const CATEGORY = "sport" as const;

/** The filter names as the settings form spells them, so a caveat names what the user sees. */
const FILTER_LABEL: Record<SalsanuevaFilterKey, string> = {
  type: "Audience",
  activity: "Dances",
  sub_activity: "Styles",
  course_level: "Levels",
  location_name: "Schools",
  coach: "Teachers",
  days: "Days",
};

/**
 * The town after the postcode, up to the next comma or the end — the two
 * spellings the school actually uses are `10 rue Erard 75012 PARIS` and
 * `32 Rue du Capitaine Marchal, 75020 Paris, France`.
 */
const ADDRESS_CITY = /\b\d{5}[,\s]+([^,]+?)\s*(?:,|$)/u;

/**
 * The city, claimed only when the studio's own address states one.
 *
 * Omitted rather than defaulted to Paris: both studios are in Paris today, and a
 * constant would keep saying so after the school opens somewhere else. `city` is
 * optional on an extracted event, so "the address did not say" is a legitimate
 * answer rather than a swallowed failure.
 */
function cityOf(series: CourseSeries): string | undefined {
  const match = ADDRESS_CITY.exec((series.first.location.address ?? "").trim());
  if (match === null) return undefined;
  // The school shouts one of them (`PARIS`) and title-cases the other.
  return match[1]!
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Where the course is: the studio and the room.
 *
 * The room label the school publishes already begins with the studio today
 * (`SalsaNueva 20è - HALL 3`), so prefixing it unconditionally reads as a
 * stutter — but a room renamed without that prefix must not lose the studio.
 * Whitespace is collapsed because the school's own labels carry double spaces.
 */
function venueOf(series: CourseSeries): string {
  const room = series.key.classroom.replace(/\s+/g, " ").trim();
  const studio = series.key.location_name;
  return room.startsWith(studio) ? room : `${studio} — ${room}`;
}

/**
 * What the course is called: the style and the level, the two things that tell
 * one line of the school's planning from the next. The studio and the day are
 * their own columns on an event row, so they stay out of it.
 *
 * `activity` is dropped when the style repeats it — the school files `Afro`
 * under `Afro`, and "Afro · Afro · Ts niveaux" reads as a bug.
 */
function titleOf(series: CourseSeries): string {
  const { sub_activity, activity, course_level } = series.key;
  const style =
    sub_activity === activity ? activity : `${activity} · ${sub_activity}`;
  return `${style} · ${course_level}`;
}

/**
 * The dimensions the user filtered on, carried onto the event so they can filter
 * again. De-duplicated: the school files several dances under their own name
 * (`Afro` → `Afro`), and one tag written twice is a chip drawn twice.
 */
function tagsOf(series: CourseSeries): string[] {
  return [
    ...new Set([
      series.key.type,
      series.key.activity,
      series.key.sub_activity,
      series.key.course_level,
      series.key.location_name,
      frenchDayOf(series.key.weekday),
      ...series.coaches,
    ]),
  ];
}

/**
 * The link a course points at: the school's own planning page, filtered down to
 * this one course.
 *
 * Not the booking link on the occurrence row (`course_purchase`), which names a
 * single calendar slot — this event is the whole SERIES, so a link to one of its
 * evenings would be wrong every week but one.
 *
 * That this can be built at all is the payoff of spelling the config keys the
 * site's way: the same names are its query parameters, its JSON fields, and this
 * source's filters.
 */
function urlOf(series: CourseSeries): string {
  return salsanuevaPlanningUrl({
    type: [series.key.type],
    activity: [series.key.activity],
    sub_activity: [series.key.sub_activity],
    course_level: [series.key.course_level],
    location_name: [series.key.location_name],
    days: [frenchDayOf(series.key.weekday)],
    // Left open: the teacher of a given week is not what identifies the course,
    // and pinning it would hide the course on a week someone stands in.
    coach: [],
  });
}

function toEvent(series: CourseSeries): ExtractedEvent {
  return {
    // The series' own derived id, not the engine's title+rule fallback: the same
    // course runs at both studios at the same hour, and only an id carrying the
    // studio keeps them two rows. See `series.ts`.
    externalId: series.externalId,
    title: titleOf(series),
    description: courseDescription(series.first.description),
    date: series.date,
    venue: venueOf(series),
    city: cityOf(series),
    url: urlOf(series),
    imageUrl: series.first.image,
    category: CATEGORY,
    tags: tagsOf(series),
  };
}

/**
 * Everything the run could not say, in the channel that exists for it.
 *
 * Two kinds, both reports on a SUCCESSFUL run:
 *
 * - **Weeks the school does not run** — school and public holidays. The weekly
 *   rule has no vocabulary for "except these dates", and `event-date`'s own
 *   instruction for a schedule it cannot express exactly is to publish the
 *   series and flag the shortfall. Aggregated by DATE, not by course: 17 courses
 *   pausing on Armistice Day is one fact, not seventeen.
 * - **Filter values nothing matched** — the loud half of letting a saved
 *   selection outlive the catalogue it was picked from. A value that has left
 *   the school's vocabulary would otherwise show up only as a source quietly
 *   returning less than the user thinks it does.
 */
function buildFlags(
  kept: readonly CourseSeries[],
  unmatched: FilterOutcome["unmatched"],
): string[] {
  const byDay = new Map<string, number>();
  for (const series of kept) {
    for (const day of series.skipped) {
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
  }

  const flags = [...byDay]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([day, count]) =>
        `${count} ${count === 1 ? "course does" : "courses do"} not run on ${day} ` +
        `(school or public holiday). Each is still published as its weekly series: ` +
        `the date format states a rule and has no way to state an exception to it.`,
    );

  for (const { key, values } of unmatched) {
    const quoted = values.map((v) => `"${v}"`).join(", ");
    flags.push(
      `The ${FILTER_LABEL[key]} filter selects ${quoted}, which the school's ` +
        `current schedule does not offer — nothing was kept for ` +
        `${values.length === 1 ? "it" : "them"}. Re-pick in this source's settings.`,
    );
  }

  return flags;
}

export async function extractSalsanuevaCourses(
  payload: SalsanuevaPayload,
  ctx: ProbeContext<SalsanuevaSourceConfig>,
): Promise<ExtractionResult> {
  // Re-read rather than trust the static type: `ProbeContext.config` is the
  // row's raw jsonb, and this is the phase that indexes into it by key.
  const config = readSalsanuevaSourceConfig(ctx.config);
  const { kept, unmatched } = applyFilters(payload.series, config);
  return {
    events: kept.map(toEvent),
    flags: buildFlags(kept, unmatched),
  };
}
