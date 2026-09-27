import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { starredPages } from "../../shared/resources";

/** The favorites: not known yet, or the starred page ids. */
export type StarredPageIds =
  { pending: true } | { pending: false; ids: ReadonlySet<string> };

/**
 * The starred page ids of the bounded favorites window.
 *
 * The ONE read of `starredPages`, shared by the `starred` field and both star
 * toggles — so the field and the toggles can never disagree about what is
 * starred, and every mount lands on the same default-window tuple (one
 * subscription for the whole app, rather than one per rendered row).
 *
 * Not known yet is its own arm, never an empty set: the two callers want
 * different things from it. A toggle renders a not-known-yet state (a hollow
 * star would claim "not a favorite"), while the field deliberately projects an
 * empty set (the rationale is in `starred-field.tsx`) — each decides at its own
 * call site.
 */
export function useStarredPageIds(): StarredPageIds {
  const result = useLive(starredPages);
  return useMemo(() => {
    if (result.pending) return { pending: true };
    return { pending: false, ids: new Set(result.data.map((r) => r.blockId)) };
  }, [result]);
}
