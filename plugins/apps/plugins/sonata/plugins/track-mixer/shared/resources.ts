import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { TrackViewRowSchema, type TrackViewRow } from "../core/schemas";

export type { TrackViewRow } from "../core/schemas";

/**
 * Flat list of every persisted track-view override across all songs (mirrors
 * the playback-history rollup shape). Consumers filter to the current song
 * client-side; the list is tiny (a handful of rows per song). The row schema +
 * type live in `core/` (single source of truth, shared with the server entity).
 */
export const trackViewResource = resourceDescriptor<TrackViewRow[]>(
  "sonata-track-view",
  z.array(TrackViewRowSchema),
  [],
);
