import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { nullable } from "@plugins/fields/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

/**
 * One song's persisted MIDI data, stored in the `sonata_songs_ext_midi`
 * entity-extension table owned by this source plugin (1:1 with `sonata_songs`,
 * FK CASCADE on song delete), which `server/internal/tables.ts` builds from this
 * shape.
 */
export const songMidiShape = defineExtensionShape({
  key: "songId",
  fields: {
    // Points at the stored `.mid` bytes.
    attachmentId: textField(),
    // The file-derived note-bearing track count shown on the card.
    trackCount: intField(),
    // Absolute path of the watched-folder file this song was imported from.
    // Null = manual import (never touched by the folder watcher); set = folder-
    // imported and the idempotency key for re-import. See the folders sub-plugin.
    sourcePath: nullable(textField()),
    // True when a folder-imported file has disappeared from disk: the song stays
    // (and stays playable from its copied attachment) but is badged "source
    // deleted". Always false for manual imports.
    sourceMissing: boolField(),
    // SHA-256 hex of the raw `.mid` bytes — the content-dedup key. The same file
    // moved to another folder, re-scanned, or re-uploaded collapses into the one
    // song carrying this hash. Null = imported before content-hash dedup existed
    // (backfilled at boot) or its backing attachment file is gone.
    contentHash: nullable(textField()),
  },
  // The dedup key is the server's business (`server/internal/import.ts`); the
  // browser never reads it.
  serverOnly: ["contentHash"],
});
export const SongMidiRowSchema = songMidiShape.schema;
export type SongMidiRow = z.infer<typeof SongMidiRowSchema>;

/** Reactive list of every song's MIDI data (push resource; powers card meta). */
export const songMidiResource = resourceDescriptor<SongMidiRow[]>(
  "sonata-song-midi",
  z.array(SongMidiRowSchema),
  [],
);
