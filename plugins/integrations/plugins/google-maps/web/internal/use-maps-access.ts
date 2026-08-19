import { useAuthState } from "@plugins/auth/web";
import { GOOGLE_MAPS_PROVIDER_ID } from "@plugins/auth/plugins/google-maps/core";

/**
 * The ONE thing standing between the user and working Google Maps lookups.
 * Consumers branch on this rather than re-deriving a precedence, so every Maps
 * surface offers the same next step and `MapsAccessAction` can render it.
 *
 * There is exactly one arm today — an api-key provider has no scope ladder to
 * climb, unlike Gmail's disabled → disconnected → scopes. It stays a named union
 * so a second prerequisite (a separate public Embed key, when the live map
 * lands) is an added arm rather than a reshaped API.
 */
export type MapsAccessBlocker = "not-configured";

export interface MapsAccess {
  /** An API key has been stored and verified. */
  configured: boolean;
  /** Same as `configured` — nothing else gates a Maps call today. */
  ready: boolean;
  /** The auth state has not arrived yet — distinct from "arrived, no such provider". */
  loading: boolean;
  /** The next unmet prerequisite, or null when ready (or still loading). */
  blocker: MapsAccessBlocker | null;
}

export function useMapsAccess(): MapsAccess {
  // Read the whole auth state rather than `useAccountStatus`, which answers
  // `null` for TWO different questions: "the state has not arrived yet" and
  // "the state arrived and names no such provider". Collapsing them leaves a
  // surface loading forever whenever the provider is genuinely absent — which
  // is the normal case in an agent worktree, where central runs main's code and
  // therefore does not know a provider added on a branch. `pending` is the only
  // honest source for "not yet".
  const state = useAuthState();
  const loading = state.pending;
  // For an api-key provider `connected` is true from the moment a key is stored
  // and nothing ever marks it stale — the refresh loop skips non-oauth2
  // providers. A key revoked in the Google console therefore still reads
  // "configured" here; the failure shows up as a loud PlacesApiError instead.
  const configured = loading
    ? false
    : (state.data.providers[GOOGLE_MAPS_PROVIDER_ID]?.connected ?? false);

  return {
    configured,
    ready: configured,
    loading,
    blocker: !loading && !configured ? "not-configured" : null,
  };
}
