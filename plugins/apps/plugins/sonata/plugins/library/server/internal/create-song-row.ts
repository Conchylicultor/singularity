import { db } from "@plugins/database/server";
import { _songs } from "./tables";
import { songsLiveResource } from "./resources";

export interface CreateSongRowInput {
  /** Optional stable id (e.g. a starter's seed id). Defaults to a random UUID. */
  id?: string;
  title: string;
  composer: string | null;
  durationSec: number;
  endBeat: number;
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
    })
    .onConflictDoNothing();
  songsLiveResource.notify();
  return id;
}
