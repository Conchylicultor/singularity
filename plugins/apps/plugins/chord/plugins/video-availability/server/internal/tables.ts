import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import { EmbedStatusSchema } from "@plugins/integrations/plugins/youtube/core";

// What each source last said about one YouTube video: an observation ledger,
// not a verdict. The verdict is `chord_video_status_v` (views.ts), derived from
// these columns on every read.
//
// Each source owns its three columns and writes only those, so one source can
// never overwrite the other's evidence. A status is null when that source gave
// no answer we could read (never asked, or a code that says nothing); the code
// is kept either way.
//
// Kept in worktree forks and backups (the player's reports cannot be recovered,
// and copying spares every worktree the re-checks); left out of the change feed.
// See the server barrel.
//
// This file is a load-order leaf: it imports no other plugin's tables.

export const _chordVideos = pgTable("chord_videos", {
  /** The parsed YouTube id — the same value `chord_sections.video_id` holds. */
  videoId: text("video_id").primaryKey(),
  oembedStatus: parsedText("oembed_status", EmbedStatusSchema),
  /** The HTTP status oEmbed answered, including the ones that mean nothing to us. */
  oembedCode: integer("oembed_code"),
  oembedCheckedAt: timestamp("oembed_checked_at", { withTimezone: true }),
  playerStatus: parsedText("player_status", EmbedStatusSchema),
  /** The IFrame API `onError` code; null when the player reported playing. */
  playerCode: integer("player_code"),
  playerCheckedAt: timestamp("player_checked_at", { withTimezone: true }),
});
