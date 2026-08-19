import type { PlaceData, PlaceSnapshot } from "./schemas";

/**
 * How long a resolved snapshot stays usable before the block silently
 * re-resolves it.
 *
 * This constant encodes a CACHING TERM, not a UX preference. A place's identity
 * (its `placeId`) may be stored indefinitely; its display fields and
 * coordinates are cached provider content with a 30-day ceiling. Keep it one
 * named constant with this comment attached — see
 * `research/2026-08-18-global-place-block-google-maps.md`.
 */
export const PLACE_SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * What the block's stored snapshot is worth right now.
 *
 * - `missing` — nothing to render; the card has no content yet.
 * - `stale` — there IS content, and it must be refreshed. The card keeps
 *   rendering it while the refresh runs; a stale address is worth far more to a
 *   reader than a blank box.
 * - `fresh` — render it and ask the provider nothing.
 *
 * Three values rather than a boolean because the two non-fresh cases render
 * differently, and collapsing them is exactly how a stale card ends up blanked.
 */
export type PlaceSnapshotState = "missing" | "stale" | "fresh";

/** Pure: classify a block's stored snapshot against a clock reading. */
export function placeSnapshotState(
  data: Pick<PlaceData, "name" | "fetchedAt">,
  now: number,
): PlaceSnapshotState {
  if (data.name === undefined || data.name === "") return "missing";
  // No stamp = an age nobody can vouch for: hand-written markdown, or a paste
  // from a document written a year ago. "Unknown" is treated as expired, never
  // as brand-new — the refresh is cheap and being silently a year wrong is not.
  if (data.fetchedAt === undefined) return "stale";
  const age = now - data.fetchedAt;
  // A stamp from the future is a clock we do not trust. Re-resolve rather than
  // hold the snapshot for however long the skew happens to last.
  if (age < 0) return "stale";
  return age >= PLACE_SNAPSHOT_TTL_MS ? "stale" : "fresh";
}

/** Pure: should the block ask its provider for a snapshot? */
export function placeNeedsResolve(
  data: Pick<PlaceData, "name" | "fetchedAt">,
  now: number,
): boolean {
  return placeSnapshotState(data, now) !== "fresh";
}

/**
 * Pure: the block `data` a freshly resolved snapshot becomes.
 *
 * The whole payload is REPLACED rather than merged: the snapshot is the
 * provider's current answer in full, so carrying over a field it no longer
 * returns (a category the place dropped) would leave the card asserting
 * something the provider stopped saying.
 */
export function placeDataFromSnapshot(
  providerId: string,
  snapshot: PlaceSnapshot,
  now: number,
): PlaceData {
  return {
    providerId,
    placeId: snapshot.placeId,
    name: snapshot.name,
    address: snapshot.address,
    category: snapshot.category,
    mapsUrl: snapshot.mapsUrl,
    lat: snapshot.lat,
    lng: snapshot.lng,
    fetchedAt: now,
  };
}
