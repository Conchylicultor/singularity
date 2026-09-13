import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";
import { keyAutoDetectShape } from "../../shared/resources";

// Per-song key-source override attached to the library's `sonata_songs` row via
// the entity-extensions primitive (1:1 side-table, FK CASCADE on song delete).
// `enabled` = ignore the authored (MIDI) key and auto-detect from notes instead.
// An absent row reads as `false` (trust the authored key). Owned here so the
// library schema stays stable and this feature is independently composable.
// Table: `sonata_songs_ext_key_auto_detect`.
export const songKeyAutoDetect = defineExtension(
  _songs,
  "key_auto_detect",
  keyAutoDetectShape,
  {
    columns: { enabled: { default: false } },
  },
);
export const _songKeyAutoDetectExt = songKeyAutoDetect.table; // drizzle-kit discovery
