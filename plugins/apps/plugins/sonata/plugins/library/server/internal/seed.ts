import { Midi } from "@tonejs/midi";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { createAttachment } from "@plugins/infra/plugins/attachments/server";
import { _songs } from "./tables";
import { songAttachments } from "./schema-attachments";
import { STARTERS } from "./starters";

/**
 * Idempotently materialize the bundled starter songs at boot. For each starter
 * not already present, build a MIDI file with `@tonejs/midi`, mint an
 * attachment from its bytes, insert the song row, and link the attachment.
 *
 * Idempotent by stable seed id: existing seeds are skipped (so a restart never
 * mints duplicate attachments), and the insert is `onConflictDoNothing()` as a
 * belt-and-suspenders against a race.
 */
export async function seedStarters(): Promise<void> {
  const existing = new Set(
    (await db.select({ id: _songs.id }).from(_songs)).map((r) => r.id),
  );

  for (const starter of STARTERS) {
    if (existing.has(starter.id)) {
      // Backfill track count for starters seeded before this column existed —
      // all starters are single-track by construction. Cheap no-op once set;
      // does not re-mint the attachment.
      await db
        .update(_songs)
        .set({ midiTrackCount: 1 })
        .where(and(eq(_songs.id, starter.id), isNull(_songs.midiTrackCount)));
      continue;
    }

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

    const att = await createAttachment(
      midi.toArray(),
      `${starter.id}.mid`,
      "audio/midi",
    );
    await db
      .insert(_songs)
      .values({
        id: starter.id,
        title: starter.title,
        composer: starter.composer,
        midiAttachmentId: att.id,
        durationSec,
        endBeat,
        midiTrackCount: midi.tracks.length,
      })
      .onConflictDoNothing();
    await songAttachments.add(starter.id, [att.id]);
  }
}
