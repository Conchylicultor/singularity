import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { boolField } from "@plugins/fields/plugins/bool/plugins/config/core";
import { defineExtensionShape } from "@plugins/infra/plugins/entity-extensions/core";

/**
 * One song's key-source mode. When `enabled`, the song's authored key (MIDI
 * header) is ignored and the key is auto-detected from the notes instead — see
 * the `key-mode` plugin's observer, which feeds this into the shell's score
 * pipeline. Stored in the `sonata_songs_ext_key_auto_detect` entity-extension
 * table (1:1 per song; an absent row reads as `false`), which
 * `server/internal/tables.ts` builds from this shape.
 */
export const keyAutoDetectShape = defineExtensionShape({
  key: "songId",
  fields: { enabled: boolField() },
});
export const KeyAutoDetectRowSchema = keyAutoDetectShape.schema;
export type KeyAutoDetectRow = z.infer<typeof KeyAutoDetectRowSchema>;

/** Reactive list of every song's key-auto-detect setting (push resource). */
export const keyAutoDetectResource = resourceDescriptor<KeyAutoDetectRow[]>(
  "sonata-key-auto-detect",
  z.array(KeyAutoDetectRowSchema),
  [],
);
