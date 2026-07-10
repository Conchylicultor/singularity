import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createSongRow,
  updateSongMeta,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
import { CHORD_GRID_SOURCE_ID } from "../../shared/constants";
import {
  createChordGridSong,
  getSongChordGrid,
  updateChordGridSong,
} from "../../shared/endpoints";
import { songChordGrid, _songChordGridExt } from "./tables";

/**
 * Create a chord-grid–backed song. Writes the generic song row (library helper)
 * then this source's extension row. No attachment, so no `songAttachments` link.
 */
export const handleCreateChordGridSong = implement(
  createChordGridSong,
  async ({ body }) => {
    const id = await createSongRow({
      title: body.title,
      composer: body.composer,
      durationSec: body.durationSec,
      endBeat: body.endBeat,
      source: CHORD_GRID_SOURCE_ID,
    });
    await songChordGrid.upsert(id, {
      chordText: body.chordText,
    });
    return { id, title: body.title };
  },
);

/** Fetch one song's chord-grid data, or null. */
export const handleGetSongChordGrid = implement(
  getSongChordGrid,
  async ({ params }) => {
    const [row] = await db
      .select()
      .from(_songChordGridExt)
      .where(eq(_songChordGridExt.parentId, params.id))
      .limit(1);
    if (!row) return null;
    return {
      chordText: row.chordText,
    };
  },
);

/**
 * Persist an edit: upsert the extension row, then sync the parent song's
 * derived metrics (recomputed duration/endBeat) via the library helper. The
 * title is NOT synced here — it is library-owned and patched separately through
 * `PATCH /api/sonata/songs/:id`.
 */
export const handleUpdateChordGridSong = implement(
  updateChordGridSong,
  async ({ params, body }) => {
    await songChordGrid.upsert(params.id, {
      chordText: body.chordText,
    });
    await updateSongMeta({
      id: params.id,
      durationSec: body.durationSec,
      endBeat: body.endBeat,
    });
    return { ok: true as const };
  },
);
