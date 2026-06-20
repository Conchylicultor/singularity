import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { _songs } from "./tables";

export interface UpdateSongMetaInput {
  id: string;
  title?: string;
  composer?: string | null;
  durationSec?: number;
  endBeat?: number;
}

/**
 * The generic, source-agnostic way to update a `sonata_songs` row's metadata.
 * Companion to `createSongRow`: the library owns all `_songs` mutations, so a
 * source persisting an edit syncs the parent row through here (recomputed
 * duration/endBeat, an edited title) rather than poking the table directly.
 *
 * Only the provided fields are written; pushes the reactive `songsResource` so
 * the gallery (length, title) updates live.
 */
export async function updateSongMeta(input: UpdateSongMetaInput): Promise<void> {
  const patch: Partial<typeof _songs.$inferInsert> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.composer !== undefined) patch.composer = input.composer;
  if (input.durationSec !== undefined) patch.durationSec = input.durationSec;
  if (input.endBeat !== undefined) patch.endBeat = input.endBeat;
  if (Object.keys(patch).length === 0) return;

  await db.update(_songs).set(patch).where(eq(_songs.id, input.id));
}
