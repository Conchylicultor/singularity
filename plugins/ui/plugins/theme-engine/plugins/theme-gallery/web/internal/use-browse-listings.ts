import {
  ThemeEngine,
  type ThemeSourceContribution,
  type ThemeSourceEntry,
  type ThemeSourceFailure,
} from "@plugins/ui/plugins/theme-engine/web";
import type { BrowseListing } from "./theme-rows";

export type BrowseState =
  | { pending: true }
  | {
      pending: false;
      /** Every browse source that answered — a failed one's last-known entries included. */
      listings: readonly BrowseListing[];
      /** Browse sources whose catalog read FAILED, to render with Retry. */
      failures: readonly ThemeSourceFailure[];
    };

const BROWSE_PENDING: BrowseState = { pending: true };
const NO_ENTRIES: readonly ThemeSourceEntry[] = [];

/**
 * Every browse source's catalog. Pending while any of them is still loading:
 * a catalog that has not arrived is not an empty one, and a gallery showing it
 * as empty would be a claim about the catalog that then reverses itself. A
 * FAILED catalog settles instead — with its last-known entries, if any — and
 * is listed in `failures`, so the gallery shows every other theme and says
 * which catalog could not be read rather than spinning forever.
 *
 * The state is the SAME object for as long as every source's read is —
 * the `useThemes` precedent — so the rows built from it can be memoized on it.
 */
export function useBrowseListings(): BrowseState {
  const sources = ThemeEngine.ThemeSource.useContributions();
  // ThemeSource contributions are static slot entries; the count never
  // changes, so calling each browse source's hook here keeps hook order stable.
  const reads = sources.flatMap((s) =>
    s.kind === "browse" ? [{ id: s.id, read: s.useEntries() }] : [],
  );
  const known: (readonly ThemeSourceEntry[])[] = [];
  const failures: ThemeSourceFailure[] = [];
  for (const { id, read } of reads) {
    switch (read.status) {
      case "loading":
        return BROWSE_PENDING;
      case "error":
        known.push(read.stale ?? NO_ENTRIES);
        failures.push({
          sourceId: id,
          error: read.error,
          refetch: read.refetch,
        });
        break;
      case "ready":
        known.push(read.data);
    }
  }
  return browseStateOf(sources, known, failures);
}

// The last state built per contribution list, with the entry lists and
// failures it came from: reused while every one is the same object.
const builtStates = new WeakMap<
  readonly ThemeSourceContribution[],
  {
    lists: readonly (readonly ThemeSourceEntry[])[];
    failures: readonly ThemeSourceFailure[];
    state: BrowseState;
  }
>();

function browseStateOf(
  sources: readonly ThemeSourceContribution[],
  lists: readonly (readonly ThemeSourceEntry[])[],
  failures: readonly ThemeSourceFailure[],
): BrowseState {
  const built = builtStates.get(sources);
  if (
    built &&
    built.lists.length === lists.length &&
    built.lists.every((list, i) => list === lists[i]) &&
    built.failures.length === failures.length &&
    built.failures.every(
      (f, i) =>
        f.error === failures[i]!.error && f.refetch === failures[i]!.refetch,
    )
  ) {
    return built.state;
  }
  const browseIds = sources.flatMap((s) => (s.kind === "browse" ? [s.id] : []));
  const state: BrowseState = {
    pending: false,
    listings: lists.map((entries, i) => ({ sourceId: browseIds[i]!, entries })),
    failures,
  };
  builtStates.set(sources, { lists, failures, state });
  return state;
}
