import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import { resetTrackView, upsertTrackView } from "../../shared/endpoints";
import { _trackView } from "./tables";

/**
 * Partial-patch upsert, one row per `trackIds` entry: insert a fresh row
 * (omitted fields take column defaults) or update only the provided columns of
 * an existing one. Lets a mute toggle land without clobbering a custom color and
 * vice-versa. Every track is written inside ONE transaction, so a many-track
 * patch is atomic and the change feed emits it as a single commit.
 */
export const handleUpsertTrackView = implement(
  upsertTrackView,
  async ({ params, body }) => {
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (body.color !== undefined) set.color = body.color;
    if (body.instrument !== undefined) set.instrument = body.instrument;
    if (body.muted !== undefined) set.muted = body.muted;
    if (body.hidden !== undefined) set.hidden = body.hidden;

    await db.transaction(async (tx) => {
      for (const trackId of body.trackIds) {
        await tx
          .insert(_trackView)
          .values({
            songId: params.songId,
            trackId,
            color: body.color ?? null,
            instrument: body.instrument ?? null,
            muted: body.muted ?? false,
            hidden: body.hidden ?? false,
          })
          .onConflictDoUpdate({
            target: [_trackView.songId, _trackView.trackId],
            set,
          });
      }
    });
  },
);

/** Drop every override for a song, restoring palette defaults + audible/visible. */
export const handleResetTrackView = implement(
  resetTrackView,
  async ({ params }) => {
    await db.delete(_trackView).where(eq(_trackView.songId, params.songId));
  },
);
