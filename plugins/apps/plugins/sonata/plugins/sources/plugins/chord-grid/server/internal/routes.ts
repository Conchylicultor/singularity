import { eq } from "drizzle-orm";
import { db } from "@plugins/database/server";
import { implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createSongRow,
  updateSongMeta,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
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
 * generic metadata (title + recomputed duration/endBeat) via the library helper.
 */
export const handleUpdateChordGridSong = implement(
  updateChordGridSong,
  async ({ params, body }) => {
    await songChordGrid.upsert(params.id, {
      chordText: body.chordText,
    });
    await updateSongMeta({
      id: params.id,
      title: body.title,
      durationSec: body.durationSec,
      endBeat: body.endBeat,
    });
    return { ok: true as const };
  },
);
