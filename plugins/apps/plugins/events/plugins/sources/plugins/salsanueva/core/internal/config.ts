import type { FieldsRecord, InferFieldsObject } from "@plugins/fields/core";
import { tagsField } from "@plugins/fields/plugins/tags/plugins/config/core";
import {
  SALSANUEVA_ACTIVITIES,
  SALSANUEVA_COACHES,
  SALSANUEVA_DAYS,
  SALSANUEVA_LEVELS,
  SALSANUEVA_LOCATIONS,
  SALSANUEVA_SUB_ACTIVITIES,
  SALSANUEVA_TYPES,
} from "./catalog";

/** Matches the `event_sources.type` column, the server registration, and the web slot id. */
export const SALSANUEVA_SOURCE_TYPE_ID = "salsanueva";

/** The one site this type reads. Shared so the fetcher and the web link agree. */
export const SALSANUEVA_ORIGIN = "https://salsanueva.fr";

/** The school's own planning page — the human face of the API this type reads. */
export const SALSANUEVA_PLANNING_PATH = "/danses-adultes/planning-adultes/";

/**
 * The dimensions a source filters on — and, not by coincidence, the exact names
 * of the site's own query parameters and of the fields in its courses JSON.
 *
 * One vocabulary for three things (the config keys, the JSON fields, the URL
 * this source links back to) is what lets `originUrl` build a link to the site's
 * own page showing this source's exact subset, generically, with no per-filter
 * code. Renaming a key here breaks that link, so don't — the upstream spelling
 * is the contract.
 */
export const SALSANUEVA_FILTER_KEYS = [
  "type",
  "activity",
  "sub_activity",
  "course_level",
  "location_name",
  "coach",
  "days",
] as const;
export type SalsanuevaFilterKey = (typeof SALSANUEVA_FILTER_KEYS)[number];

/**
 * Said once, appended to every filter's description: an empty selection is the
 * absence of a filter, exactly as an empty dropdown is on the school's own page.
 * The opposite reading ("nothing selected → nothing kept") would make a fresh
 * source silently empty.
 */
const KEEPS_EVERYTHING = "Leave empty to keep every course.";

/**
 * The whole user input for a SalsaNueva source: which courses of the school's
 * one weekly schedule to track. There is no URL field — this type IS this
 * school, and the endpoint it reads is not something a user could point
 * elsewhere.
 *
 * The filters mirror the site's own filter bar one for one, so what you tick
 * here is what you would tick there. They are applied by THIS plugin after the
 * fetch, not by the API — the API takes a date range and nothing else, and the
 * page filters client-side for the same reason.
 *
 * `core/` on purpose — web-safe *and* server-usable, so ONE record both
 * validates the row's `config` jsonb and renders the add/configure form
 * generically. This plugin therefore ships no form code.
 */
export const salsanuevaSourceConfigFields = {
  type: tagsField({
    label: "Audience",
    description: `Adults' or children's courses. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_TYPES],
    // The page this type stands for is the ADULTS' planning, so a source added
    // with the form untouched tracks what its name promises. Every other filter
    // starts empty.
    default: ["Adulte"],
  }),
  activity: tagsField({
    label: "Dances",
    description: `The dance family, as the school lists it. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_ACTIVITIES],
  }),
  sub_activity: tagsField({
    label: "Styles",
    description: `The specific style within a dance. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_SUB_ACTIVITIES],
  }),
  course_level: tagsField({
    label: "Levels",
    description: `Course level, or age bracket for the children's courses. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_LEVELS],
  }),
  location_name: tagsField({
    label: "Schools",
    description: `Which studio. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_LOCATIONS],
  }),
  coach: tagsField({
    label: "Teachers",
    description:
      "Kept when ANY teacher of the course is selected — a course is a weekly " +
      `series and its teacher can change from one week to the next. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_COACHES],
  }),
  days: tagsField({
    label: "Days",
    description: `Which day of the week the course falls on. ${KEEPS_EVERYTHING}`,
    options: [...SALSANUEVA_DAYS],
  }),
} satisfies FieldsRecord & Record<SalsanuevaFilterKey, unknown>;

export type SalsanuevaSourceConfig = InferFieldsObject<
  typeof salsanuevaSourceConfigFields
>;

/**
 * The school's own planning page, showing exactly what this source tracks.
 *
 * The site reads the same parameter names it publishes in its JSON, comma-joined
 * — which is why the config keys are spelled its way. Empty selections are
 * omitted, so an unfiltered source links to the plain page.
 */
export function salsanuevaPlanningUrl(
  filters: Readonly<Record<SalsanuevaFilterKey, readonly string[]>>,
): string {
  const query = new URLSearchParams();
  for (const key of SALSANUEVA_FILTER_KEYS) {
    const values = filters[key];
    if (values.length > 0) query.set(key, values.join(","));
  }
  const search = query.toString();
  const base = `${SALSANUEVA_ORIGIN}${SALSANUEVA_PLANNING_PATH}`;
  return search === "" ? base : `${base}?${search}`;
}
