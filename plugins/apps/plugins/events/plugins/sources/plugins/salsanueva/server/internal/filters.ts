import {
  SALSANUEVA_FILTER_KEYS,
  type SalsanuevaFilterKey,
  type SalsanuevaSourceConfig,
} from "../../core";
import { frenchDayOf, type CourseSeries } from "./series";

// The source's filters, applied to already-grouped courses.
//
// Applied HERE and not upstream because the API takes a date range and nothing
// else — which is also why the school's own page filters client-side. Applied to
// SERIES and not to raw occurrences because a series is what this type
// publishes: "kept when any of its teachers is selected" is only expressible
// once the occurrences are back together.
//
// Semantics, both halves deliberate:
//   - an empty selection is the ABSENCE of a filter (same as an untouched
//     dropdown on the school's page), never "keep nothing";
//   - a course is kept when it matches EVERY non-empty filter, and a filter is
//     matched when ANY of its selected values is one of the course's.

/**
 * What each filter reads off a course. A total record over the filter keys, so
 * adding a key in `core/` without saying what it compares against is a tsc
 * error rather than a filter that silently keeps everything.
 */
const DIMENSION: Record<SalsanuevaFilterKey, (s: CourseSeries) => string[]> = {
  type: (s) => [s.key.type],
  activity: (s) => [s.key.activity],
  sub_activity: (s) => [s.key.sub_activity],
  course_level: (s) => [s.key.course_level],
  location_name: (s) => [s.key.location_name],
  coach: (s) => s.coaches,
  // The one filter whose stored value is not upstream text: the school's page
  // spells its days in French, and this source keeps that spelling so the link
  // back to the page carries the user's own selection verbatim.
  days: (s) => [frenchDayOf(s.key.weekday)],
};

export interface FilterOutcome {
  /** The courses that matched every non-empty filter, in input order. */
  kept: CourseSeries[];
  /**
   * Selected values that no course in this window has, as `key` → values.
   *
   * Reported rather than ignored because it is the one thing the config form
   * cannot know: `tagsField` accepts any string precisely so a re-copied
   * catalogue cannot invalidate a saved selection, which leaves "this value is
   * extinct" knowable only here, against real data.
   */
  unmatched: { key: SalsanuevaFilterKey; values: string[] }[];
}

export function applyFilters(
  series: readonly CourseSeries[],
  config: SalsanuevaSourceConfig,
): FilterOutcome {
  const kept = series.filter((s) =>
    SALSANUEVA_FILTER_KEYS.every((key) => {
      const selected = config[key];
      if (selected.length === 0) return true;
      return DIMENSION[key](s).some((value) => selected.includes(value));
    }),
  );

  const unmatched: FilterOutcome["unmatched"] = [];
  for (const key of SALSANUEVA_FILTER_KEYS) {
    const selected = config[key];
    if (selected.length === 0) continue;
    // Against the WHOLE window, not against `kept`: a value is extinct when the
    // school no longer publishes it at all. Testing it against the survivors
    // would flag every value that merely lost to another filter — "Bachata" and
    // "Salsa" ticked together would each report the other as missing.
    const available = new Set(series.flatMap((s) => DIMENSION[key](s)));
    const missing = selected.filter((value) => !available.has(value));
    if (missing.length > 0) unmatched.push({ key, values: missing });
  }

  return { kept, unmatched };
}
