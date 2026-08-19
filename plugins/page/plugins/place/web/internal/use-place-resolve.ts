import { useEffect, useRef, useState } from "react";
import {
  fetchEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import {
  placeNeedsResolve,
  placeResolveEndpoint,
  type PlaceData,
  type PlaceSnapshot,
} from "../../core";

export interface UsePlaceResolveArgs {
  providerId: string | undefined;
  placeId: string | undefined;
  /**
   * The block's stored snapshot fields. The hook — not the caller — decides
   * whether they need refreshing, because that decision reads the clock and a
   * component may not do that while rendering.
   */
  snapshot: Pick<PlaceData, "name" | "fetchedAt">;
  /** The current search-round token, handed to the provider with the request. */
  session: string;
  /**
   * Called once, with the provider that answered and its answer. The provider
   * id is handed BACK rather than re-read by the caller: it is the id this hook
   * actually asked, so the write can never stamp a snapshot with a different
   * one, and the caller needs no non-null assertion to name it.
   */
  onResolved: (providerId: string, snapshot: PlaceSnapshot) => void;
}

/**
 * Resolve one place, at most once per place. Called UNCONDITIONALLY from every
 * render state — the hook itself decides whether there is anything to ask — so
 * the block's three states share one hook order.
 *
 * The returned `error` is rendered by the caller and never swallowed: a
 * provider that could not answer is a card that says so, next to whatever
 * snapshot it already had.
 */
export function usePlaceResolve({
  providerId,
  placeId,
  snapshot,
  session,
  onResolved,
}: UsePlaceResolveArgs): { error: string | null } {
  const [error, setError] = useState<string | null>(null);
  // Guard against a double-resolve — React StrictMode double-mounts, and a
  // re-render while the request is in flight would otherwise fire a second one.
  // Keyed on the place, so replacing the place resolves again.
  const startedRef = useRef<string | null>(null);

  const { name, fetchedAt } = snapshot;

  useEffect(() => {
    // The clock is read HERE, inside the effect, and never during render: "is
    // this snapshot expired" is a question about `now`, and a component that
    // asks it while rendering produces a different answer depending on when
    // React happens to re-render it. The honest trade is that a snapshot which
    // expires while the page sits open refreshes on the next mount or edit
    // rather than mid-view — a month-old address is not worth a render-loop.
    const needsResolve = placeNeedsResolve({ name, fetchedAt }, Date.now());
    if (!needsResolve || providerId === undefined || placeId === undefined) {
      // Nothing to ask right now. Clearing the key is what lets a snapshot that
      // goes stale under a long-lived mount refresh itself; it cannot loop,
      // because a successful resolve stamps `fetchedAt`, which keeps this branch
      // taken for the whole TTL.
      startedRef.current = null;
      return;
    }
    if (startedRef.current === placeId) return;
    startedRef.current = placeId;
    setError(null);

    async function run(provider: string, place: string) {
      try {
        const resolved = await fetchEndpoint(
          placeResolveEndpoint,
          {},
          { query: { providerId: provider, placeId: place, session } },
        );
        onResolved(provider, resolved);
      } catch (e) {
        // Fail loud: surface the provider's own reason. The key stays set, so
        // this does not retry in a loop — a remount or a replaced place does.
        setError(getEndpointErrorMessage(e));
      }
    }
    void run(providerId, placeId);
  }, [name, fetchedAt, providerId, placeId, session, onResolved]);

  return { error };
}
