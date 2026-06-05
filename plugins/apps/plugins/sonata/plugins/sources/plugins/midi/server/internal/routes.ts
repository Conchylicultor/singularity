import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createSongRow,
  songAttachments,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
import { createMidiSong, getSongMidi } from "../../shared/endpoints";
import { songMidi, _songMidiExt } from "./tables";
import { songMidiLiveResource } from "./resource";

/**
 * Create a MIDI-backed song. Writes the generic song row (library helper) then
 * this source's extension row, and links the attachment so the orphan sweep
 * never reclaims the stored bytes. One round trip from the client's importer.
 */
export const handleCreateMidiSong = implement(
  createMidiSong,
  async ({ body }) => {
    const id = await createSongRow({
      title: body.title,
      composer: body.composer,
      durationSec: body.durationSec,
      endBeat: body.endBeat,
    });
    await songMidi.upsert(id, {
      attachmentId: body.attachmentId,
      trackCount: body.trackCount,
    });
    await songAttachments.add(id, [body.attachmentId]);
    songMidiLiveResource.notify();
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
