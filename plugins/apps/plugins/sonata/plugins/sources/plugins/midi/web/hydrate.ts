import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getAttachmentFile } from "@plugins/infra/plugins/attachments/web";
import { getSongMidi } from "../shared/endpoints";

/**
 * Hydrate a song's MIDI source: resolve its stored attachment, fetch the bytes,
 * and hand back the ArrayBuffer for `setRawMap`. Returns `undefined` for a song
 * that carries no MIDI (so it's skipped in the library's generic collection).
 */
export async function hydrate(songId: string): Promise<ArrayBuffer | undefined> {
  const midi = await fetchEndpoint(getSongMidi, { id: songId });
  if (!midi) return undefined;
  const blob = await fetchEndpoint(getAttachmentFile, { id: midi.attachmentId });
  return blob.arrayBuffer();
}
