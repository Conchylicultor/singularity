import { db } from "@plugins/database/server";
import { _songs } from "./tables";

export interface CreateSongRowInput {
  /** Optional stable id (e.g. a starter's seed id). Defaults to a random UUID. */
  id?: string;
  title: string;
  composer: string | null;
  durationSec: number;
  endBeat: number;
  /**
   * Opaque id of the source creating this song (its `Library.Source` /
   * `Sonata.Source` id, e.g. `"midi"`). Required — every song has exactly one
   * immutable source. The library stores it verbatim without interpreting it, so
   * a new source needs no change here.
   */
  source: string;
}

/**
 * The generic, source-agnostic way to create a `sonata_songs` row. A song is
 * always created *by a source* (which also persists its own raw into its
 * extension table); this owns only the generic metadata write + the reactive
 * `songsResource` push, so the library never learns about any source.
 *
 * Idempotent on `id` (`onConflictDoNothing`) so seeders can call it repeatedly
 * without duplicating rows. Returns the song id.
 */
export async function createSongRow(input: CreateSongRowInput): Promise<string> {
  const id = input.id ?? crypto.randomUUID();
  await db
    .insert(_songs)
    .values({
      id,
      title: input.title,
      composer: input.composer,
      durationSec: input.durationSec,
      endBeat: input.endBeat,
      source: input.source,
    })
    .onConflictDoNothing();
  return id;
}
