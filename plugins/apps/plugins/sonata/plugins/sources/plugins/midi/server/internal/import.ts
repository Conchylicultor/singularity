import { eq, isNotNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { createAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  createSongRow,
  songAttachments,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
import { deriveMidiSongMeta, parseMidi } from "../../shared/parse";
import { songMidi, _songMidiExt } from "./tables";
import { songMidiLiveResource } from "./resource";

export interface ImportMidiSongInput {
  /** Raw `.mid` file bytes. */
  bytes: Uint8Array;
  /** Original filename — drives the derived song title and the stored attachment name. */
  filename: string;
  /**
   * Absolute path of the watched-folder file this song mirrors. Null/omitted for
   * manual imports (never touched by the folder watcher); set for folder imports
   * and used as the idempotency key.
   */
  sourcePath?: string | null;
  /**
   * When re-importing an edited file, the existing song id to update in place.
   * Skips `createSongRow` and reuses this id so a re-import never spawns a
   * duplicate library row. Omit to create a fresh song.
   */
  existingSongId?: string;
}

/**
 * The reusable, server-side MIDI import path. Parses the bytes, derives the song
 * metadata, copies the bytes into the attachment store, and writes (or updates)
 * the generic song row plus this source's `sonata_songs_ext_midi` row. Used by
 * the folder-watcher job; the HTTP route and the boot seeder use the lower-level
 * primitives directly since they already hold the metadata.
 *
 * Failures (corrupt MIDI, IO) propagate loudly so the caller's job retries and
 * surfaces them — nothing is swallowed.
 *
 * Returns the song id (the freshly created one, or `existingSongId` on re-import).
 */
export async function importMidiSong({
  bytes,
  filename,
  sourcePath = null,
  existingSongId,
}: ImportMidiSongInput): Promise<string> {
  // Parse to validate the file loudly before we persist anything (`parseMidi`
  // throws on malformed input). The Score itself is recomposed client-side on
  // hydrate; here we only need it to fail fast and to derive the metadata.
  parseMidi(bytes);
  const meta = deriveMidiSongMeta(bytes, filename);

  const att = await createAttachment(bytes, filename, "audio/midi");

  const id =
    existingSongId ??
    (await createSongRow({
      title: meta.title,
      composer: null,
      durationSec: meta.durationSec,
      endBeat: meta.endBeat,
    }));

  await songMidi.upsert(id, {
    attachmentId: att.id,
    trackCount: meta.trackCount,
    sourcePath,
    sourceMissing: false,
  });

  // `.set` (not `.add`): replace the song's linked attachments with just the new
  // one so a re-import of an edited file leaves no orphaned previous attachment.
  await songAttachments.set(id, [att.id]);

  songMidiLiveResource.notify();
  return id;
}

/**
 * Look up the folder-imported song for a watched-file path, or null. The
 * idempotency lookup the watcher uses to decide create-vs-update.
 */
export async function getSongMidiBySourcePath(
  sourcePath: string,
): Promise<{ songId: string; sourceMissing: boolean } | null> {
  const [row] = await db
    .select()
    .from(_songMidiExt)
    .where(eq(_songMidiExt.sourcePath, sourcePath))
    .limit(1);
  if (!row) return null;
  return { songId: row.parentId, sourceMissing: row.sourceMissing };
}

/**
 * Every folder-imported song (i.e. `source_path is not null`) with its current
 * `sourceMissing` flag. The watcher's reconcile uses this to detect drift the
 * other way: a song whose backing file is gone from a still-watched folder.
 * Manual imports (null `sourcePath`) are excluded and never enumerated here.
 */
export async function listFolderImportedSongs(): Promise<
  { songId: string; sourcePath: string; sourceMissing: boolean }[]
> {
  const rows = await db
    .select()
    .from(_songMidiExt)
    .where(isNotNull(_songMidiExt.sourcePath));
  return rows.map((row) => ({
    songId: row.parentId,
    // Narrow: the `isNotNull` filter guarantees a non-null path here.
    sourcePath: row.sourcePath as string,
    sourceMissing: row.sourceMissing,
  }));
}

/**
 * Flip a single song's `source_missing` flag (file vanished → true, file came
 * back → false) without rewriting the other columns, then push the change to
 * clients. A trivial targeted UPDATE — used by the watcher's delete/restore path.
 */
export async function setSourceMissing(
  songId: string,
  missing: boolean,
): Promise<void> {
  await db
    .update(_songMidiExt)
    .set({ sourceMissing: missing })
    .where(eq(_songMidiExt.parentId, songId));
  songMidiLiveResource.notify();
}
