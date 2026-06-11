import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { createMidiSong, getSongMidi } from "../../shared/endpoints";
import { _songMidiExt } from "./tables";
import { createMidiSongFromAttachment } from "./import";

/**
 * Create a MIDI-backed song from the client's already-uploaded attachment.
 * Funnels through the shared import core, which hashes the bytes and dedupes:
 * re-uploading a file already in the library returns its existing song rather
 * than a duplicate. `id` may therefore be an existing song's id — the client's
 * `openSong` opens whichever song this content belongs to.
 */
export const handleCreateMidiSong = implement(
  createMidiSong,
  async ({ body }) => {
    const id = await createMidiSongFromAttachment({
      attachmentId: body.attachmentId,
      trackCount: body.trackCount,
      meta: {
        title: body.title,
        composer: body.composer,
        durationSec: body.durationSec,
        endBeat: body.endBeat,
      },
    });
    return { id, title: body.title };
  },
);

/** Fetch one song's MIDI data (attachment + track count), or null. */
export const handleGetSongMidi = implement(getSongMidi, async ({ params }) => {
  const [row] = await db
    .select()
    .from(_songMidiExt)
    .where(eq(_songMidiExt.parentId, params.id))
    .limit(1);
  if (!row) return null;
  return { attachmentId: row.attachmentId, trackCount: row.trackCount };
});
