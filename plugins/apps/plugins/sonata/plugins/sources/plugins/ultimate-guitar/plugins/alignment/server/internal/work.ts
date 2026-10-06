import { songUltimateGuitar } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/server";
import type { UgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import { ALIGNER_VERSION, sheetHash, type UgAlignmentRow } from "../../core";
import { songUgAlignment } from "./tables";

/** What aligning one song would take right now, decided from its two rows. */
export type AlignmentWork =
  | { kind: "idle"; reason: string }
  | {
      kind: "needed";
      reason: string;
      tab: UgTab;
      videoId: string;
      hash: string;
    };

type AlignmentState = Pick<
  UgAlignmentRow,
  "videoId" | "status" | "errorPermanent" | "record"
>;

/**
 * Whether a song's alignment is out of step with its sheet and video, and why.
 * Pure over the two rows, so the job body and its `onEnded` re-check decide
 * alike.
 *
 * - No video: nothing to align to.
 * - `queued` (a new video or a re-align asked for) or `running` (left
 *   behind by a run that never finished): align.
 * - `failed`: align again unless the failure was permanent for this video.
 * - `aligned` / `weak`: align only when the record no longer matches the
 *   current video, sheet or aligner.
 */
export function decideWork(tab: UgTab, row: AlignmentState): AlignmentWork {
  const videoId = row.videoId;
  if (videoId === null) return { kind: "idle", reason: "no video set" };
  const hash = sheetHash(tab.content);
  const needed = (reason: string): AlignmentWork => ({
    kind: "needed",
    reason,
    tab,
    videoId,
    hash,
  });
  switch (row.status) {
    case "queued":
      return needed("queued");
    case "running":
      return needed("a previous run did not finish");
    case "failed":
      return row.errorPermanent
        ? { kind: "idle", reason: "failed permanently for this video" }
        : needed("retrying a failed alignment");
    case "aligned":
    case "weak": {
      const r = row.record;
      if (r === null) return needed("no record");
      if (r.videoId !== videoId) return needed("the video changed");
      if (r.sheetHash !== hash) return needed("the sheet changed");
      if (r.alignerVersion !== ALIGNER_VERSION)
        return needed("the aligner changed");
      return {
        kind: "idle",
        reason: "already aligned to this sheet and video",
      };
    }
  }
}

/** Read both rows and decide. */
export async function readWork(songId: string): Promise<AlignmentWork> {
  const [tab, row] = await Promise.all([
    songUltimateGuitar.get(songId),
    songUgAlignment.get(songId),
  ]);
  if (tab === undefined) return { kind: "idle", reason: "no UG tab" };
  if (row === undefined) return { kind: "idle", reason: "no video set" };
  return decideWork(
    {
      tabId: tab.tabId,
      songName: tab.songName,
      artistName: tab.artistName,
      type: tab.type,
      key: tab.key,
      capo: tab.capo,
      tuning: tab.tuning,
      content: tab.content,
      urlWeb: tab.urlWeb,
    },
    row,
  );
}
