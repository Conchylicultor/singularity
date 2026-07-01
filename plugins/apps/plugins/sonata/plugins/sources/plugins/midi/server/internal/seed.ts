import { Midi } from "@tonejs/midi";
import { like, inArray } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { createAttachment } from "@plugins/infra/plugins/attachments/server";
import {
  _songs,
  createSongRow,
  songAttachments,
  updateSongMeta,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
import { MIDI_SOURCE_ID } from "../../shared/constants";
import { songMidi } from "./tables";
import { hashMidiBytes } from "./import";
import { STARTERS } from "./starters";

/** Id prefix for songs this seeder owns. Only this seeder mints `seed-*` ids. */
const SEED_ID_PREFIX = "seed-";

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
 *
 * Each starter is multi-track: one MIDI track per `StarterTrack` (its own
 * piano-roll color + audio route), and a starter's optional time signature is
 * written to the header so the notation lens bars it correctly. A two-hand piano
 * piece (left/right tracks) engraves as a real grand staff.
 */
export async function seedMidiStarters(): Promise<void> {
  for (const starter of STARTERS) {
    const midi = new Midi();
    // Self-describing title (also folds the title into the content hash, so a
    // title-only edit re-mints on the next boot).
    midi.header.name = starter.title;
    // Set tempo BEFORE adding notes: `addNote` converts our absolute-seconds
    // times to ticks through the header tempo, so it must be the final bpm.
    midi.header.setTempo(starter.bpm);
    // Register the time signature (defaults to 4/4 when omitted) so `parseMidi`
    // reads it back for barlines / the notation grand staff.
    if (starter.timeSig) {
      const [numerator, denominator] = starter.timeSig;
      midi.header.timeSignatures.push({
        ticks: 0,
        timeSignature: [numerator, denominator],
      });
      midi.header.update();
    }

    for (const trackDef of starter.tracks) {
      const track = midi.addTrack();
      if (trackDef.name != null) track.name = trackDef.name;
      if (trackDef.program != null) track.instrument.number = trackDef.program;
      for (const note of trackDef.notes) {
        track.addNote({
          midi: note.midi,
          time: note.time,
          duration: note.duration,
          // @tonejs/midi velocity is normalised 0–1; our StarterNote is 0–127.
          ...(note.velocity != null ? { velocity: note.velocity / 127 } : {}),
        });
      }
    }

    const bytes = midi.toArray();
    const contentHash = hashMidiBytes(bytes);

    // Up to date already → nothing to do. A drift (new/edited starter, or the
    // legacy ext-less row) falls through and (re-)mints the attachment + ext.
    const existing = await songMidi.get(starter.id);
    if (existing?.contentHash === contentHash) continue;

    // Score length spans every track's notes.
    const durationSec = Math.max(
      ...starter.tracks.flatMap((t) => t.notes.map((n) => n.time + n.duration)),
    );
    // Quarter-note beats: seconds × (bpm / 60).
    const endBeat = (durationSec * starter.bpm) / 60;

    const att = await createAttachment(bytes, `${starter.id}.mid`, "audio/midi");
    // `createSongRow` inserts only when absent (onConflictDoNothing), so for a
    // starter whose id already exists but whose definition changed (edited
    // title / tempo / notes → new content hash) the row metadata would go stale.
    // Make STARTERS authoritative over metadata too: sync it after ensuring the
    // row exists. (No-op on a fresh insert; corrects a drifted row.)
    await createSongRow({
      id: starter.id,
      title: starter.title,
      composer: starter.composer,
      durationSec,
      endBeat,
      source: MIDI_SOURCE_ID,
    });
    await updateSongMeta({
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

/**
 * Make `STARTERS` authoritative: delete managed seed songs whose id is no longer
 * in `STARTERS`, so removing or renaming a starter propagates on the next boot
 * instead of leaving an orphaned row behind. Managed = the `seed-` id prefix,
 * which only this seeder ever mints.
 *
 * Deletes the `sonata_songs` row directly (as the library's own delete handler
 * does); FK CASCADE reclaims the per-source ext row and the song↔attachment link,
 * and the now-unreferenced attachment file is swept by the hourly orphan sweep.
 *
 * Reconcile removed ids only (diff against the static `STARTERS` list), so the
 * order relative to `seedMidiStarters()` is immaterial.
 */
export async function reconcileSeededStarters(): Promise<void> {
  const rows = await db
    .select({ id: _songs.id })
    .from(_songs)
    .where(like(_songs.id, `${SEED_ID_PREFIX}%`));

  const wanted = new Set(STARTERS.map((s) => s.id));
  const stale = rows.map((r) => r.id).filter((id) => !wanted.has(id));
  if (stale.length === 0) return;

  await db.delete(_songs).where(inArray(_songs.id, stale));
}
