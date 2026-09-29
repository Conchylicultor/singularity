import { useMemo } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import {
  mapResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { starredPages } from "../../shared/resources";

/** The favorites: not known yet, failed, or the starred page ids. */
export type StarredPageIds = ResourceResult<ReadonlySet<string>>;

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
  return useMemo(
    () =>
      mapResource(
        result,
        (rows): ReadonlySet<string> => new Set(rows.map((r) => r.blockId)),
      ),
    [result],
  );
}
