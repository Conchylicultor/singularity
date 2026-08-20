import { useMemo } from "react";
import { useWindowResource } from "@plugins/primitives/plugins/live-state/web";
import { starredPagesResource } from "../../shared/resources";

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

/**
 * The starred page ids of the bounded favorites window.
 *
 * The ONE read of `starredPagesResource`, shared by the `starred` field and both
 * star toggles — so the field and the toggles can never disagree about what is
 * starred, and every mount lands on the same `(key, paramsKey)` tuple (one
 * subscription for the whole app, rather than one per rendered row).
 *
 * `pending` is surfaced rather than folded into the set, because the two callers
 * want different things from it: a toggle reports it so its surface can render a
 * not-known-yet state, while the field deliberately projects an empty set (the
 * rationale is in `starred-field.tsx`).
 */
export function useStarredPageIds(): {
  ids: ReadonlySet<string>;
  pending: boolean;
} {
  const result = useWindowResource(starredPagesResource);
  const ids = useMemo(() => {
    if (result.pending) return EMPTY_IDS;
    return new Set(result.data.map((r) => r.parentId));
  }, [result]);
  return { ids, pending: result.pending };
}
