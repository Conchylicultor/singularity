import { HttpError, implement } from "@plugins/infra/plugins/endpoints/server";
import {
  createSongRow,
  updateSongMeta,
} from "@plugins/apps/plugins/sonata/plugins/library/server";
import { UgFetchError } from "../../core";
import {
  fetchUgTab,
  createUltimateGuitarSong,
  getSongUltimateGuitar,
  updateUltimateGuitarSong,
} from "../../shared/endpoints";
import { fetchUgTabContent } from "./ug-client";
import { songUltimateGuitar } from "./tables";

/** HTTP status for each classified UG fetch failure. */
function statusForKind(kind: UgFetchError["kind"]): number {
  switch (kind) {
    case "invalid-url":
      return 400; // client supplied a bad URL
    case "not-found":
      return 404; // tab id does not exist
    // signature-rejected / bad-request / upstream / malformed-response /
    // network — server-side upstream/integration failures worth surfacing as
    // loud, crash-worthy breakages.
    case "signature-rejected":
    case "bad-request":
    case "upstream":
    case "malformed-response":
    case "network":
      return 502;
  }
}

/**
 * Fetch the raw UG tab for a pasted URL. Maps classified `UgFetchError`s to
 * HTTP statuses; rethrows anything unexpected so it crashes loudly.
 */
export const handleFetchUgTab = implement(fetchUgTab, async ({ body }) => {
  try {
    return await fetchUgTabContent(body.url);
  } catch (err) {
    if (err instanceof UgFetchError) {
      throw new HttpError(statusForKind(err.kind), err.message);
    }
    throw err;
  }
});

/**
 * Create a UG-backed song. Writes the generic song row (library helper) then
 * this source's extension row (the full UgTab). No attachment.
 */
export const handleCreateUltimateGuitarSong = implement(
  createUltimateGuitarSong,
  async ({ body }) => {
    const { durationSec, endBeat, ...tab } = body;
    const id = await createSongRow({
      title: tab.songName,
      composer: tab.artistName || null,
      durationSec,
      endBeat,
    });
    await songUltimateGuitar.upsert(id, tab);
    return { id, title: tab.songName };
  },
);

/** Fetch one song's persisted UgTab, or null. */
export const handleGetSongUltimateGuitar = implement(
  getSongUltimateGuitar,
  async ({ params }) => {
    const row = await songUltimateGuitar.get(params.id);
    if (!row) return null;
    return {
      tabId: row.tabId,
      songName: row.songName,
      artistName: row.artistName,
      type: row.type,
      key: row.key,
      capo: row.capo,
      tuning: row.tuning,
      content: row.content,
      urlWeb: row.urlWeb,
    };
  },
);

/**
 * Persist an edit: upsert the extension row (full UgTab), then sync the parent
 * song's generic metadata (title ← songName, composer ← artistName, recomputed
 * duration/endBeat) via the library helper.
 */
export const handleUpdateUltimateGuitarSong = implement(
  updateUltimateGuitarSong,
  async ({ params, body }) => {
    const { durationSec, endBeat, ...tab } = body;
    await songUltimateGuitar.upsert(params.id, tab);
    await updateSongMeta({
      id: params.id,
      title: tab.songName,
      composer: tab.artistName || null,
      durationSec,
      endBeat,
    });
    return { ok: true as const };
  },
);
