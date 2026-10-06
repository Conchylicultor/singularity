import type { LiveRowResult } from "@plugins/network/plugins/live/web";
import type { UgTab } from "@plugins/apps/plugins/sonata/plugins/sources/plugins/ultimate-guitar/plugins/tab/core";
import {
  ALIGNER_VERSION,
  sheetHash,
  type AlignmentPhase,
  type UgAlignmentRow,
} from "../../core";

/**
 * What the Recording section shows, derived from the live row and the open tab.
 * One arm per thing the user can be told; "not loaded yet" is its own arm, so a
 * pending read can never render as "no video".
 */
export type RecordingState =
  | { kind: "loading" }
  | { kind: "unreadable"; message: string }
  | { kind: "no-video" }
  | { kind: "queued"; videoId: string }
  | { kind: "aligning"; videoId: string; phase: AlignmentPhase | null }
  | {
      kind: "aligned";
      videoId: string;
      score: number;
      /** Signed semitones, recording = sheet + transpose, in (−6, +6]. */
      transpose: number;
      capo: number;
    }
  | { kind: "weak"; videoId: string; score: number }
  | {
      kind: "failed";
      videoId: string | null;
      message: string;
      permanent: boolean;
    }
  /** Aligned (or weak) to an earlier sheet, video or aligner, and not re-aligning. */
  | { kind: "out-of-date"; videoId: string };

/** The record's `[0, 12)` transpose as the nearer signed interval. */
export function signedTranspose(transpose: number): number {
  return transpose > 6 ? transpose - 12 : transpose;
}

export function recordingState(
  result: LiveRowResult<UgAlignmentRow>,
  tab: UgTab,
): RecordingState {
  if (result.status === "loading") return { kind: "loading" };
  if (result.status === "error") {
    return { kind: "unreadable", message: result.error.message };
  }
  if (!result.found) return { kind: "no-video" };
  const row = result.row;
  const videoId = row.videoId;
  if (row.status === "failed") {
    return {
      kind: "failed",
      videoId,
      message: row.error ?? "The alignment failed.",
      permanent: row.errorPermanent,
    };
  }
  if (videoId === null) return { kind: "no-video" };
  switch (row.status) {
    case "queued":
      return { kind: "queued", videoId };
    case "running":
      return { kind: "aligning", videoId, phase: row.phase };
    case "aligned":
    case "weak": {
      const record = row.record;
      if (
        record === null ||
        record.videoId !== videoId ||
        record.sheetHash !== sheetHash(tab.content) ||
        record.alignerVersion !== ALIGNER_VERSION
      ) {
        return { kind: "out-of-date", videoId };
      }
      return row.status === "aligned"
        ? {
            kind: "aligned",
            videoId,
            score: record.score,
            transpose: signedTranspose(record.transpose),
            capo: tab.capo,
          }
        : { kind: "weak", videoId, score: record.score };
    }
  }
}

const percent = (score: number) => `${Math.round(score * 100)}%`;

/** "+2 (capo 2)", "−3", "0". */
export function formatTranspose(transpose: number, capo: number): string {
  const signed =
    transpose > 0 ? `+${transpose}` : transpose < 0 ? `−${-transpose}` : "0";
  return capo > 0 ? `${signed} (capo ${capo})` : signed;
}

/** The one-line status, for the collapsed summary and the body alike. */
export function recordingStateLine(state: RecordingState): string {
  switch (state.kind) {
    case "loading":
      return "Loading…";
    case "unreadable":
      return `Could not read the alignment: ${state.message}`;
    case "no-video":
      return "No recording";
    case "queued":
      return "Waiting to align…";
    case "aligning":
      return state.phase === "aligning"
        ? "Aligning the sheet…"
        : "Analysing the recording…";
    case "aligned":
      return `Aligned ${percent(state.score)} · ${formatTranspose(state.transpose, state.capo)} semitones`;
    case "weak":
      return `Needs a better video (${percent(state.score)})`;
    case "failed":
      return `Failed: ${state.message}`;
    case "out-of-date":
      return "Out of date — the sheet changed since it was aligned";
  }
}

/**
 * The state in a word or two, for the collapsed card's header (beside the
 * title, like the other sections' "Off" / "Auto-detect"). The full sentence is
 * {@link recordingStateLine}, in the body.
 */
export function recordingStateSummary(state: RecordingState): string {
  switch (state.kind) {
    case "loading":
      return "Loading…";
    case "unreadable":
      return "Unreadable";
    case "no-video":
      return "No recording";
    case "queued":
    case "aligning":
      return "Aligning…";
    case "aligned":
      return percent(state.score);
    case "weak":
      return "Weak match";
    case "failed":
      return "Failed";
    case "out-of-date":
      return "Out of date";
  }
}
