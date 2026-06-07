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
  void fetchEndpoint(upsertTrackView, { songId }, { body: { trackId, color } });
}

export function setTrackMuted(
  songId: string,
  trackId: string,
  muted: boolean,
): void {
  void fetchEndpoint(upsertTrackView, { songId }, { body: { trackId, muted } });
}

export function setTrackHidden(
  songId: string,
  trackId: string,
  hidden: boolean,
): void {
  void fetchEndpoint(upsertTrackView, { songId }, { body: { trackId, hidden } });
}

export function resetTrackViews(songId: string): void {
  void fetchEndpoint(resetTrackView, { songId });
}
