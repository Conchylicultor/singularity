import { boolean, integer, text } from "drizzle-orm/pg-core";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import { defineExtension } from "@plugins/infra/plugins/entity-extensions/server";

// This source's persisted data for a song, attached to the library's
// `sonata_songs` row via the entity-extensions primitive (1:1 side-table, FK
// CASCADE on song delete). Owned here so the library schema stays source-agnostic
// and a new source needs zero library changes. Table: `sonata_songs_ext_midi`.
export const songMidi = defineExtension(_songs, "midi", {
  attachmentId: text("attachment_id").notNull(),
  trackCount: integer("track_count").notNull(),
  // Absolute path of the watched-folder file this song was imported from.
  // Null = manual import (never touched by the folder watcher); set = folder-
  // imported and the idempotency key for re-import. See the folders sub-plugin.
  sourcePath: text("source_path"),
  // True when a folder-imported file has disappeared from disk: the song stays
  // (and stays playable from its copied attachment) but is badged "source
  // deleted". Always false for manual imports.
  sourceMissing: boolean("source_missing").notNull().default(false),
  // SHA-256 hex of the raw `.mid` bytes — the content-dedup key. The same file
  // moved to another folder, re-scanned, or re-uploaded collapses into the one
  // song carrying this hash. Null = imported before content-hash dedup existed
  // (backfilled at boot) or its backing attachment file is gone.
  contentHash: text("content_hash"),
});
export const _songMidiExt = songMidi.table; // drizzle-kit discovery
