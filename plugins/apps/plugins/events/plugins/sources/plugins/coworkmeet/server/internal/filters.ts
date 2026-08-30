import {
  COWORKMEET_FILTER_KEYS,
  type CoworkmeetFilterKey,
  type CoworkmeetSourceConfig,
} from "../../core";
import type { SessionFacets } from "./facets";

// The source's filters, applied to sessions already reduced to their facets.
//
// Applied HERE and not upstream: PostgREST could express most of these as query
// parameters, but not the district — which is a column on 14 sessions and a
// postcode inside a free-text address on 51 more — so a server-side filter would
// keep a different set from the one the tags describe. One filter, one place.
//
// Semantics, both halves deliberate:
//   - an empty selection is the ABSENCE of a filter, never "keep nothing";
//   - a session is kept when it matches EVERY non-empty filter, and a filter is
//     matched when ANY of its selected values is the session's.
//
// A session that published nothing on a dimension has no word there, so it
// cannot match a filter on it. That is the correct reading: "sessions in the
// 11th" cannot honestly include one whose district nobody knows.

/**
 * What each filter reads off a session. A total record over the filter keys, so
 * adding a key in `core/` without saying what it compares against is a tsc error
 * rather than a filter that silently keeps everything.
 */
const DIMENSION: Record<
  CoworkmeetFilterKey,
  (f: SessionFacets) => string | undefined
> = {
  types: (f) => f.type,
  districts: (f) => f.district,
  ambiances: (f) => f.ambiance,
  quietLevels: (f) => f.quietLevel,
  powerOutlets: (f) => f.powerOutlets,
};

export interface FilterOutcome<T> {
  /** The sessions that matched every non-empty filter, in input order. */
  kept: T[];
  /**
   * Selected values that no session in this window has, as `key` → values.
   *
   * Reported rather than ignored because it is the one thing the config form
   * cannot know: `tagsField` accepts any string precisely so a re-copied
   * catalogue cannot invalidate a saved selection, which leaves "this value is
   * extinct" knowable only here, against real data.
   */
  unmatched: { key: CoworkmeetFilterKey; values: string[] }[];
}

export function applyFilters<T extends { facets: SessionFacets }>(
  sessions: readonly T[],
  config: CoworkmeetSourceConfig,
): FilterOutcome<T> {
  const kept = sessions.filter((session) =>
    COWORKMEET_FILTER_KEYS.every((key) => {
      const selected = config[key];
      if (selected.length === 0) return true;
      const value = DIMENSION[key](session.facets);
      return value !== undefined && selected.includes(value);
    }),
  );

  const unmatched: FilterOutcome<T>["unmatched"] = [];
  for (const key of COWORKMEET_FILTER_KEYS) {
    const selected = config[key];
    if (selected.length === 0) continue;
    // Against the WHOLE window, not against `kept`: a value is extinct when the
    // association publishes no session with it at all. Testing it against the
    // survivors would flag every value that merely lost to another filter — two
    // districts ticked together would each report the other as missing.
    const available = new Set(
      sessions
        .map((session) => DIMENSION[key](session.facets))
        .filter((value): value is string => value !== undefined),
    );
    const missing = selected.filter((value) => !available.has(value));
    if (missing.length > 0) unmatched.push({ key, values: missing });
  }

  return { kept, unmatched };
}
