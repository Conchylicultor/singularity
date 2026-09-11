import {
  ThemeEngine,
  type ThemeSourceContribution,
  type ThemeSourceEntry,
} from "@plugins/ui/plugins/theme-engine/web";
import type { BrowseListing } from "./theme-rows";

export type BrowseState =
  { pending: true } | { pending: false; listings: readonly BrowseListing[] };

const BROWSE_PENDING: BrowseState = { pending: true };

/**
 * Every browse source's catalog. Pending while any of them is still loading:
 * a catalog that has not arrived is not an empty one, and a gallery showing it
 * as empty would be a claim about the catalog that then reverses itself.
 *
 * The state is the SAME object for as long as every source's entry list is —
 * the `useThemes` precedent — so the rows built from it can be memoized on it.
 */
export function useBrowseListings(): BrowseState {
  const sources = ThemeEngine.ThemeSource.useContributions();
  // ThemeSource contributions are static slot entries; the count never
  // changes, so calling each browse source's hook here keeps hook order stable.
  const lists = sources.flatMap((s) =>
    s.kind === "browse" ? [s.useEntries()] : [],
  );
  const known: (readonly ThemeSourceEntry[])[] = [];
  for (const entries of lists) {
    if (entries === undefined) return BROWSE_PENDING;
    known.push(entries);
  }
  return browseStateOf(sources, known);
}

// The last state built per contribution list, with the entry lists it came
// from: reused while every list is the same object.
const builtStates = new WeakMap<
  readonly ThemeSourceContribution[],
  { lists: readonly (readonly ThemeSourceEntry[])[]; state: BrowseState }
>();

function browseStateOf(
  sources: readonly ThemeSourceContribution[],
  lists: readonly (readonly ThemeSourceEntry[])[],
): BrowseState {
  const built = builtStates.get(sources);
  if (
    built &&
    built.lists.length === lists.length &&
    built.lists.every((list, i) => list === lists[i])
  ) {
    return built.state;
  }
  const browseIds = sources.flatMap((s) => (s.kind === "browse" ? [s.id] : []));
  const state: BrowseState = {
    pending: false,
    listings: lists.map((entries, i) => ({ sourceId: browseIds[i]!, entries })),
  };
  builtStates.set(sources, { lists, state });
  return state;
}
