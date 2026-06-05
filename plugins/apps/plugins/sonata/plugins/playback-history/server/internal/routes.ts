import { sql } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { recordPlay } from "../../shared/endpoints";
import { _songPlaybackExt } from "./tables";
import { playbackHistoryLiveResource } from "./resource";

export const handleRecordPlay = implement(recordPlay, async ({ params }) => {
  const now = new Date();
  // Atomic upsert-increment — no read-modify-write race. The FK to sonata_songs
  // makes a play for a non-existent song fail loudly.
  await db
    .insert(_songPlaybackExt)
    .values({ parentId: params.id, playCount: 1, lastPlayedAt: now })
    .onConflictDoUpdate({
      target: _songPlaybackExt.parentId,
      set: {
        playCount: sql`${_songPlaybackExt.playCount} + 1`,
        lastPlayedAt: now,
        updatedAt: now,
      },
    });
  playbackHistoryLiveResource.notify();
  return { ok: true };
});
