import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { resetTrackView, upsertTrackView } from "../shared/endpoints";

// Fire-and-forget writes: the UI never reads the response — state refreshes via
// the live-state push that `notify()` emits server-side. `void` keeps the
// no-floating-promises rule satisfied while a genuine network failure still
// surfaces loudly as an unhandled rejection (reported by the crashes plugin).

export function setTrackColor(
  songId: string,
  trackId: string,
  color: string | null,
): void {
  void fetchEndpoint(
    upsertTrackView,
    { songId },
    { body: { trackIds: [trackId], color } },
  );
}

export function setTrackInstrument(
  songId: string,
  trackId: string,
  instrumentId: string | null,
): void {
  void fetchEndpoint(
    upsertTrackView,
    { songId },
    { body: { trackIds: [trackId], instrument: instrumentId } },
  );
}

export function setTrackMuted(
  songId: string,
  trackId: string,
  muted: boolean,
): void {
  void fetchEndpoint(
    upsertTrackView,
    { songId },
    { body: { trackIds: [trackId], muted } },
  );
}

export function setTrackHidden(
  songId: string,
  trackId: string,
  hidden: boolean,
): void {
  void fetchEndpoint(
    upsertTrackView,
    { songId },
    { body: { trackIds: [trackId], hidden } },
  );
}

/**
 * Activate or deactivate a whole set of tracks at once — "active" being the
 * pair the mixer's two toggles govern together: visible in the displays AND
 * audible in the scheduler. One patch, one transaction, one live-state push.
 * The sanctioned cross-plugin way to flip an arrangement (chord mode turns the
 * original tracks off on entry and back on on exit).
 *
 * Unlike the single-track setters this RETURNS the write's promise: a caller
 * that swaps one layer of sound for another sequences on it (deactivate the
 * originals, THEN bring in the chord tracks), so the listener never hears both
 * layers doubled. Awaiting it is the caller's choice; a dropped promise still
 * surfaces a network failure loudly as an unhandled rejection.
 */
export function setTracksActive(
  songId: string,
  trackIds: readonly string[],
  active: boolean,
): Promise<void> {
  return fetchEndpoint(
    upsertTrackView,
    { songId },
    { body: { trackIds: [...trackIds], hidden: !active, muted: !active } },
  );
}

export function resetTrackViews(songId: string): void {
  void fetchEndpoint(resetTrackView, { songId });
}
