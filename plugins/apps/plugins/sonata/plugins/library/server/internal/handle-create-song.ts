import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement, HttpError } from "@plugins/infra/plugins/endpoints/server";
import { createSong } from "../../core/endpoints";
import { _songs } from "./tables";
import { songAttachments } from "./schema-attachments";
import { songsLiveResource, toSong } from "./resources";

export const handleCreateSong = implement(createSong, async ({ body }) => {
  const id = crypto.randomUUID();
  await db.insert(_songs).values({
    id,
    title: body.title,
    composer: body.composer,
    midiAttachmentId: body.attachmentId,
    durationSec: body.durationSec,
    endBeat: body.endBeat,
    midiTrackCount: body.midiTrackCount,
  });
  // Link the attachment so the orphan sweep never reclaims this song's MIDI.
  await songAttachments.add(id, [body.attachmentId]);
  songsLiveResource.notify();

  const [row] = await db.select().from(_songs).where(eq(_songs.id, id)).limit(1);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard, no noUncheckedIndexedAccess
  if (!row) throw new HttpError(500, "Failed to retrieve created song");
  return toSong(row);
});
