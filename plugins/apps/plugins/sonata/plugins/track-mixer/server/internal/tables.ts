import {
  defineEntity,
  defaultNow,
} from "@plugins/infra/plugins/entities/server";
import { _songs } from "@plugins/apps/plugins/sonata/plugins/library/server";
import {
  trackViewFields,
  TRACK_VIEW_SERVER_ONLY,
} from "../../core/schemas";

/**
 * Per-(song, track) view override. 1:many over a song (one row per track), so
 * this is a plain table with a compound PK — NOT an entity-extension (those are
 * strictly 1:1 on the parent id). The FK cascades on song delete so overrides
 * are reclaimed with their song. `trackId` is the Score's `TrackMeta.id` (e.g.
 * `t0`, or `L0:t0` for a merged multi-source score). The table + wire schema
 * both derive from the single `trackViewFields` record (core); the timestamps
 * stay in the DDL but are kept off the wire.
 */
export const trackView = defineEntity("sonata_track_view", trackViewFields, {
  primaryKey: ["songId", "trackId"],
  serverOnly: TRACK_VIEW_SERVER_ONLY,
  columns: {
    songId: {
      references: { column: () => _songs.id, onDelete: "cascade" },
    },
    muted: { default: false },
    hidden: { default: false },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
});

// drizzle-kit schema-glob discovery. Name kept so the barrel re-export and the
// routes referencing the table don't churn.
export const _trackView = trackView.table;
