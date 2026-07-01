import { Midi } from "@tonejs/midi";
import { createAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  createSongRow,
  songAttachments,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
import { songMidi } from "./tables";
import { hashMidiBytes } from "./import";
import { STARTERS } from "./starters";

/**
 * Idempotently materialize the bundled MIDI starter songs at boot. Owned by the
 * MIDI source (not the library) since starters are inherently source-specific —
 * a future source seeds its own.
 *
 * Idempotency is **content-keyed**: each starter's MIDI is rebuilt and hashed,
 * and we skip only when the stored `contentHash` already matches. That both
 * self-heals across the migration that moved MIDI data out of `sonata_songs`
 * (song row present, ext row absent → hashes can't match → re-mint) AND makes a
 * starter's definition the source of truth — editing a starter's notes re-mints
 * its seed on the next boot instead of silently keeping the stale MIDI.
 * `createSongRow`'s `onConflictDoNothing` preserves the existing song row.
 */
export async function seedMidiStarters(): Promise<void> {
  for (const starter of STARTERS) {
    const midi = new Midi();
    // Set tempo BEFORE adding notes: `addNote` converts our absolute-seconds
    // times to ticks through the header tempo, so it must be the final bpm.
    midi.header.setTempo(starter.bpm);
    const track = midi.addTrack();
    for (const note of starter.notes) {
      track.addNote({ midi: note.midi, time: note.time, duration: note.duration });
    }

    const bytes = midi.toArray();
    const contentHash = hashMidiBytes(bytes);

    // Up to date already → nothing to do. A drift (new/edited starter, or the
    // legacy ext-less row) falls through and (re-)mints the attachment + ext.
    const existing = await songMidi.get(starter.id);
    if (existing?.contentHash === contentHash) continue;

    const durationSec = Math.max(
      ...starter.notes.map((n) => n.time + n.duration),
    );
    // Quarter-note beats: seconds × (bpm / 60).
    const endBeat = (durationSec * starter.bpm) / 60;

    const att = await createAttachment(bytes, `${starter.id}.mid`, "audio/midi");
    await createSongRow({
      id: starter.id,
      title: starter.title,
      composer: starter.composer,
      durationSec,
      endBeat,
    });
    await songMidi.upsert(starter.id, {
      attachmentId: att.id,
      trackCount: midi.tracks.length,
      contentHash,
    });
    await songAttachments.add(starter.id, [att.id]);
  }
}
