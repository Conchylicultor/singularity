import type { FieldsRecord, InferFieldsObject } from "@plugins/fields/core";
import { tagsField } from "@plugins/fields/plugins/tags/plugins/config/core";
import {
  COWORKMEET_AMBIANCES,
  COWORKMEET_DISTRICTS,
  COWORKMEET_POWER_OUTLETS,
  COWORKMEET_QUIET_LEVELS,
  COWORKMEET_SESSION_TYPES,
  facetLabels,
} from "./catalog";

/** Matches the `event_sources.type` column, the server registration, and the web slot id. */
export const COWORKMEET_SOURCE_TYPE_ID = "coworkmeet";

/** The one site this type reads. Shared so the fetcher and the web link agree. */
export const COWORKMEET_ORIGIN = "https://www.coworkmeet.fr";

/**
 * The dimensions a source filters on.
 *
 * Our own names, not the API's — deliberately unlike `salsanueva`, whose config
 * keys are the site's spelling because it rebuilds the site's own filtered URL
 * from them. CoworkMeet's listing has no filter-bar URL grammar to rebuild, so
 * there is nothing for an upstream key name to line up with, and English plural
 * names read better beside the English field labels.
 */
export const COWORKMEET_FILTER_KEYS = [
  "types",
  "districts",
  "ambiances",
  "quietLevels",
  "powerOutlets",
] as const;
export type CoworkmeetFilterKey = (typeof COWORKMEET_FILTER_KEYS)[number];

/**
 * Said once, appended to every filter's description: an empty selection is the
 * absence of a filter. The opposite reading ("nothing selected → nothing kept")
 * would make a source added with the form untouched silently empty — and every
 * filter here starts empty, so that is the case that matters.
 */
const KEEPS_EVERYTHING = "Leave empty to keep every session.";

/**
 * Said on the four filters whose dimension the association does not always
 * publish: roughly half the live sessions rate their venue, and an unrated
 * session carries no tag on that dimension — so it cannot match a filter on it.
 */
const ONLY_RATED = "Sessions the association did not rate are not kept.";

/**
 * The whole user input for a CoworkMeet source: which of the association's free
 * coworking sessions to track. There is no URL field — this type IS this
 * association, and the endpoint it reads is not something a user could point
 * elsewhere.
 *
 * Every option value below comes from `catalog.ts`, which is also where the
 * extractor reads the tags it emits. That is the invariant this source is built
 * on: **what you tick here is the tag you can filter by in the events list.**
 *
 * `core/` on purpose — web-safe *and* server-usable, so ONE record both
 * validates the row's `config` jsonb and renders the add/configure form
 * generically. This plugin therefore ships no form code.
 */
export const coworkmeetSourceConfigFields = {
  types: tagsField({
    label: "Session type",
    description: `A working session or an afterwork. ${KEEPS_EVERYTHING}`,
    options: facetLabels(COWORKMEET_SESSION_TYPES),
  }),
  districts: tagsField({
    label: "Districts",
    description:
      "Which Paris arrondissement the venue is in. Sessions outside Paris, and " +
      `the rare one whose address names no district, are not kept. ${KEEPS_EVERYTHING}`,
    options: facetLabels(COWORKMEET_DISTRICTS),
  }),
  ambiances: tagsField({
    label: "Ambiance",
    description: `Heads-down or sociable, as the association rates it. ${ONLY_RATED} ${KEEPS_EVERYTHING}`,
    options: facetLabels(COWORKMEET_AMBIANCES),
  }),
  quietLevels: tagsField({
    label: "Noise level",
    description: `How quiet the venue is, as the association rates it. ${ONLY_RATED} ${KEEPS_EVERYTHING}`,
    options: facetLabels(COWORKMEET_QUIET_LEVELS),
  }),
  powerOutlets: tagsField({
    label: "Power outlets",
    description: `How easy a socket is to find, as the association rates it. ${ONLY_RATED} ${KEEPS_EVERYTHING}`,
    options: facetLabels(COWORKMEET_POWER_OUTLETS),
  }),
} satisfies FieldsRecord & Record<CoworkmeetFilterKey, unknown>;

export type CoworkmeetSourceConfig = InferFieldsObject<
  typeof coworkmeetSourceConfigFields
>;

/**
 * The association's own page for one session, which is where an event links to.
 *
 * The listing is client-rendered but this page is a real, linkable route — the
 * id in it is the same uuid this type uses as `externalId`.
 */
export function coworkmeetSessionUrl(id: string): string {
  return `${COWORKMEET_ORIGIN}/session/${id}`;
}
