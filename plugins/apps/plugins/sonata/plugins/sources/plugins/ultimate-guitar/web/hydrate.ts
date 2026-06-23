import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import type { UgTab } from "../core";
import { getSongUltimateGuitar } from "../shared/endpoints";

/**
 * Hydrate a song's UG source: fetch the persisted `UgTab` and hand it back for
 * `setRawMap` (keyed under `"ultimate-guitar"`). Returns `undefined` for a song
 * that carries no UG tab, so it's skipped in the library's generic collection —
 * and the UG editor section stays hidden for such songs.
 */
export async function hydrate(songId: string): Promise<UgTab | undefined> {
  const tab = await fetchEndpoint(getSongUltimateGuitar, { id: songId });
  return tab ?? undefined;
}
