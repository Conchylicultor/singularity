import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getSongChordGrid } from "../shared/endpoints";
import type { ChordGridRaw } from "./compile";

/**
 * Hydrate a song's chord-grid source: fetch the persisted grid and hand back the
 * `ChordGridRaw` for `setRawMap` (keyed under `"chord-grid"`). Returns `undefined`
 * for a song that carries no chord grid, so it's skipped in the library's generic
 * collection — and so the chord-grid editor section stays hidden for such songs.
 */
export async function hydrate(songId: string): Promise<ChordGridRaw | undefined> {
  const row = await fetchEndpoint(getSongChordGrid, { id: songId });
  if (!row) return undefined;
  return { text: row.chordText, voicingId: row.voicingId, octave: row.octave };
}
