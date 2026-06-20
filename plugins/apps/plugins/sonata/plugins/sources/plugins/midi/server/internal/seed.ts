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
 * Idempotency is keyed on **MIDI extension presence**, not the song row: this
 * makes the seeder self-heal across the migration that moved MIDI data out of
 * `sonata_songs` (after which the song rows exist but their `sonata_songs_ext_midi`
 * rows do not — so we re-mint the attachment + ext while `createSongRow`'s
 * `onConflictDoNothing` preserves the existing row).
 */
export async function seedMidiStarters(): Promise<void> {
  for (const starter of STARTERS) {
    if (await songMidi.get(starter.id)) continue; // already has MIDI data

    const midi = new Midi();
    // Set tempo BEFORE adding notes: `addNote` converts our absolute-seconds
    // times to ticks through the header tempo, so it must be the final bpm.
    midi.header.setTempo(starter.bpm);
    const track = midi.addTrack();
    for (const note of starter.notes) {
      track.addNote({ midi: note.midi, time: note.time, duration: note.duration });
    }

    const durationSec = Math.max(
      ...starter.notes.map((n) => n.time + n.duration),
    );
    // Quarter-note beats: seconds × (bpm / 60).
    const endBeat = (durationSec * starter.bpm) / 60;

    const bytes = midi.toArray();
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
      contentHash: hashMidiBytes(bytes),
    });
    await songAttachments.add(starter.id, [att.id]);
  }
}
